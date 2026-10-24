import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, real, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const customersTable = pgTable("cosolve_customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  lifetimeValue: real("lifetime_value").notNull().default(0),
  complaintCount: integer("complaint_count").notNull().default(0),
  rating: real("rating").notNull().default(0),
  status: text("status").notNull().default("Healthy"),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
