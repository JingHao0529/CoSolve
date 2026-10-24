import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const complaintsTable = pgTable("cosolve_complaints", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull().default(""),
  source: text("source").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  category: text("category").notNull().default("Unclassified"),
  rootCause: text("root_cause").notNull().default("Needs investigation"),
  urgency: text("urgency").notNull().default("Medium"),
  status: text("status").notNull().default("New"),
  confidence: real("confidence").notNull().default(0),
  sentiment: text("sentiment").notNull().default("Unknown"),
  orderId: text("order_id").notNull().default(""),
  orderValue: real("order_value").notNull().default(0),
  recommendation: text("recommendation").notNull().default("AI review pending"),
  recommendedAmount: real("recommended_amount").notNull().default(0),
  responseDraft: text("response_draft").notNull().default(""),
  assignedTo: text("assigned_to").notNull().default("Unassigned"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rating: integer("rating").notNull().default(0),
  resolutionNote: text("resolution_note").notNull().default(""),
});

export const insertComplaintSchema = createInsertSchema(complaintsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type Complaint = typeof complaintsTable.$inferSelect;
