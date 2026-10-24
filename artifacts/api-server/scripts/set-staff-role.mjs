import { clerkClient } from "@clerk/express";

const email = process.env.COSOLVE_STAFF_EMAIL?.trim().toLowerCase();
const role = process.env.COSOLVE_STAFF_ROLE?.trim().toLowerCase() || "manager";

if (!email || !email.includes("@")) {
  throw new Error("Set COSOLVE_STAFF_EMAIL to an existing staff member's verified email.");
}
if (!["staff", "manager"].includes(role)) {
  throw new Error('COSOLVE_STAFF_ROLE must be either "staff" or "manager".');
}

const { data: matches } = await clerkClient.users.getUserList({
  emailAddress: [email],
  limit: 100,
});
const matchingUsers = matches.filter((user) =>
  user.emailAddresses.some((address) =>
    address.emailAddress.toLowerCase() === email &&
    address.verification?.status === "verified",
  ),
);

if (matchingUsers.length !== 1) {
  throw new Error(
    matchingUsers.length === 0
      ? "No account with that verified email exists. Have the staff member sign up first."
      : "More than one account matched the verified email; refusing to grant a role.",
  );
}

const user = matchingUsers[0];
if (user.publicMetadata.role === role) {
  console.info(`Staff role is already ${role}.`);
} else {
  await clerkClient.users.updateUserMetadata(user.id, {
    publicMetadata: { role },
  });
  console.info(`Updated staff role to ${role} for Clerk user ${user.id}.`);
}
