import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const ordersTable = pgTable("cosolve_orders", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  total: real("total").notNull().default(0),
  status: text("status").notNull().default("Delivered"),
  items: jsonb("items").$type<string[]>().notNull().default([]),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
