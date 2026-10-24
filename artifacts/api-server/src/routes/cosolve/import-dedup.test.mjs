import assert from "node:assert/strict";
import test from "node:test";
import { complaintImportKey, receiveComplaintImport, isLegacyImportCandidate } from "./import-dedup.ts";

const complaint = {
  imported: true,
  source: "Google review",
  customerName: "Taylor Morgan",
  customerEmail: "taylor@example.com",
  subject: "Broken jar",
  message: "The jar arrived broken.",
};

test("manual intake is never deduplicated, even when a source ID is supplied", async () => {
  assert.equal(complaintImportKey({ ...complaint, imported: false, sourceId: "1" }), undefined);
  let created = 0;
  const store = {
    lock: async () => assert.fail("Manual intake must not lock an import identity"),
    findExisting: async () => assert.fail("Manual intake must not look up import identities"),
    remember: async () => assert.fail("Manual intake must not store an import identity"),
    create: async () => ({ id: `case-${++created}` }),
  };
  await receiveComplaintImport({ ...complaint, imported: undefined }, store);
  await receiveComplaintImport({ ...complaint, imported: undefined }, store);
  assert.equal(created, 2);
});

test("source identifiers take precedence, are source scoped and retain their case", () => {
  const input = { ...complaint, sourceId: "Review-ABC" };
  const key = complaintImportKey(input);
  assert.equal(key, complaintImportKey({ ...input, message: "Edited after export", rating: 5 }));
  assert.notEqual(key, complaintImportKey({ ...input, source: "Email" }));
  assert.notEqual(key, complaintImportKey({ ...input, sourceId: "review-abc" }));
  assert.equal(key, complaintImportKey({ ...input, source: " GOOGLE REVIEW ", sourceId: " Review-ABC " }));
});

test("fallback is stable without dates and conservatively distinguishes supplied details", () => {
  const key = complaintImportKey(complaint);
  assert.equal(key, complaintImportKey({ ...complaint, sourceId: "  " }));
  assert.equal(key, complaintImportKey({ ...complaint, customerEmail: " TAYLOR@EXAMPLE.COM ", customerName: " Taylor   Morgan ", source: " GOOGLE REVIEW " }));
  const changes = {
    subject: "Different issue", message: "Another message", customerName: "Another customer",
    customerEmail: "another@example.com", source: "Phone", orderId: "ORD-new",
    orderValue: 10, createdAt: "2026-10-01T09:00:00Z", rating: 1,
  };
  for (const [field, value] of Object.entries(changes)) {
    assert.notEqual(key, complaintImportKey({ ...complaint, [field]: value }), field);
  }
  const dated = { ...complaint, createdAt: "2026-10-01T09:00:00Z" };
  assert.equal(complaintImportKey(dated), complaintImportKey({ ...dated, createdAt: new Date(dated.createdAt) }));
  assert.equal(complaintImportKey({ ...complaint, message: "Café\r\nBroken" }), complaintImportKey({ ...complaint, message: "Cafe\u0301\nBroken" }));
});

test("repeated imports return the existing case without another creation or audit", async () => {
  const ledger = new Map();
  const calls = [];
  let creates = 0;
  let audits = 0;
  const store = {
    lock: async key => { calls.push(["lock", key]); },
    findExisting: async key => { calls.push(["find", key]); return ledger.get(key); },
    create: async () => { creates++; audits++; return { id: "CS-first" }; },
    remember: async (key, id) => { ledger.set(key, { id }); },
  };
  assert.deepEqual(await receiveComplaintImport(complaint, store), { complaint: { id: "CS-first" }, duplicate: false });
  assert.deepEqual(await receiveComplaintImport(complaint, store), { complaint: { id: "CS-first" }, duplicate: true });
  assert.equal(creates, 1);
  assert.equal(audits, 1);
  assert.deepEqual(calls.map(([action]) => action), ["lock", "find", "lock", "find"]);
});

test("a failed creation does not reserve the identity, allowing a retry", async () => {
  let fail = true;
  let remembered = false;
  const store = {
    lock: async () => {},
    findExisting: async () => undefined,
    create: async () => { if (fail) throw new Error("Storage failed"); return { id: "CS-retry" }; },
    remember: async () => { remembered = true; },
  };
  await assert.rejects(receiveComplaintImport(complaint, store), /Storage failed/);
  assert.equal(remembered, false);
  fail = false;
  assert.equal((await receiveComplaintImport(complaint, store)).duplicate, false);
  assert.equal(remembered, true);
});

test("legacy suggestions are ambiguous without dates, never automatically tracked duplicates", () => {
  const candidate = { ...complaint, id: "old-a", orderId: "", createdAt: new Date("2020-01-01T12:00:00Z") };
  assert.equal(isLegacyImportCandidate(complaint, candidate), true);
  assert.equal(isLegacyImportCandidate(complaint, { ...candidate, id: "old-b", createdAt: new Date("2021-01-01") }), true);
  assert.equal(isLegacyImportCandidate({ ...complaint, createdAt: "2020-01-01T12:00:00Z" }, candidate), true);
  assert.equal(isLegacyImportCandidate({ ...complaint, createdAt: "2020-01-02T12:00:00Z" }, candidate), false);
  assert.equal(isLegacyImportCandidate(complaint, { ...candidate, customerEmail: "other@example.com" }), false);
  assert.equal(isLegacyImportCandidate({ ...complaint, customerEmail: undefined }, candidate), true);
  assert.equal(isLegacyImportCandidate(complaint, { ...candidate, message: "A different complaint" }), false);
  assert.equal(isLegacyImportCandidate(complaint, { ...candidate, source: "Other account" }), false);
});

test("the same source ID from distinct account-scoped sources stays independent", () => {
  const first = { ...complaint, source: "Reviews: account A", sourceId: "123" };
  const second = { ...first, source: "Reviews: account B" };
  assert.notEqual(complaintImportKey(first), complaintImportKey(second));
  const candidate = { ...first, orderId: "", createdAt: new Date() };
  assert.equal(isLegacyImportCandidate(second, candidate), false);
});
