import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetCustomerParams,
  GetCustomerResponse,
  ListCustomersResponse,
} from "@workspace/api-zod";
import {
  compensationsTable,
  complaintsTable,
  customersTable,
  db,
  ordersTable,
} from "@workspace/db";
import { serializeComplaint } from "./helpers";

const router: IRouter = Router();

router.get("/customers", async (_req, res): Promise<void> => {
  const activeCustomers = await db.select({ customerId: complaintsTable.customerId }).from(complaintsTable)
    .where(eq(complaintsTable.sentiment, "Negative"));
  const ids = [...new Set(activeCustomers.map(row => row.customerId))];
  const customers = ids.length ? await db.select().from(customersTable).where(inArray(customersTable.id, ids)) : [];
  res.json(ListCustomersResponse.parse(customers));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, params.data.id))
    .limit(1);
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const [hasNegativeCase] = await db.select({ id: complaintsTable.id }).from(complaintsTable)
    .where(and(eq(complaintsTable.customerId, customer.id), eq(complaintsTable.sentiment, "Negative"))).limit(1);
  if (!hasNegativeCase) { res.status(404).json({ error: "Customer not found" }); return; }
  const [orders, complaints, compensationRows] = await Promise.all([
    db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.customerId, customer.id))
      .orderBy(desc(ordersTable.date)),
    db
      .select()
      .from(complaintsTable)
      .where(and(eq(complaintsTable.customerId, customer.id), eq(complaintsTable.sentiment, "Negative")))
      .orderBy(desc(complaintsTable.createdAt)),
    db
      .select({
        id: compensationsTable.id,
        caseId: compensationsTable.caseId,
        type: compensationsTable.type,
        amount: compensationsTable.amount,
        status: compensationsTable.status,
        date: compensationsTable.date,
      })
      .from(compensationsTable)
      .innerJoin(
        complaintsTable,
        eq(compensationsTable.caseId, complaintsTable.id),
      )
      .where(and(eq(complaintsTable.customerId, customer.id), eq(complaintsTable.sentiment, "Negative"))),
  ]);
  const result = GetCustomerResponse.parse({
    ...customer,
    orders: orders.map((order) => ({
      ...order,
      date: order.date.toISOString(),
      items: order.items,
    })),
    complaints: complaints.map(serializeComplaint),
    compensationHistory: compensationRows.map((item) => ({
      ...item,
      date: item.date.toISOString(),
    })),
  });
  res.json(result);
});

export default router;
