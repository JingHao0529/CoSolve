import { createHash } from "node:crypto";
import type { ComplaintIntakeInput } from "./intake";

export type ComplaintImportInput = ComplaintIntakeInput & {
  imported?: boolean;
  sourceId?: string;
};

const text = (value = "") => value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
const identity = (value = "") => text(value).replace(/\s+/g, " ").toLowerCase();

/** A suggestion only: repeated content (especially without dates) is not provenance. */
export function isLegacyImportCandidate(
  input: ComplaintImportInput,
  candidate: {
    source: string; customerName: string; customerEmail: string;
    subject: string; message: string; orderId: string; createdAt: Date | string;
  },
): boolean {
  return identity(input.source) === identity(candidate.source)
    && identity(input.customerName) === identity(candidate.customerName)
    && (!text(input.customerEmail) || identity(input.customerEmail) === identity(candidate.customerEmail))
    && text(input.subject) === text(candidate.subject)
    && text(input.message) === text(candidate.message)
    && (!text(input.orderId) || text(input.orderId) === text(candidate.orderId))
    && (!input.createdAt || new Date(input.createdAt).getTime() === new Date(candidate.createdAt).getTime());
}

export function complaintImportKey(input: ComplaintImportInput): string | undefined {
  if (!input.imported) return undefined;
  const source = identity(input.source);
  const sourceId = text(input.sourceId);
  const values = sourceId
    ? ["source-id-v1", source, sourceId]
    : [
        "content-v1", source, identity(input.customerName),
        identity(input.customerEmail), text(input.subject), text(input.message),
        text(input.orderId), input.orderValue ?? null,
        input.createdAt
          ? (input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt)).toISOString()
          : null,
        input.rating ?? null,
        ...(input.originalReviewDate ? ["original-review-date", text(input.originalReviewDate)] : []),
      ];
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export interface ComplaintImportStore<T extends { id: string }> {
  lock(key: string): Promise<void>;
  findExisting(key: string): Promise<T | undefined>;
  create(): Promise<T>;
  remember(key: string, complaintId: string): Promise<void>;
}

/** Call within one transaction; lock must last until that transaction commits. */
export async function receiveComplaintImport<T extends { id: string }>(
  input: ComplaintImportInput,
  store: ComplaintImportStore<T>,
): Promise<{ complaint: T; duplicate: boolean }> {
  const key = complaintImportKey(input);
  if (key) {
    await store.lock(key);
    const existing = await store.findExisting(key);
    if (existing) return { complaint: existing, duplicate: true };
  }
  const complaint = await store.create();
  if (key) await store.remember(key, complaint.id);
  return { complaint, duplicate: false };
}
