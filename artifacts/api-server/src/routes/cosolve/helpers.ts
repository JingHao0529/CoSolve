import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, auditEventsTable, complaintsTable } from "@workspace/db";

export const makeId = (prefix: string): string =>
  `${prefix}_${randomUUID().slice(0, 8)}`;

export const serializeComplaint = (
  row: typeof complaintsTable.$inferSelect,
) => ({
  id: row.id,
  customerId: row.customerId,
  customerName: row.customerName,
  source: row.source,
  subject: row.subject,
  message: row.message,
  category: row.category,
  rootCause: row.rootCause,
  urgency: row.urgency,
  status: row.status,
  confidence: row.confidence,
  sentiment: row.sentiment,
  orderId: row.orderId,
  orderValue: row.orderValue,
  recommendation: row.recommendation,
  recommendedAmount: row.recommendedAmount,
  responseDraft: row.responseDraft,
  resolutionNote: row.resolutionNote ?? "",
  assignedTo: row.assignedTo,
  createdAt: row.createdAt.toISOString(),
  rating: row.rating,
});

export const serializeEvent = (
  event: typeof auditEventsTable.$inferSelect,
) => ({
  ...event,
  createdAt: event.createdAt.toISOString(),
});

export async function addAuditEvent(
  caseId: string,
  action: string,
  actor: string,
  details: string,
): Promise<void> {
  await db.insert(auditEventsTable).values({
    id: makeId("log"),
    caseId,
    action,
    actor,
    details,
  });
}

export async function findComplaint(id: string) {
  const [row] = await db
    .select()
    .from(complaintsTable)
    .where(eq(complaintsTable.id, id))
    .limit(1);
  return row;
}

export async function recentComplaintEvents(caseId: string) {
  const events = await db
    .select()
    .from(auditEventsTable)
    .where(eq(auditEventsTable.caseId, caseId))
    .orderBy(desc(auditEventsTable.createdAt));
  return events.map(serializeEvent);
}

export const isoDate = (value: Date): string => value.toISOString();
