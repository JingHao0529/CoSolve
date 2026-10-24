import { createInsertSchema } from "drizzle-zod";
import { pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const compensationsTable = pgTable("cosolve_compensations", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  type: text("type").notNull(),
  amount: real("amount").notNull().default(0),
  status: text("status").notNull().default("Pending approval"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
});

export const compensationAdjustmentsTable = pgTable("cosolve_compensation_adjustments", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  compensationId: text("compensation_id").notNull(),
  baseType: text("base_type").notNull(),
  baseAmount: real("base_amount").notNull(),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  amountDelta: real("amount_delta").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull().default("Pending review"),
  requestedBy: text("requested_by").notNull(),
  reviewer: text("reviewer"),
  reviewNote: text("review_note"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertCompensationSchema = createInsertSchema(compensationsTable).omit({
  id: true,
  date: true,
});
export type InsertCompensation = z.infer<typeof insertCompensationSchema>;
export type Compensation = typeof compensationsTable.$inferSelect;
export const insertCompensationAdjustmentSchema = createInsertSchema(
  compensationAdjustmentsTable,
).omit({
  id: true,
  date: true,
  reviewedAt: true,
});
export type InsertCompensationAdjustment = z.infer<
  typeof insertCompensationAdjustmentSchema
>;
export type CompensationAdjustment =
  typeof compensationAdjustmentsTable.$inferSelect;
