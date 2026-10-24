import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { complaintsTable } from "./complaints";

export const complaintImportsTable = pgTable("cosolve_complaint_imports", {
  key: text("key").primaryKey(),
  complaintId: text("complaint_id").notNull().references(() => complaintsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertComplaintImportSchema = createInsertSchema(complaintImportsTable).omit({ createdAt: true });
export type InsertComplaintImport = z.infer<typeof insertComplaintImportSchema>;
export type ComplaintImport = typeof complaintImportsTable.$inferSelect;
