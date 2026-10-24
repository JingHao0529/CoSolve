import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, complaintsTable, complaintImportsTable, compensationsTable, compensationAdjustmentsTable, auditEventsTable, customersTable } from "@workspace/db";
import { resolveStaffIdentity } from "./staff-auth";
import { makeId } from "./helpers";

const router: IRouter = Router();
router.delete("/complaints/closed", async (req, res): Promise<void> => {
  const identity = await resolveStaffIdentity(req);
  if (!identity) { res.status(401).json({ error: "Sign in to delete closed cases." }); return; }
  if (req.body?.confirmation !== "DELETE CLOSED CASES") {
    res.status(400).json({ error: "Confirm the permanent deletion by typing DELETE CLOSED CASES." }); return;
  }
  const deletedCount = await db.transaction(async tx => {
    const cases = await tx.select({ id: complaintsTable.id, customerId: complaintsTable.customerId })
      .from(complaintsTable).where(eq(complaintsTable.status, "Closed")).orderBy(complaintsTable.id).for("update");
    if (!cases.length) return 0;
    const ids = cases.map(row => row.id);
    await tx.delete(compensationAdjustmentsTable).where(inArray(compensationAdjustmentsTable.caseId, ids));
    await tx.delete(compensationsTable).where(inArray(compensationsTable.caseId, ids));
    await tx.delete(auditEventsTable).where(inArray(auditEventsTable.caseId, ids));
    await tx.delete(complaintImportsTable).where(inArray(complaintImportsTable.complaintId, ids));
    await tx.delete(complaintsTable).where(inArray(complaintsTable.id, ids));
    for (const customerId of new Set(cases.map(row => row.customerId))) {
      await tx.update(customersTable).set({
        complaintCount: sql`(select count(*)::int from ${complaintsTable} where ${complaintsTable.customerId} = ${customerId})`,
      }).where(eq(customersTable.id, customerId));
    }
    await tx.insert(auditEventsTable).values({
      id: makeId("log"), caseId: "workspace", actor: identity.id, action: "Closed cases deleted",
      details: `Permanently deleted ${ids.length} Closed case files and their linked case audit, compensation, adjustment and import records after explicit confirmation. Customer profiles and orders were retained.`,
    });
    return ids.length;
  });
  res.json({ deletedCount });
});
export default router;
