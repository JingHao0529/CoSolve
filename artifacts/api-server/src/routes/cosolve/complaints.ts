import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { Router, type IRouter } from "express";
import {
  ApproveComplaintBody, RequestCompensationAdjustmentBody, RequestCompensationAdjustmentParams,
  RequestCompensationAdjustmentResponse, ListPendingCompensationAdjustmentsResponse,
  ReviewCompensationAdjustmentBody, ReviewCompensationAdjustmentParams, ReviewCompensationAdjustmentResponse,
  CreateComplaintBody, CreateComplaintResponse, GetComplaintParams, GetComplaintResponse,
  ListComplaintsQueryParams, ListComplaintsResponse, UpdateComplaintBody, UpdateComplaintParams,
  UpdateComplaintResponse,
} from "@workspace/api-zod";
import { compensationAdjustmentsTable, compensationsTable, complaintsTable, auditEventsTable, customersTable, db, ordersTable } from "@workspace/db";
import { findComplaint, makeId, recentComplaintEvents, serializeComplaint } from "./helpers";
import { saveComplaintImport } from "./import-store";
import importReviewRouter from "./import-review";
import closedCasesRouter from "./closed-cases";
import emailRouter from "./email";
import { requiresResolutionApproval } from "./resolution-policy";
import { resolveStaffIdentity, staffAuthorizationStatus } from "./staff-auth";

const router: IRouter = Router();
router.use(importReviewRouter);
router.use(closedCasesRouter);
router.use(emailRouter);

const unavailableRequesterName = "Former or unavailable staff member";

function requesterDisplayName(user: { fullName: string | null; username: string | null }): string {
  return user.fullName?.trim() || user.username?.trim() || "Staff member (name unavailable)";
}

async function getRequesterNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const uniqueIds = [...new Set(userIds)];

  for (let index = 0; index < uniqueIds.length; index += 100) {
    const batch = uniqueIds.slice(index, index + 100);
    try {
      const result = await clerkClient.users.getUserList({ userId: batch, limit: batch.length });
      for (const user of result.data) names.set(user.id, requesterDisplayName(user));
    } catch {
      // A deleted account or temporary Clerk lookup failure should not block the review queue.
    }
  }

  return names;
}

router.get("/compensation-adjustments/pending", async (req, res): Promise<void> => {
  const identity = await resolveStaffIdentity(req);
  if (staffAuthorizationStatus(identity) === 401) {
    res.status(401).json({ error: "Sign in to view pending compensation adjustments." }); return;
  }
  const rows = await db.select({
    id: compensationAdjustmentsTable.id, caseId: compensationAdjustmentsTable.caseId,
    caseSubject: complaintsTable.subject, customerName: complaintsTable.customerName,
    type: compensationAdjustmentsTable.type, amount: compensationAdjustmentsTable.amount,
    amountDelta: compensationAdjustmentsTable.amountDelta, rationale: compensationAdjustmentsTable.rationale,
    requestedBy: compensationAdjustmentsTable.requestedBy, date: compensationAdjustmentsTable.date,
  }).from(compensationAdjustmentsTable)
    .innerJoin(complaintsTable, eq(complaintsTable.id, compensationAdjustmentsTable.caseId))
    .where(and(eq(compensationAdjustmentsTable.status, "Pending review"), eq(complaintsTable.sentiment, "Negative"))).orderBy(asc(compensationAdjustmentsTable.date));
  const requesterNames = await getRequesterNames(rows.map(row => row.requestedBy));
  res.json(ListPendingCompensationAdjustmentsResponse.parse(rows.map(row => ({
    id: row.id,
    caseId: row.caseId,
    caseSubject: row.caseSubject,
    customerName: row.customerName,
    type: row.type,
    amount: row.amount,
    amountDelta: row.amountDelta,
    rationale: row.rationale,
    requesterName: requesterNames.get(row.requestedBy) ?? unavailableRequesterName,
    date: row.date.toISOString(),
  }))));
});

router.get("/complaints", async (req, res): Promise<void> => {
  const parsed = ListComplaintsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  filters.push(eq(complaintsTable.sentiment, "Negative"));
  if (parsed.data.status) filters.push(eq(complaintsTable.status, parsed.data.status));
  if (parsed.data.search) {
    const search = `%${parsed.data.search}%`;
    filters.push(or(ilike(complaintsTable.customerName, search), ilike(complaintsTable.subject, search),
      ilike(complaintsTable.message, search), ilike(complaintsTable.id, search))!);
  }
  const rows = await db.select().from(complaintsTable).where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(complaintsTable.createdAt));
  res.json(ListComplaintsResponse.parse(rows.map(serializeComplaint)));
});

router.post("/complaints", async (req, res): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.imported && !(await resolveStaffIdentity(req))) {
    res.status(401).json({ error: "Sign in to import complaint records." }); return;
  }
  const result = await saveComplaintImport(parsed.data);
  res.status(result.duplicate ? 200 : 201)
    .json(CreateComplaintResponse.parse({ ...serializeComplaint(result.complaint), duplicate: result.duplicate }));
});

router.get("/complaints/:id", async (req, res): Promise<void> => {
  const params = GetComplaintParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const complaint = await findComplaint(params.data.id);
  if (!complaint || complaint.sentiment !== "Negative") { res.status(404).json({ error: "Complaint not found" }); return; }
  const [orders, compensationHistory, compensationAdjustments] = await Promise.all([
    db.select().from(ordersTable).where(eq(ordersTable.customerId, complaint.customerId)).orderBy(desc(ordersTable.date)),
    db.select().from(compensationsTable).where(eq(compensationsTable.caseId, complaint.id)).orderBy(desc(compensationsTable.date)),
    db.select().from(compensationAdjustmentsTable).where(eq(compensationAdjustmentsTable.caseId, complaint.id))
      .orderBy(desc(compensationAdjustmentsTable.date)),
  ]);
  const [customer] = await db.select({ email: customersTable.email }).from(customersTable).where(eq(customersTable.id, complaint.customerId)).limit(1);
  res.json(GetComplaintResponse.parse({
    customerEmail: customer?.email || complaint.customerEmail || "",
    ...serializeComplaint(complaint), history: await recentComplaintEvents(complaint.id),
    orders: orders.map(order => ({ ...order, date: order.date.toISOString() })),
    compensationHistory: compensationHistory.map(entry => ({ ...entry, date: entry.date.toISOString() })),
    compensationAdjustments: compensationAdjustments.map(entry => ({
      ...entry, date: entry.date.toISOString(), reviewedAt: entry.reviewedAt?.toISOString() ?? null,
    })),
  }));
});

router.patch("/complaints/:id", async (req, res): Promise<void> => {
  const params = UpdateComplaintParams.safeParse(req.params);
  const parsed = UpdateComplaintBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "Invalid request" }); return;
  }
  const input = parsed.data;
  const identity = await resolveStaffIdentity(req);
  const result = await db.transaction(async tx => {
    const [existing] = await tx.select().from(complaintsTable).where(eq(complaintsTable.id, params.data.id)).for("update");
    if (!existing) return { status: 404, error: "Complaint not found" } as const;
    const [sendingEmail] = await tx.select({ id: auditEventsTable.id }).from(auditEventsTable)
      .where(and(eq(auditEventsTable.caseId, existing.id), eq(auditEventsTable.action, "Customer email sending"))).limit(1);
    if (sendingEmail && (input.status === "Closed" || (input.responseDraft !== undefined && input.responseDraft !== existing.responseDraft))) {
      return { status: 409, error: "Check the pending email's Gmail status before changing its response draft or closing the case." } as const;
    }
    const [approvedCompensation] = await tx.select().from(compensationsTable)
      .where(and(eq(compensationsTable.caseId, existing.id), eq(compensationsTable.status, "Approved"))).limit(1);
    const [approvedAdjustment] = approvedCompensation ? await tx.select().from(compensationAdjustmentsTable)
      .where(and(eq(compensationAdjustmentsTable.caseId, existing.id), eq(compensationAdjustmentsTable.status, "Approved")))
      .orderBy(desc(compensationAdjustmentsTable.reviewedAt)).limit(1) : [];
    const currentFinancials = approvedAdjustment ?? approvedCompensation;
    const approvedStatusChange = Boolean(approvedCompensation && input.status !== undefined && input.status !== existing.status);
    const needsIdentity = input.status === "Pending approval" || existing.status === "Pending approval" ||
      approvedStatusChange || (input.recommendedAmount !== undefined && input.recommendedAmount > 0);
    if (needsIdentity && !identity) return { status: 401, error: "Sign in to update compensation." } as const;
    if (approvedCompensation) {
      if ((input.recommendedAmount !== undefined && Math.round(input.recommendedAmount * 100) !== Math.round(currentFinancials!.amount * 100)) ||
        (input.recommendation !== undefined && input.recommendation !== currentFinancials!.type)) {
        return { status: 409, error: "This approved compensation is final. Changing its amount or remedy requires a separately reviewed adjustment." } as const;
      }
      const allowedApprovedStatusChange =
        (existing.status === "Resolved" && ["Investigating", "Closed"].includes(input.status ?? "")) ||
        (existing.status === "Investigating" && ["Resolved", "Closed"].includes(input.status ?? ""));
      if (input.status !== undefined && input.status !== existing.status && !allowedApprovedStatusChange) {
        return { status: 409, error: "This case has approved compensation and cannot be moved back to New or Pending approval. Reopening for investigation is allowed; approved terms remain final." } as const;
      }
    }
    if (!approvedCompensation && requiresResolutionApproval(existing, input)) {
      return { status: 409, error: "This case needs manager approval before a monetary resolution can be recorded." } as const;
    }
    const update: Partial<typeof complaintsTable.$inferInsert> = {};
    if (input.status !== undefined) update.status = input.status;
    if (input.assignedTo !== undefined) update.assignedTo = input.assignedTo;
    if (input.recommendation !== undefined) update.recommendation = input.recommendation;
    if (input.recommendedAmount !== undefined) update.recommendedAmount = input.recommendedAmount;
    if (input.responseDraft !== undefined) update.responseDraft = input.responseDraft;
    if (input.resolutionNote !== undefined) update.resolutionNote = input.resolutionNote;
    if (input.rating !== undefined) update.rating = input.rating;
    if (!Object.keys(update).length && !input.customerResponseSent) return { status: 400, error: "Provide at least one field to update." } as const;
    const [updated] = Object.keys(update).length
      ? await tx.update(complaintsTable).set(update).where(eq(complaintsTable.id, existing.id)).returning() : [existing];
    if (input.customerResponseSent) await tx.insert(auditEventsTable).values({
      id: makeId("log"), caseId: existing.id, action: "Customer response recorded", actor: identity?.id ?? "Support team",
      details: "An agent recorded that a customer-ready response was sent.",
    });
    const actions = [
      input.status !== undefined && input.status !== existing.status ? `Status changed to ${input.status}` : "",
      input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo ? `Assigned to ${input.assignedTo}` : "",
      input.recommendation !== undefined && input.recommendation !== existing.recommendation ? `Resolution set to ${input.recommendation}` : "",
      input.recommendedAmount !== undefined ? `Recommended amount set to $${input.recommendedAmount.toFixed(2)}` : "",
      input.resolutionNote !== undefined && input.resolutionNote !== existing.resolutionNote ? `Resolution note: ${input.resolutionNote}` : "",
      input.responseDraft !== undefined && input.responseDraft !== existing.responseDraft ? "Customer response draft updated" : "",
      input.rating !== undefined && input.rating !== existing.rating ? `Customer rating recorded: ${input.rating}/5` : "",
    ].filter(Boolean);
    if (actions.length) await tx.insert(auditEventsTable).values({
      id: makeId("log"), caseId: existing.id, actor: identity?.id ?? "Support team",
      action: approvedCompensation && existing.status === "Resolved" && input.status === "Investigating" ? "Case reopened for investigation"
        : approvedCompensation && existing.status === "Investigating" && input.status === "Resolved" ? "Case resolved after investigation"
        : input.status === "Pending approval" && input.status !== existing.status ? "Manager approval requested"
        : ["Resolved", "Closed"].includes(input.status ?? "") && input.status !== existing.status ? "Case resolution recorded" : "Case updated",
      details: `${actions.join(". ")}${approvedCompensation && ["Investigating", "Resolved"].includes(input.status ?? "") && input.status !== existing.status ? `. Approved compensation remains unchanged at $${currentFinancials!.amount.toFixed(2)}.` : ""}`,
    });
    return { status: 200, complaint: updated } as const;
  });
  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
  res.json(UpdateComplaintResponse.parse(serializeComplaint(result.complaint)));
});

router.post("/complaints/:id/approve", async (req, res): Promise<void> => {
  const params = GetComplaintParams.safeParse(req.params);
  const parsed = ApproveComplaintBody.safeParse(req.body ?? {});
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "Invalid request" }); return;
  }
  const input = parsed.data;
  const identity = await resolveStaffIdentity(req);
  if (staffAuthorizationStatus(identity) === 401) { res.status(401).json({ error: "Sign in to approve compensation." }); return; }
  const result = await db.transaction(async tx => {
    const [existing] = await tx.select().from(complaintsTable).where(eq(complaintsTable.id, params.data.id)).for("update");
    if (!existing) return { status: 404, error: "Complaint not found" } as const;
    const explicitReview = input.recommendation !== undefined && input.recommendedAmount !== undefined;
    if (["Resolved", "Closed"].includes(existing.status) || (existing.status !== "Pending approval" && !explicitReview)) {
      return { status: 409, error: "This case is not awaiting approval." } as const;
    }
    if ((input.expectedRecommendation !== undefined && input.expectedRecommendation !== existing.recommendation) ||
      (input.expectedAmount !== undefined && Math.round(input.expectedAmount * 100) !== Math.round(existing.recommendedAmount * 100))) {
      return { status: 409, error: "The offer changed since you reviewed it. Reload the case before approving." } as const;
    }
    const recommendation = (input.recommendation ?? existing.recommendation).trim();
    const amount = Math.round((input.recommendedAmount ?? existing.recommendedAmount) * 100) / 100;
    if (!recommendation) return { status: 400, error: "Enter the resolution to approve." } as const;
    if (amount <= 0 && !explicitReview) return { status: 409, error: "This case has no monetary compensation to approve." } as const;
    const [approved] = await tx.select({ id: compensationsTable.id }).from(compensationsTable)
      .where(and(eq(compensationsTable.caseId, existing.id), eq(compensationsTable.status, "Approved"))).limit(1);
    if (approved) return { status: 409, error: "Compensation has already been approved." } as const;
    const [updated] = await tx.update(complaintsTable).set({
      status: "Resolved", recommendation, recommendedAmount: amount,
      ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote } : {}),
    }).where(eq(complaintsTable.id, existing.id)).returning();
    await tx.insert(compensationsTable).values({
      id: makeId("cmp"), caseId: updated.id, type: recommendation, amount, status: "Approved",
    });
    await tx.insert(auditEventsTable).values([
      { id: makeId("log"), caseId: updated.id, action: "Case resolution recorded", actor: identity!.id,
        details: `Manager approved ${recommendation} for $${amount.toFixed(2)}.` },
      { id: makeId("log"), caseId: updated.id, action: "Compensation approved", actor: identity!.id,
        details: `${recommendation} approved for $${amount.toFixed(2)}.` },
    ]);
    return { status: 200, complaint: updated } as const;
  });
  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
  res.json(UpdateComplaintResponse.parse(serializeComplaint(result.complaint)));
});

router.post("/complaints/:id/compensation-adjustments", async (req, res): Promise<void> => {
  const params = RequestCompensationAdjustmentParams.safeParse(req.params);
  const parsed = RequestCompensationAdjustmentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "Invalid request" }); return;
  }
  const type = parsed.data.type.trim(), rationale = parsed.data.rationale.trim();
  if (!type || !rationale || Math.abs(parsed.data.amount * 100 - Math.round(parsed.data.amount * 100)) > 1e-7) {
    res.status(400).json({ error: "Provide a remedy, rationale, and amount in whole cents." }); return;
  }
  const identity = await resolveStaffIdentity(req);
  if (!identity) { res.status(401).json({ error: "Sign in with a staff account to request a compensation adjustment." }); return; }
  const result = await db.transaction(async tx => {
    const [existing] = await tx.select().from(complaintsTable).where(eq(complaintsTable.id, params.data.id)).for("update");
    if (!existing) return { status: 404, error: "Complaint not found" } as const;
    const [original] = await tx.select().from(compensationsTable)
      .where(and(eq(compensationsTable.caseId, existing.id), eq(compensationsTable.status, "Approved"))).limit(1);
    if (!original) return { status: 409, error: "This case has no approved compensation to adjust." } as const;
    const [pending] = await tx.select({ id: compensationAdjustmentsTable.id }).from(compensationAdjustmentsTable)
      .where(and(eq(compensationAdjustmentsTable.caseId, existing.id), eq(compensationAdjustmentsTable.status, "Pending review"))).limit(1);
    if (pending) return { status: 409, error: "A compensation adjustment is already awaiting manager review." } as const;
    const [latest] = await tx.select().from(compensationAdjustmentsTable)
      .where(and(eq(compensationAdjustmentsTable.caseId, existing.id), eq(compensationAdjustmentsTable.status, "Approved")))
      .orderBy(desc(compensationAdjustmentsTable.reviewedAt)).limit(1);
    const base = latest ?? original, amount = parsed.data.amount;
    if (base.type === type && Math.round(base.amount * 100) === Math.round(amount * 100)) {
      return { status: 400, error: "The requested adjustment does not change the approved compensation." } as const;
    }
    const [adjustment] = await tx.insert(compensationAdjustmentsTable).values({
      id: makeId("adj"), caseId: existing.id, compensationId: original.id, baseType: base.type, baseAmount: base.amount,
      type, amount, amountDelta: Math.round((amount - base.amount) * 100) / 100, rationale, requestedBy: identity.id,
    }).returning();
    await tx.insert(auditEventsTable).values({ id: makeId("log"), caseId: existing.id, action: "Compensation adjustment requested",
      actor: identity.id, details: `Requested ${type} for $${amount.toFixed(2)} (${adjustment.amountDelta >= 0 ? "+" : "−"}$${Math.abs(adjustment.amountDelta).toFixed(2)}). Rationale: ${rationale}` });
    return { status: 201, adjustment } as const;
  });
  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
  res.status(201).json(RequestCompensationAdjustmentResponse.parse({
    ...result.adjustment, date: result.adjustment.date.toISOString(), reviewedAt: null,
  }));
});

router.post("/complaints/:id/compensation-adjustments/:adjustmentId/review", async (req, res): Promise<void> => {
  const params = ReviewCompensationAdjustmentParams.safeParse(req.params);
  const parsed = ReviewCompensationAdjustmentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "Invalid request" }); return;
  }
  const reviewNote = parsed.data.reviewNote?.trim() || null;
  const identity = await resolveStaffIdentity(req);
  if (staffAuthorizationStatus(identity) === 401) { res.status(401).json({ error: "Sign in to review compensation adjustments." }); return; }
  const result = await db.transaction(async tx => {
    const [existing] = await tx.select().from(complaintsTable).where(eq(complaintsTable.id, params.data.id)).for("update");
    if (!existing) return { status: 404, error: "Complaint not found" } as const;
    const [adjustment] = await tx.select().from(compensationAdjustmentsTable)
      .where(and(eq(compensationAdjustmentsTable.id, params.data.adjustmentId), eq(compensationAdjustmentsTable.caseId, existing.id))).for("update");
    if (!adjustment) return { status: 404, error: "Compensation adjustment not found" } as const;
    if (adjustment.status !== "Pending review") return { status: 409, error: "This compensation adjustment has already been reviewed." } as const;
    const [original] = await tx.select().from(compensationsTable).where(and(
      eq(compensationsTable.id, adjustment.compensationId), eq(compensationsTable.caseId, existing.id), eq(compensationsTable.status, "Approved"),
    )).limit(1);
    if (!original) return { status: 409, error: "The approved compensation this request refers to is no longer available." } as const;
    if (parsed.data.decision === "approve") {
      const [latest] = await tx.select().from(compensationAdjustmentsTable)
        .where(and(eq(compensationAdjustmentsTable.caseId, existing.id), eq(compensationAdjustmentsTable.status, "Approved")))
        .orderBy(desc(compensationAdjustmentsTable.reviewedAt)).limit(1);
      const base = latest ?? original;
      if (base.type !== adjustment.baseType || Math.round(base.amount * 100) !== Math.round(adjustment.baseAmount * 100)) {
        return { status: 409, error: "The approved compensation changed after this adjustment was requested. Submit a new request." } as const;
      }
    }
    const approved = parsed.data.decision === "approve";
    const [updated] = await tx.update(compensationAdjustmentsTable).set({
      status: approved ? "Approved" : "Rejected", reviewer: identity!.id, reviewNote, reviewedAt: new Date(),
    }).where(eq(compensationAdjustmentsTable.id, adjustment.id)).returning();
    if (approved) await tx.update(complaintsTable).set({ recommendation: adjustment.type, recommendedAmount: adjustment.amount })
      .where(eq(complaintsTable.id, existing.id));
    await tx.insert(auditEventsTable).values({
      id: makeId("log"), caseId: existing.id, actor: identity!.id,
      action: approved ? "Compensation adjustment approved" : "Compensation adjustment rejected",
      details: `${approved ? "Approved" : "Rejected requested"} ${adjustment.type} at $${adjustment.amount.toFixed(2)}${approved ? ` (${adjustment.amountDelta >= 0 ? "+" : "−"}$${Math.abs(adjustment.amountDelta).toFixed(2)})` : ""}. Rationale: ${adjustment.rationale}${reviewNote ? ` Review note: ${reviewNote}` : ""}`,
    });
    return { status: 200, adjustment: updated } as const;
  });
  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
  res.json(ReviewCompensationAdjustmentResponse.parse({
    ...result.adjustment, date: result.adjustment.date.toISOString(), reviewedAt: result.adjustment.reviewedAt?.toISOString() ?? null,
  }));
});

export default router;
