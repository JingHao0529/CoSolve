import { eq, ilike, inArray, sql } from "drizzle-orm";
import { auditEventsTable, complaintImportsTable, complaintsTable, customersTable, db, ordersTable } from "@workspace/db";
import { complaintImportKey, isLegacyImportCandidate, receiveComplaintImport, type ComplaintImportInput } from "./import-dedup";
import { createComplaintIntake } from "./intake";
import { makeId, serializeComplaint } from "./helpers";

/** Shared by authenticated HTTP intake and explicitly requested operator imports. */
export function saveComplaintImport(input: ComplaintImportInput) {
  return db.transaction(async tx => receiveComplaintImport(input, {
    lock: async key => { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`); },
    findExisting: async key => {
      const [entry] = await tx.select({ complaint: complaintsTable }).from(complaintImportsTable)
        .innerJoin(complaintsTable, eq(complaintImportsTable.complaintId, complaintsTable.id))
        .where(eq(complaintImportsTable.key, key)).limit(1);
      return entry?.complaint;
    },
    remember: async (key, complaintId) => { await tx.insert(complaintImportsTable).values({ key, complaintId }); },
    create: () => createComplaintIntake(input, {
      findCustomerByEmail: async email => {
        const [customer] = await tx.select({ id: customersTable.id }).from(customersTable)
          .where(ilike(customersTable.email, email)).limit(1);
        return customer;
      },
      createCustomer: async (name, email) => {
        const [customer] = await tx.insert(customersTable).values({
          id: makeId("cus"), name, email, phone: "", lifetimeValue: 0,
          complaintCount: 0, rating: 0, status: "Needs attention",
        }).returning({ id: customersTable.id });
        return customer;
      },
      incrementComplaintCount: async id => {
        await tx.update(customersTable).set({ complaintCount: sql`${customersTable.complaintCount} + 1` })
          .where(eq(customersTable.id, id));
      },
      findOrder: async id => {
        const [order] = await tx.select({ total: ordersTable.total }).from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
        return order;
      },
      insertComplaint: async values => {
        const [complaint] = await tx.insert(complaintsTable).values(values).returning();
        return complaint;
      },
      recordEvent: async (caseId, action, actor, details) => {
        await tx.insert(auditEventsTable).values({ id: makeId("evt"), caseId, action, actor, details });
      },
      makeId,
    }),
  }));
}

export async function previewComplaintImports(rows: ComplaintImportInput[]) {
  const keys = rows.map(row => complaintImportKey({ ...row, imported: true })!);
  return db.transaction(async tx => {
    const tracked = await tx.select({ key: complaintImportsTable.key, complaint: complaintsTable })
      .from(complaintImportsTable).innerJoin(complaintsTable, eq(complaintImportsTable.complaintId, complaintsTable.id))
      .where(inArray(complaintImportsTable.key, keys));
    const existing = new Map(tracked.map(entry => [entry.key, entry.complaint]));
    const cases = await tx.select().from(complaintsTable);
    return rows.map((row, index) => {
      const duplicate = existing.get(keys[index]);
      return duplicate
        ? { duplicate: true, existingCase: serializeComplaint(duplicate), candidates: [] }
        : { duplicate: false, candidates: cases.filter(candidate => isLegacyImportCandidate(row, candidate)).map(serializeComplaint) };
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
