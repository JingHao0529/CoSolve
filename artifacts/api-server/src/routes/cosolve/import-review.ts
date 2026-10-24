import { eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  PreviewComplaintImportBody, PreviewComplaintImportResponse,
  LinkComplaintImportBody, LinkComplaintImportResponse,
} from "@workspace/api-zod";
import { auditEventsTable, complaintImportsTable, complaintsTable, db } from "@workspace/db";
import { makeId, serializeComplaint } from "./helpers";
import { complaintImportKey, isLegacyImportCandidate } from "./import-dedup";
import { resolveStaffIdentity } from "./staff-auth";

const router: IRouter = Router();

router.post("/complaint-imports/preview", async (req, res): Promise<void> => {
  if (!await resolveStaffIdentity(req)) {
    res.status(401).json({ error: "Sign in to review complaint imports." });
    return;
  }
  const parsed = PreviewComplaintImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = parsed.data.rows.map(row => ({ ...row, imported: true }));
  const keys = rows.map(row => complaintImportKey(row)!);
  // One read-only snapshot keeps the review internally consistent.
  const result = await db.transaction(async tx => {
    const tracked = await tx.select({ key: complaintImportsTable.key, complaint: complaintsTable })
      .from(complaintImportsTable)
      .innerJoin(complaintsTable, eq(complaintsTable.id, complaintImportsTable.complaintId))
      .where(inArray(complaintImportsTable.key, keys));
    const existing = new Map(tracked.map(row => [row.key, row.complaint]));
    const cases = await tx.select().from(complaintsTable);
    return rows.map((row, index) => {
      const duplicate = existing.get(keys[index]);
      return duplicate
        ? { duplicate: true, existingCase: serializeComplaint(duplicate), candidates: [] }
        : { duplicate: false, candidates: cases.filter(candidate => isLegacyImportCandidate(row, candidate)).map(serializeComplaint) };
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(PreviewComplaintImportResponse.parse(result));
});

router.post("/complaint-imports/link", async (req, res): Promise<void> => {
  const actor = await resolveStaffIdentity(req);
  if (!actor) {
    res.status(401).json({ error: "Sign in to link complaint imports." });
    return;
  }
  const parsed = LinkComplaintImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = { ...parsed.data.row, imported: true };
  const key = complaintImportKey(row)!;
  const result = await db.transaction(async tx => {
    // The same lock as intake serializes linking against other links and imports.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    const [tracked] = await tx.select().from(complaintImportsTable)
      .where(eq(complaintImportsTable.key, key));
    if (tracked && tracked.complaintId !== parsed.data.caseId) return undefined;
    const [candidate] = await tx.select().from(complaintsTable)
      .where(eq(complaintsTable.id, parsed.data.caseId)).for("update");
    if (!candidate || (!tracked && !isLegacyImportCandidate(row, candidate))) return undefined;
    if (!tracked) {
      await tx.insert(complaintImportsTable).values({ key, complaintId: candidate.id });
      await tx.insert(auditEventsTable).values({
        id: makeId("evt"), caseId: candidate.id, action: "Import identity linked",
        actor: actor.id, details: "Manager confirmed a historical CSV row belongs to this existing case. Complaint counts unchanged.",
      });
    }
    return candidate;
  });
  if (!result) {
    res.status(409).json({ error: "The identity is linked to another case or this case no longer matches. Preview the file again." });
    return;
  }
  res.json(LinkComplaintImportResponse.parse({ ...serializeComplaint(result), duplicate: true }));
});

export default router;
