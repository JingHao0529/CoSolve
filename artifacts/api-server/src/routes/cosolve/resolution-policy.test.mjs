import assert from "node:assert/strict";
import test from "node:test";
import { requiresResolutionApproval } from "./resolution-policy.ts";

test("monetary resolutions cannot be completed through the general update endpoint", () => {
  for (const status of ["Resolved", "Closed"]) {
    for (const currentStatus of ["New", "Investigating", "Pending approval", "Resolved", "Closed"]) {
      assert.equal(requiresResolutionApproval(
        { status: currentStatus, recommendedAmount: 50 }, { status },
      ), true);
    }
  }
});

test("adding a refund and resolving in one request cannot bypass approval", () => {
  assert.equal(requiresResolutionApproval(
    { status: "New", recommendedAmount: 0 },
    { status: "Resolved", recommendedAmount: 75 },
  ), true);
});

test("zero-value remedies can resolve without a refund approval", () => {
  for (const status of ["Resolved", "Closed"]) {
    assert.equal(requiresResolutionApproval(
      { status: "New", recommendedAmount: 0 }, { status },
    ), false);
    assert.equal(requiresResolutionApproval(
      { status: "New", recommendedAmount: 50 }, { status, recommendedAmount: 0 },
    ), false);
  }
});

test("requesting approval and editing an open case do not count as resolution", () => {
  for (const status of [undefined, "Investigating", "Pending approval"]) {
    assert.equal(requiresResolutionApproval(
      { status: "New", recommendedAmount: 50 }, { status, recommendedAmount: 100 },
    ), false);
  }
});
