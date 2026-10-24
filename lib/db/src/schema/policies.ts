import { createInsertSchema } from "drizzle-zod";
import { boolean, pgTable, real, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const policiesTable = pgTable("cosolve_policies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  maxAmount: real("max_amount").notNull().default(0),
  approvalThreshold: real("approval_threshold").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
});

export const insertPolicySchema = createInsertSchema(policiesTable).omit({
  id: true,
});
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policiesTable.$inferSelect;
