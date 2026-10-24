import { desc, eq, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ListAuditLogResponse } from "@workspace/api-zod";
import { auditEventsTable, complaintsTable, db } from "@workspace/db";
import { serializeEvent } from "./helpers";

const router: IRouter = Router();

router.get("/audit-log", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ event: auditEventsTable })
    .from(auditEventsTable)
    .leftJoin(complaintsTable, eq(auditEventsTable.caseId, complaintsTable.id))
    .where(or(
      eq(auditEventsTable.caseId, "workspace"),
      eq(complaintsTable.sentiment, "Negative"),
    ))
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(100);
  res.json(ListAuditLogResponse.parse(rows.map(row => serializeEvent(row.event))));
});

export default router;
