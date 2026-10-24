import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const whatsappMessagesTable = pgTable(
  "cosolve_whatsapp_messages",
  {
    id: text("id").primaryKey(),
    providerMessageId: text("provider_message_id").notNull(),
    senderPhone: text("sender_phone").notNull(),
    senderName: text("sender_name").notNull().default(""),
    message: text("message").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("Pending review"),
    complaintId: text("complaint_id").notNull().default(""),
  },
  (table) => [
    uniqueIndex("cosolve_whatsapp_provider_message_id_idx").on(
      table.providerMessageId,
    ),
  ],
);

export const insertWhatsappMessageSchema = createInsertSchema(
  whatsappMessagesTable,
).omit({ id: true });
export type InsertWhatsappMessage = z.infer<
  typeof insertWhatsappMessageSchema
>;
export type WhatsappMessage = typeof whatsappMessagesTable.$inferSelect;
