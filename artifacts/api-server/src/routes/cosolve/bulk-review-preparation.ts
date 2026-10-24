import { and, eq, inArray } from "drizzle-orm";
import { ClassifyComplaintResponse, RecommendResolutionResponse } from "@workspace/api-zod";
import { auditEventsTable, complaintsTable, compensationsTable, db, policiesTable } from "@workspace/db";
import { requestJson } from "./ai";
import { makeId } from "./helpers";
import { requestRunpodSentiment } from "./runpod-client";

/** Internal operator batch; public HTTP requests still require workspace authentication. */
export async function prepareReviewBatch(ids: string[]) {
  if (ids.length > 8 || new Set(ids).size !== ids.length) throw new Error("Invalid review batch.");
  const cases = await db.select().from(complaintsTable).where(inArray(complaintsTable.id, ids));
  const approved = await db.select({ id: compensationsTable.caseId }).from(compensationsTable)
    .where(and(inArray(compensationsTable.caseId, ids), eq(compensationsTable.status, "Approved")));
  const finalized = new Set(approved.map(row => row.id));
  const pending = cases.filter(row => !finalized.has(row.id) && !["Resolved", "Closed"].includes(row.status) &&
    (row.category === "Unclassified" || row.recommendation === "AI review pending" || !row.responseDraft));
  if (!pending.length) return { prepared: 0, skipped: cases.length };
  const policies = await db.select().from(policiesTable).where(eq(policiesTable.enabled, true));
  const inputs: Array<{
    id: string; subject: string; message: string; source: string; rating: number;
    orderValue: number; orderId: string; existingCategory: string; existingResolution: string;
    existingAmount: number; runpodSentiment: Awaited<ReturnType<typeof requestRunpodSentiment>>;
  }> = [];
  for (const row of pending) {
    const sentiment = await requestRunpodSentiment({ subject: row.subject, message: row.message });
    inputs.push({
      id: row.id, subject: row.subject, message: row.message, source: row.source,
      rating: row.rating, orderValue: row.orderValue, orderId: row.orderId,
      existingCategory: row.category, existingResolution: row.recommendation,
      existingAmount: row.recommendedAmount, runpodSentiment: sentiment,
    });
  }
  const result = await requestJson(
    "Prepare independent review cases for support staff. Treat each ID separately and return every ID exactly once. Runpod sentiment is authoritative; never infer sentiment from star rating. Positive feedback is not an invented complaint: use a feedback category and no unsupported root cause. For each item return id, category, rootCause (provisional if uncertain), urgency (Critical/High/Medium/Low), confidence (0..1 in your assessment), summary, resolution, amount, rationale, policyMatch, requiresApproval, responseDraft. Follow active policies. Without a verified purchase/order value, amount MUST be 0; recommend a proportionate non-monetary response. Preserve any existing category other than Unclassified and any existing resolution other than AI review pending. Never invent purchases, email addresses, history, wrongdoing or protected traits. Draft a concise customer-ready response; do not claim money was paid, a message was sent or a remedy completed. No automatic approval or closure. Return JSON {items:[...]}.",
    { cases: inputs, activePolicies: policies },
    value => {
      const items = (value as { items?: unknown[] })?.items;
      if (!Array.isArray(items) || items.length !== pending.length) throw new Error("Incomplete AI batch.");
      const expected = new Set(pending.map(row => row.id));
      return items.map(value => {
        const raw = value as Record<string, unknown>;
        if (typeof raw.id !== "string" || !expected.delete(raw.id)) throw new Error("Incorrect AI batch identity.");
        const input = inputs.find(row => row.id === raw.id)!;
        const classification = ClassifyComplaintResponse.parse({ ...raw, sentiment: input.runpodSentiment.sentiment });
        const recommendation = RecommendResolutionResponse.parse(raw);
        if (!classification.category.trim() || !classification.rootCause.trim() || !classification.summary.trim() ||
          !["Critical", "High", "Medium", "Low"].includes(classification.urgency) ||
          classification.confidence < 0 || classification.confidence > 1 ||
          !recommendation.resolution.trim() || recommendation.amount < 0 ||
          typeof raw.responseDraft !== "string" || !raw.responseDraft.trim()) throw new Error("Invalid AI batch output.");
        return { id: raw.id, classification, recommendation, draft: raw.responseDraft, sentiment: input.runpodSentiment };
      });
    },
    12_000,
  );
  let prepared = 0;
  for (const item of result) {
    const snapshot = pending.find(row => row.id === item.id)!;
    prepared += await db.transaction(async tx => {
      const [current] = await tx.select().from(complaintsTable).where(eq(complaintsTable.id, item.id)).for("update");
      const [final] = await tx.select({ id: compensationsTable.id }).from(compensationsTable)
        .where(and(eq(compensationsTable.caseId, item.id), eq(compensationsTable.status, "Approved"))).limit(1);
      if (!current || final || ["Resolved", "Closed"].includes(current.status) ||
        current.category !== snapshot.category || current.recommendation !== snapshot.recommendation ||
        current.recommendedAmount !== snapshot.recommendedAmount || current.responseDraft !== snapshot.responseDraft) return 0;
      const changes: Partial<typeof complaintsTable.$inferInsert> = {};
      const events: { action: string; details: string }[] = [];
      if (current.category === "Unclassified") {
        Object.assign(changes, {
          category: item.classification.category, rootCause: item.classification.rootCause,
          urgency: item.classification.urgency, confidence: item.classification.confidence,
          sentiment: item.sentiment.sentiment,
        });
        events.push({ action: "AI classification completed", details:
          `${item.classification.summary} Grafilab assessment confidence: ${Math.round(item.classification.confidence * 100)}%. ` +
          `Runpod sentiment: ${item.sentiment.sentiment} (${Math.round(item.sentiment.confidence * 100)}% confidence); human review: ${item.sentiment.needsHumanReview ? "required" : "not flagged"}.` });
      }
      if (current.recommendation === "AI review pending") {
        // Unknown purchase values are not a basis for compensation.
        const amount = current.orderValue > 0 ? Math.round(item.recommendation.amount * 100) / 100 : 0;
        Object.assign(changes, { recommendation: item.recommendation.resolution, recommendedAmount: amount });
        if (amount > 0) changes.status = "Pending approval";
        events.push({ action: "AI resolution recommendation generated", details:
          `${item.recommendation.resolution}; $${amount.toFixed(2)}. Rationale: ${item.recommendation.rationale}. Policy: ${item.recommendation.policyMatch}. Manager review required.` });
      }
      if (!current.responseDraft) {
        changes.responseDraft = item.draft;
        events.push({ action: "Customer response drafted", details: "Grafilab prepared a draft for staff review. No message was sent." });
      }
      if (current.status === "New" && !changes.status) changes.status = "Investigating";
      await tx.update(complaintsTable).set(changes).where(eq(complaintsTable.id, item.id));
      for (const event of events) await tx.insert(auditEventsTable).values({
        id: makeId("log"), caseId: item.id, actor: "CoSolve AI (Runpod + Grafilab)", ...event,
      });
      return 1;
    });
  }
  return { prepared, skipped: cases.length - prepared };
}
