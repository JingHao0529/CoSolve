import assert from "node:assert/strict";
import test from "node:test";
import {
  managerAuthorizationStatus,
  isPublicCoSolveRequest,
  staffAuthorizationStatus,
  staffIdentityFromUser,
} from "./staff-auth.ts";

test("anonymous users cannot access approval actions", () => {
  assert.equal(staffAuthorizationStatus(null), 401);
});

test("all signed-in workspace users have manager capabilities regardless of legacy metadata", () => {
  const staff = staffIdentityFromUser({ id: "user_staff_123", publicMetadata: {} });
  const manager = staffIdentityFromUser({
    id: "user_manager_456",
    publicMetadata: { role: "manager" },
  });
  const unknownRole = staffIdentityFromUser({
    id: "user_unknown_role_789",
    publicMetadata: { role: "admin" },
  });

  assert.deepEqual(staff, { id: "user_staff_123", role: "manager" });
  assert.deepEqual(manager, { id: "user_manager_456", role: "manager" });
  assert.equal(staffAuthorizationStatus(staff), null);
  assert.equal(staffAuthorizationStatus(manager), null);
  assert.equal(managerAuthorizationStatus(null), 401);
  assert.equal(managerAuthorizationStatus(staff), null);
  assert.equal(managerAuthorizationStatus(unknownRole), null);
  assert.equal(managerAuthorizationStatus(manager), null);
});

test("only public complaint intake and WhatsApp webhooks bypass workspace authentication", () => {
  assert.equal(isPublicCoSolveRequest("POST", "/complaints"), true);
  assert.equal(isPublicCoSolveRequest("POST", "/complaints/"), true);
  assert.equal(isPublicCoSolveRequest("GET", "/complaints"), false);
  assert.equal(isPublicCoSolveRequest("DELETE", "/complaints/closed"), false);
  assert.equal(isPublicCoSolveRequest("GET", "/complaints/case-123"), false);
  assert.equal(isPublicCoSolveRequest("GET", "/webhooks/whatsapp"), true);
  assert.equal(isPublicCoSolveRequest("POST", "/webhooks/whatsapp"), true);
  assert.equal(isPublicCoSolveRequest("PUT", "/webhooks/whatsapp"), false);
  assert.equal(isPublicCoSolveRequest("GET", "/customers"), false);
  assert.equal(isPublicCoSolveRequest("GET", "/analytics"), false);
  assert.equal(isPublicCoSolveRequest("GET", "/policies"), false);
  assert.equal(isPublicCoSolveRequest("GET", "/audit-log"), false);
  assert.equal(isPublicCoSolveRequest("GET", "/whatsapp/messages"), false);
});
