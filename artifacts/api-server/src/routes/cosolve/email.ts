import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Response as ExpressResponse } from "express";
import { db, auditEventsTable, complaintsTable } from "@workspace/db";
import { SendComplaintEmailBody, GetComplaintParams, GetEmailSenderResponse } from "@workspace/api-zod";
import { resolveStaffIdentity } from "./staff-auth";
import { buildEmailMessage, emailIdentity } from "./email-message";

const connectors = new ReplitConnectors();
const router: IRouter = Router();
const PENDING = "Customer email sending";
const ACCEPTED = "Customer email submitted";
class EmailError extends Error {
  constructor(public status: number, message: string, public code = "EMAIL_ERROR") { super(message); }
}
async function sender() {
  const response = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile", { method: "GET" });
  if (!response.ok) throw new EmailError(503,
    "The running app cannot access a Gmail sender. Check the Gmail connection in this project's Integrations, then try again. This sender check does not send email.", "GMAIL_NOT_CONNECTED");
  return GetEmailSenderResponse.parse(await response.json()).emailAddress;
}
async function findSent(identity: string) {
  const query = encodeURIComponent(`in:sent rfc822msgid:cosolve-${identity}@cosolve.invalid`);
  const response = await connectors.proxy("google-mail", `/gmail/v1/users/me/messages?q=${query}&maxResults=1`, { method: "GET" });
  if (!response.ok) throw new EmailError(409, "Gmail could not confirm the earlier send. Check the Sent mailbox before sending another message.", "EMAIL_UNCONFIRMED");
  const data = await response.json() as {messages?: {id?: unknown}[]} | null;
  const id = Array.isArray(data?.messages) ? data.messages[0]?.id : undefined;
  return typeof id === "string" && id ? id : undefined;
}
function fail(res: ExpressResponse, error: unknown) {
  if (error instanceof EmailError) res.status(error.status).json({ error: error.message, code: error.code });
  else res.status(503).json({ error: "Gmail is unavailable. No delivery has been confirmed. Try checking the email status again.", code: "GMAIL_UNAVAILABLE" });
}

router.get("/email/sender", async (req, res): Promise<void> => {
  if (!(await resolveStaffIdentity(req))) { res.status(401).json({ error: "Sign in to use Gmail." }); return; }
  try { res.json({ emailAddress: await sender() }); } catch (error) { fail(res, error); }
});

router.post("/complaints/:id/send-email", async (req, res): Promise<void> => {
  const actor = await resolveStaffIdentity(req);
  if (!actor) { res.status(401).json({ error: "Sign in to send a customer email." }); return; }
  const params = GetComplaintParams.safeParse(req.params);
  const parsed = SendComplaintEmailBody.safeParse(req.body);
  if (!params.success || !parsed.success || !parsed.data.message.trim()) {
    res.status(400).json({ error: "Enter a valid recipient email address and a non-empty response." }); return;
  }
  const { recipient } = parsed.data;
  const message = parsed.data.message.replace(/\r\n/g, "\n");
  const identity = emailIdentity(params.data.id, recipient, message);
  const eventId = `email_${identity}`;
  try {
    const [complaint] = await db.select().from(complaintsTable).where(eq(complaintsTable.id, params.data.id)).limit(1);
    if (!complaint) { res.status(404).json({ error: "Complaint not found." }); return; }
    const subject = `CoSolve response: ${Array.from(complaint.subject).slice(0, 120).join("")}`;
    const [existing] = await db.select().from(auditEventsTable).where(eq(auditEventsTable.id, eventId)).limit(1);
    if (existing?.action === ACCEPTED) {
      const receipt = JSON.parse(existing.details);
      res.json({ state: "accepted", messageId: receipt.gmailMessageId, replayed: true }); return;
    }
    const finish = async (gmailMessageId: string) => {
      await db.update(auditEventsTable).set({ action: ACCEPTED, details: JSON.stringify({
        recipient, subject, identity, gmailMessageId, acceptedAt: new Date().toISOString(),
        note: "Gmail accepted the email with the response in its body and a .txt attachment. This is not proof of delivery or reading.",
      }) }).where(eq(auditEventsTable.id, eventId));
    };
    if (existing?.action === PENDING) {
      const found = await findSent(identity);
      if (!found) throw new EmailError(409, "The earlier email is not yet confirmed in Gmail Sent. No automatic resend was attempted. Check again shortly or inspect the Sent mailbox.", "EMAIL_UNCONFIRMED");
      await finish(found);
      res.json({ state: "accepted", messageId: found, replayed: true }); return;
    }
    // Resolve the actual sender before writing an intent; no email is sent during this check.
    const from = await sender();
    const claimed = await db.transaction(async tx => {
      const [current] = await tx.select().from(complaintsTable).where(eq(complaintsTable.id, complaint.id)).for("update");
      if (!current) throw new EmailError(404, "Complaint not found.");
      if (current.status === "Closed") throw new EmailError(409, "This case is closed. Customer communication must be completed before closure.");
      const [duplicate] = await tx.select().from(auditEventsTable).where(eq(auditEventsTable.id, eventId)).limit(1);
      if (duplicate && duplicate.action !== "Customer email rejected") return false;
      const [pending] = await tx.select({ id: auditEventsTable.id }).from(auditEventsTable)
        .where(and(eq(auditEventsTable.caseId, complaint.id), eq(auditEventsTable.action, PENDING))).limit(1);
      if (pending) throw new EmailError(409, "Another email for this case is awaiting Gmail confirmation. Check that email before sending a different message.", "EMAIL_UNCONFIRMED");
      const intent = { caseId: complaint.id, actor: actor.id, action: PENDING,
        details: JSON.stringify({ recipient, subject, identity, note: "Send requested; delivery is not confirmed." }) };
      if (duplicate) await tx.update(auditEventsTable).set(intent).where(eq(auditEventsTable.id, eventId));
      else await tx.insert(auditEventsTable).values({ id: eventId, ...intent });
      await tx.update(complaintsTable).set({ responseDraft: message }).where(eq(complaintsTable.id, complaint.id));
      return true;
    });
    if (!claimed) throw new EmailError(409, "This email is already being processed. Check its status again; no second send was attempted.", "EMAIL_UNCONFIRMED");
    let response: Response;
    try {
      response = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
        method: "POST", body: { raw: buildEmailMessage({ sender: from, recipient, subject, message, caseId: complaint.id, identity }) },
      });
    } catch {
      throw new EmailError(502, "Gmail did not confirm the result. The email may have been sent. Check its status before trying another message.", "EMAIL_UNCONFIRMED");
    }
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        await db.update(auditEventsTable).set({
          action: "Customer email rejected",
          details: JSON.stringify({ recipient, subject, identity, status: response.status, note: "Gmail rejected the send request; no accepted delivery was recorded." }),
        }).where(eq(auditEventsTable.id, eventId));
        throw new EmailError(502, `Gmail rejected the email request (${response.status}). Check sender permissions, recipient details or Gmail limits before retrying.`);
      }
      throw new EmailError(502, "Gmail did not confirm the email. Check its status before sending another message.", "EMAIL_UNCONFIRMED");
    }
    const result = await response.json().catch(() => null) as {id?: unknown} | null;
    if (typeof result?.id !== "string" || !result.id) throw new EmailError(502, "Gmail did not return a receipt. Check the email status; no automatic resend will be made.", "EMAIL_UNCONFIRMED");
    await finish(result.id);
    res.json({ state: "accepted", messageId: result.id, replayed: false });
  } catch (error) { fail(res, error); }
});
export default router;
