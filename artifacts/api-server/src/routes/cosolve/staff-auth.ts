import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";

export type StaffIdentity = { id: string; role: "staff" | "manager" };

const identitiesByRequest = new WeakMap<Request, Promise<StaffIdentity | null>>();

export function staffIdentityFromUser(user: {
  id: string;
  publicMetadata?: Record<string, unknown>;
}): StaffIdentity {
  return {
    id: user.id,
    role: "manager",
  };
}

export function isPublicCoSolveRequest(method: string, path: string): boolean {
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const normalizedMethod = method.toUpperCase();

  return (
    (normalizedMethod === "POST" && normalizedPath === "/complaints") ||
    ((normalizedMethod === "GET" || normalizedMethod === "POST") &&
      normalizedPath === "/webhooks/whatsapp")
  );
}

export function resolveStaffIdentity(
  req: Request,
): Promise<StaffIdentity | null> {
  const cached = identitiesByRequest.get(req);
  if (cached) return cached;

  const identityPromise = (async (): Promise<StaffIdentity | null> => {
    const userId = getAuth(req).userId;
    if (!userId) return null;

    const user = await clerkClient.users.getUser(userId);
    return staffIdentityFromUser(user);
  })();
  identitiesByRequest.set(req, identityPromise);
  return identityPromise;
}

export function staffAuthorizationStatus(
  identity: StaffIdentity | null,
): 401 | null {
  return identity ? null : 401;
}

export function managerAuthorizationStatus(
  identity: StaffIdentity | null,
): 401 | 403 | null {
  if (!identity) return 401;
  return null;
}
