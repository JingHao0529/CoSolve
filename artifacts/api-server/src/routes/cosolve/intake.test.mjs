import assert from "node:assert/strict";
import test from "node:test";
import { createComplaintIntake } from "./intake.ts";
import { CreateComplaintBody } from "../../../../../lib/api-zod/src/generated/api.ts";

function createStore({ customer = { id: "CUS-test" }, order = { total: 180 } } = {}) {
  const calls = { lookups: [], increments: [], events: [], inserted: null };
  return {
    calls,
    async findCustomerByEmail(email) {
      calls.lookups.push(email);
      return customer;
    },
    async createCustomer(name, email) {
      calls.createdCustomer = { name, email };
      return { id: "CUS-new" };
    },
    async incrementComplaintCount(customerId) {
      calls.increments.push(customerId);
    },
    async findOrder(orderId) {
      calls.orderId = orderId;
      return order;
    },
    async insertComplaint(values) {
      calls.inserted = values;
      return { ...values, createdAt: values.createdAt ?? new Date("2026-01-02T03:04:05.000Z") };
    },
    async recordEvent(...event) {
      calls.events.push(event);
    },
    makeId: (prefix) => `${prefix}_test`,
  };
}

test("manual complaint API schema accepts and retains supplied dates and ratings", () => {
  const receivedAt = "2026-03-15T10:30:00.000Z";
  const parsed = CreateComplaintBody.parse({
    customerName: "Morgan Lee",
    customerEmail: "morgan@example.com",
    source: "Phone",
    subject: "Damaged outer box",
    message: "The box arrived crushed.",
    createdAt: receivedAt,
    rating: 4,
  });

  assert.equal(parsed.createdAt.toISOString(), receivedAt);
  assert.equal(parsed.rating, 4);
  assert.equal(
    CreateComplaintBody.safeParse({
      customerName: "Morgan Lee",
      source: "Phone",
      subject: "Damaged outer box",
      message: "The box arrived crushed.",
      rating: 6,
    }).success,
    false,
  );
});

test("manual complaint creation preserves content, channel, order, date, and rating and records an audit event", async () => {
  const store = createStore();
  const receivedAt = "2026-03-15T10:30:00.000Z";
  const message = "The box arrived crushed, but the product still works.";

  const result = await createComplaintIntake(
    {
      customerName: "  Morgan Lee ",
      customerEmail: " MORGAN@EXAMPLE.COM ",
      source: "  Phone ",
      subject: "  Damaged outer box ",
      message,
      orderId: "ORD-550",
      orderValue: 42.5,
      createdAt: receivedAt,
      rating: 4,
    },
    store,
  );

  assert.equal(store.calls.lookups[0], "morgan@example.com");
  assert.deepEqual(store.calls.increments, ["CUS-test"]);
  assert.equal(store.calls.inserted.customerName, "Morgan Lee");
  assert.equal(store.calls.inserted.customerEmail, "morgan@example.com");
  assert.equal(store.calls.inserted.source, "Phone");
  assert.equal(store.calls.inserted.subject, "Damaged outer box");
  assert.equal(store.calls.inserted.message, message);
  assert.equal(store.calls.inserted.orderId, "ORD-550");
  assert.equal(store.calls.inserted.orderValue, 42.5);
  assert.equal(store.calls.inserted.createdAt.toISOString(), receivedAt);
  assert.equal(store.calls.inserted.rating, 4);
  assert.equal(result.id, "CS_test");
  assert.deepEqual(store.calls.events, [
    ["CS_test", "Complaint received", "CoSolve", "Received from Phone."],
  ]);
});

test("new customers use a matching order total and defaults when optional values are absent", async () => {
  const store = createStore({ customer: null, order: { total: 180 } });
  const result = await createComplaintIntake(
    {
      customerName: "Taylor",
      customerEmail: "taylor@example.com",
      source: "Web form",
      subject: "Delayed delivery",
      message: "The order is two days late.",
      orderId: "ORD-180",
    },
    store,
  );

  assert.deepEqual(store.calls.createdCustomer, {
    name: "Taylor",
    email: "taylor@example.com",
  });
  assert.deepEqual(store.calls.increments, ["CUS-new"]);
  assert.equal(store.calls.inserted.orderValue, 180);
  assert.equal(store.calls.inserted.rating, 0);
  assert.equal(store.calls.inserted.createdAt, undefined);
  assert.equal(result.id, "CS_test");
});
