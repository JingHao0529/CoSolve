import { and, eq, inArray, sql } from "drizzle-orm";
import {
  auditEventsTable, complaintImportsTable, complaintsTable, compensationAdjustmentsTable,
  compensationsTable, customersTable, db,
} from "@workspace/db";
import { makeId } from "./helpers";

export async function deleteNonnegativeCases(options: {
  ids?: string[];
  actor: string;
  reason: string;
  confirmedSentiment?: "Positive" | "Neutral";
}) {
  if (options.ids && !options.ids.length) return { deletedCount: 0, approvedCount: 0, approvedAmount: 0 };
  if (options.confirmedSentiment && !options.ids?.length) throw new Error("A reclassification cleanup requires explicit case IDs.");
  return db.transaction(async tx => {
    const filters = options.confirmedSentiment ? [] : [sql`lower(${complaintsTable.sentiment}) <> 'negative'`];
    if (options.ids) filters.push(inArray(complaintsTable.id, options.ids) as typeof filters[number]);
    const cases = await tx.select({ id: complaintsTable.id, customerId: complaintsTable.customerId })
      .from(complaintsTable).where(and(...filters)).orderBy(complaintsTable.id).for("update");
    if (!cases.length) return { deletedCount: 0, approvedCount: 0, approvedAmount: 0 };
    const ids = cases.map(row => row.id);
    const [pendingEmail] = await tx.select({ id: auditEventsTable.id }).from(auditEventsTable)
      .where(and(inArray(auditEventsTable.caseId, ids), eq(auditEventsTable.action, "Customer email sending"))).limit(1);
    if (pendingEmail) throw new Error("Check the pending Gmail send before deleting its case.");
    const [approved] = await tx.select({
      count: sql<number>`count(*)::int`,
      amount: sql<number>`coalesce(sum(${compensationsTable.amount}),0)::float8`,
    }).from(compensationsTable)
      .where(and(inArray(compensationsTable.caseId, ids), eq(compensationsTable.status, "Approved")));
    await tx.delete(compensationAdjustmentsTable).where(inArray(compensationAdjustmentsTable.caseId, ids));
    await tx.delete(compensationsTable).where(inArray(compensationsTable.caseId, ids));
    await tx.delete(auditEventsTable).where(inArray(auditEventsTable.caseId, ids));
    await tx.delete(complaintImportsTable).where(inArray(complaintImportsTable.complaintId, ids));
    await tx.delete(complaintsTable).where(inArray(complaintsTable.id, ids));
    const customerIds = [...new Set(cases.map(row => row.customerId))];
    await tx.update(customersTable).set({
      complaintCount: sql`(select count(*)::int from ${complaintsTable} where ${complaintsTable.customerId} = ${customersTable.id})`,
    }).where(inArray(customersTable.id, customerIds));
    const approvedCount = Number(approved?.count ?? 0);
    const approvedAmount = Number(approved?.amount ?? 0);
    await tx.insert(auditEventsTable).values({
      id: makeId("log"), caseId: "workspace", actor: options.actor,
      action: "Non-negative reviews removed",
      details: `${options.reason} Permanently removed ${ids.length} cases with positive, neutral, or unknown AI sentiment, including their case audit, compensation, adjustment, and import identity records. Removed ${approvedCount} approved compensation records totaling ${approvedAmount.toFixed(2)}. Customer profiles and orders were retained.`,
    });
    return { deletedCount: ids.length, approvedCount, approvedAmount };
  });
}
