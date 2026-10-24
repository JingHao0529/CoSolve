import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCaseFromWhatsappMessageParams,
  IgnoreWhatsappMessageParams,
} from "@workspace/api-zod";
import {
  auditEventsTable,
  complaintsTable,
  customersTable,
  db,
  whatsappMessagesTable,
} from "@workspace/db";
import { makeId, serializeComplaint } from "./helpers";

const router: IRouter = Router();
const whatsappWebhookPath = "/api/webhooks/whatsapp";

const toMessageResponse = (row: typeof whatsappMessagesTable.$inferSelect) => ({
  id: row.id,
  customerName: row.senderName || row.senderPhone,
  phone: row.senderPhone,
  message: row.message,
  receivedAt: row.receivedAt.toISOString(),
  status: row.status,
});

function secureStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isValidMetaSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const supplied = Buffer.from(signature.slice("sha256=".length), "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, any>)
    : undefined;
}

function getMessageBody(message: Record<string, any>): string {
  const directText =
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title;
  if (typeof directText === "string" && directText.trim()) {
    const caption =
      typeof message.image?.caption === "string"
        ? message.image.caption.trim()
        : typeof message.document?.caption === "string"
          ? message.document.caption.trim()
          : "";
    return [directText.trim(), caption].filter(Boolean).join("\n");
  }
  const caption =
    typeof message.image?.caption === "string"
      ? message.image.caption.trim()
      : typeof message.video?.caption === "string"
        ? message.video.caption.trim()
        : typeof message.document?.caption === "string"
          ? message.document.caption.trim()
          : "";
  if (caption) return caption;
  return `[Customer sent a WhatsApp ${String(message.type || "message")} message. Attachment content is not available in CoSolve.]`;
}

function extractInboundMessages(payload: unknown) {
  const root = asRecord(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const result: {
    providerMessageId: string;
    phone: string;
    name: string;
    message: string;
    receivedAt: Date;
  }[] = [];

  for (const rawEntry of entries) {
    const entry = asRecord(rawEntry);
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const rawChange of changes) {
      const change = asRecord(rawChange);
      const value = asRecord(change?.value);
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      for (const rawMessage of messages) {
        const message = asRecord(rawMessage);
        if (
          typeof message?.id !== "string" ||
          typeof message?.from !== "string" ||
          !message.id ||
          !message.from
        ) {
          continue;
        }
        const contact = contacts
          .map(asRecord)
          .find((candidate) => candidate?.wa_id === message.from);
        const profileName = contact?.profile?.name;
        const timestampSeconds = Number(message.timestamp);
        const receivedAt = Number.isFinite(timestampSeconds)
          ? new Date(timestampSeconds * 1000)
          : new Date();
        result.push({
          providerMessageId: message.id,
          phone: message.from,
          name: typeof profileName === "string" ? profileName.trim() : "",
          message: getMessageBody(message),
          receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
        });
      }
    }
  }
  return result;
}

router.get("/whatsapp/status", (_req, res): void => {
  const configured = Boolean(
    process.env.META_WHATSAPP_APP_SECRET?.trim() &&
      process.env.META_WHATSAPP_VERIFY_TOKEN?.trim(),
  );
  res.json({
    configured,
    provider: "WhatsApp Business Cloud API",
    callbackPath: whatsappWebhookPath,
    requiredSecretNames: [
      "META_WHATSAPP_APP_SECRET",
      "META_WHATSAPP_VERIFY_TOKEN",
    ],
  });
});

router.get("/whatsapp/messages", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(whatsappMessagesTable)
    .where(eq(whatsappMessagesTable.status, "Pending review"))
    .orderBy(whatsappMessagesTable.receivedAt);
  res.json(rows.map(toMessageResponse));
});

router.post("/whatsapp/messages/:id/create-case", async (req, res): Promise<void> => {
  const params = CreateCaseFromWhatsappMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const caseResult = await db.transaction(async (tx) => {
    const [message] = await tx
      .update(whatsappMessagesTable)
      .set({ status: "Processing" })
      .where(
        and(
          eq(whatsappMessagesTable.id, params.data.id),
          eq(whatsappMessagesTable.status, "Pending review"),
        ),
      )
      .returning();
    if (!message) return undefined;

    const [existingCustomer] = await tx
      .select()
      .from(customersTable)
      .where(eq(customersTable.phone, message.senderPhone))
      .limit(1);
    const customer = existingCustomer
      ? (
          await tx
            .update(customersTable)
            .set({
              complaintCount: sql`${customersTable.complaintCount} + 1`,
            })
            .where(eq(customersTable.id, existingCustomer.id))
            .returning()
        )[0]
      : (
          await tx
            .insert(customersTable)
            .values({
              id: makeId("cus"),
              name: message.senderName || message.senderPhone,
              email: "",
              phone: message.senderPhone,
              lifetimeValue: 0,
              complaintCount: 1,
              rating: 0,
              status: "Needs attention",
            })
            .returning()
        )[0];

    const subjectText = message.message.replace(/\s+/g, " ").trim();
    const subject =
      subjectText.length > 80
        ? `WhatsApp: ${subjectText.slice(0, 77)}…`
        : `WhatsApp: ${subjectText}`;
    const [complaint] = await tx
      .insert(complaintsTable)
      .values({
        id: makeId("CS"),
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        source: "WhatsApp",
        subject,
        message: message.message,
        category: "Unclassified",
        rootCause: "Needs investigation",
        urgency: "Medium",
        status: "New",
        confidence: 0,
        sentiment: "Unknown",
        orderId: "",
        orderValue: 0,
        recommendation: "AI review pending",
        recommendedAmount: 0,
        assignedTo: "Unassigned",
        rating: 0,
      })
      .returning();

    await tx
      .update(whatsappMessagesTable)
      .set({ status: "Case created", complaintId: complaint.id })
      .where(eq(whatsappMessagesTable.id, message.id));
    await tx.insert(auditEventsTable).values({
      id: makeId("log"),
      caseId: complaint.id,
      action: "Complaint received",
      actor: "WhatsApp Business",
      details: "Staff reviewed and converted a WhatsApp message into this case.",
    });
    await tx.insert(auditEventsTable).values({
      id: makeId("log"),
      caseId: complaint.id,
      action: "WhatsApp message accepted",
      actor: "CoSolve staff",
      details: `WhatsApp message ${message.providerMessageId} was reviewed and linked to this case.`,
    });
    return complaint;
  });

  if (!caseResult) {
    const [message] = await db
      .select({ status: whatsappMessagesTable.status })
      .from(whatsappMessagesTable)
      .where(eq(whatsappMessagesTable.id, params.data.id))
      .limit(1);
    res
      .status(message ? 409 : 404)
      .json({ error: message ? "This message has already been reviewed." : "Message not found." });
    return;
  }

  res.status(201).json(serializeComplaint(caseResult));
});

router.post("/whatsapp/messages/:id/ignore", async (req, res): Promise<void> => {
  const params = IgnoreWhatsappMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const message = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(whatsappMessagesTable)
      .set({ status: "Ignored" })
      .where(
        and(
          eq(whatsappMessagesTable.id, params.data.id),
          eq(whatsappMessagesTable.status, "Pending review"),
        ),
      )
      .returning();
    if (!updated) return undefined;
    await tx.insert(auditEventsTable).values({
      id: makeId("log"),
      caseId: `WHATSAPP-${updated.id}`,
      action: "WhatsApp message ignored",
      actor: "CoSolve staff",
      details: `WhatsApp message ${updated.providerMessageId} was dismissed during review.`,
    });
    return updated;
  });
  if (!message) {
    const [existing] = await db
      .select({ id: whatsappMessagesTable.id })
      .from(whatsappMessagesTable)
      .where(eq(whatsappMessagesTable.id, params.data.id))
      .limit(1);
    res
      .status(existing ? 409 : 404)
      .json({ error: existing ? "This message has already been reviewed." : "Message not found." });
    return;
  }
  res.json({ id: message.id, status: "Ignored" });
});

router.get("/webhooks/whatsapp", async (req, res): Promise<void> => {
  const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN?.trim();
  if (!verifyToken) {
    res.status(503).send("WhatsApp webhook is not configured.");
    return;
  }
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (
    mode === "subscribe" &&
    typeof token === "string" &&
    secureStringEquals(token, verifyToken) &&
    typeof challenge === "string"
  ) {
    res.status(200).type("text/plain").send(challenge);
    return;
  }
  res.status(403).send("Webhook verification failed.");
});

router.post("/webhooks/whatsapp", async (req, res): Promise<void> => {
  const appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) {
    res.status(503).json({ error: "WhatsApp webhook is not configured." });
    return;
  }
  if (
    !isValidMetaSignature(
      (req as typeof req & { rawBody?: Buffer }).rawBody,
      req.get("x-hub-signature-256"),
      appSecret,
    )
  ) {
    req.log.warn("Rejected WhatsApp webhook with an invalid signature.");
    res.status(401).json({ error: "Invalid webhook signature." });
    return;
  }

  const messages = extractInboundMessages(req.body);
  let inserted = 0;
  for (const inbound of messages) {
    const saved = await db.transaction(async (tx) => {
      const [insertedMessage] = await tx
        .insert(whatsappMessagesTable)
        .values({
          id: makeId("wam"),
          providerMessageId: inbound.providerMessageId,
          senderPhone: inbound.phone,
          senderName: inbound.name,
          message: inbound.message,
          receivedAt: inbound.receivedAt,
          status: "Pending review",
        })
        .onConflictDoNothing({
          target: whatsappMessagesTable.providerMessageId,
        })
        .returning();
      if (!insertedMessage) return undefined;
      await tx.insert(auditEventsTable).values({
        id: makeId("log"),
        caseId: `WHATSAPP-${insertedMessage.id}`,
        action: "WhatsApp message received for review",
        actor: "WhatsApp Business",
        details: `Provider message ${insertedMessage.providerMessageId} was added to the CoSolve review queue.`,
      });
      return insertedMessage;
    });
    if (!saved) continue;
    inserted += 1;
  }
  req.log.info(
    { received: messages.length, queued: inserted },
    "Processed WhatsApp webhook delivery.",
  );
  res.status(200).json({ received: messages.length, queued: inserted });
});

export default router;
