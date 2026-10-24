import { Router, type IRouter } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  auditEventsTable,
  db,
  complaintsTable,
  compensationAdjustmentsTable,
  compensationsTable,
} from "@workspace/db";
import { GetAnalyticsResponse, GetDashboardResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function monthStart(offset: number, reference: Date): Date {
  return new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + offset, 1),
  );
}

async function makeTrends(reference: Date) {
  const complaints = await db.select().from(complaintsTable).where(eq(complaintsTable.sentiment, "Negative"));
  const [approvedRefunds, approvedAdjustments] = await Promise.all([
    db.select().from(compensationsTable)
      .where(sql`${compensationsTable.status} = 'Approved'`),
    db.select().from(compensationAdjustmentsTable)
      .where(sql`${compensationAdjustmentsTable.status} = 'Approved'`),
  ]);

  return Array.from({ length: 6 }, (_, index) => {
    const start = monthStart(index - 5, reference);
    const end = monthStart(index - 4, reference);
    const label = start.toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const monthlyCases = complaints.filter(
      (caseRow) => caseRow.createdAt >= start && caseRow.createdAt < end,
    );
    const monthlyRefunds = approvedRefunds
      .filter((refund) => refund.date >= start && refund.date < end)
      .reduce((total, refund) => total + refund.amount, 0) +
      approvedAdjustments
        .filter((adjustment) =>
          adjustment.reviewedAt !== null &&
          adjustment.reviewedAt >= start &&
          adjustment.reviewedAt < end
        )
        .reduce((total, adjustment) => total + adjustment.amountDelta, 0);
    const ratings = monthlyCases
      .map((caseRow) => caseRow.rating)
      .filter((rating) => rating > 0);
    const satisfaction = ratings.length
      ? Math.round(
          (ratings.reduce((total, rating) => total + rating, 0) /
            ratings.length) *
            20,
        )
      : 0;
    return {
      label,
      complaints: monthlyCases.length,
      refunds: Math.round(monthlyRefunds * 100) / 100,
      satisfaction,
    };
  });
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const reportTime = new Date();
  const complaintRows = await db.select().from(complaintsTable).where(eq(complaintsTable.sentiment, "Negative"));
  const events = await db.select().from(auditEventsTable);
  const openCases = complaintRows.filter(
    (caseRow) => !["Resolved", "Closed"].includes(caseRow.status),
  );
  const approvals = complaintRows.filter(
    (caseRow) => caseRow.status.toLowerCase() === "pending approval",
  );
  const monthlyStart = monthStart(0, reportTime);
  const [monthlyRefunds, monthlyAdjustments] = await Promise.all([
    db.select().from(compensationsTable).where(and(
      gte(compensationsTable.date, monthlyStart),
      sql`${compensationsTable.status} = 'Approved'`,
    )),
    db.select().from(compensationAdjustmentsTable).where(and(
      gte(compensationAdjustmentsTable.reviewedAt, monthlyStart),
      sql`${compensationAdjustmentsTable.status} = 'Approved'`,
    )),
  ]);
  const resolved = complaintRows.filter((caseRow) =>
    ["Resolved", "Closed"].includes(caseRow.status),
  );
  const resolutionTimes = resolved
    .map((caseRow) => {
      const event = events
        .filter(
          (item) =>
            item.caseId === caseRow.id &&
            /case resolution recorded|case closed/i.test(item.action),
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      return event
        ? Math.max(
            0,
            (event.createdAt.getTime() - caseRow.createdAt.getTime()) /
              3_600_000,
          )
        : null;
    })
    .filter((hours): hours is number => hours !== null);
  const rated = complaintRows.filter((caseRow) => caseRow.rating > 0);
  const totalRefunds = monthlyRefunds.reduce(
    (total, refund) => total + refund.amount,
    0,
  ) + monthlyAdjustments.reduce(
    (total, adjustment) => total + adjustment.amountDelta,
    0,
  );

  const result = GetDashboardResponse.parse({
    totalComplaints: complaintRows.length,
    openCases: openCases.length,
    pendingApprovals: approvals.length,
    refundExposure: openCases.reduce(
      (total, caseRow) => total + caseRow.recommendedAmount,
      0,
    ),
    avgResolutionHours: resolutionTimes.length
      ? Number(
          (
            resolutionTimes.reduce((total, hours) => total + hours, 0) /
            resolutionTimes.length
          ).toFixed(1),
        )
      : 0,
    csat: rated.length
      ? Number(
          (
            (rated.reduce((total, caseRow) => total + caseRow.rating, 0) /
              rated.length) *
            20
          ).toFixed(1),
        )
      : 0,
    monthlyRefunds: Number(totalRefunds.toFixed(2)),
    priorityCount: complaintRows.filter((caseRow) =>
      ["Critical", "High"].includes(caseRow.urgency),
    ).length,
    trends: await makeTrends(reportTime),
  });
  res.json(result);
});

router.get("/analytics", async (_req, res): Promise<void> => {
  const reportTime = new Date();
  const complaintRows = await db.select().from(complaintsTable).where(eq(complaintsTable.sentiment, "Negative"));
  const events = await db.select().from(auditEventsTable);
  const total = complaintRows.length;
  const thisMonth = monthStart(0, reportTime);
  const previousMonth = monthStart(-1, reportTime);
  const categories = new Map<
    string,
    { count: number; current: number; previous: number; negative: number }
  >();
  const resolutions = new Map<string, number>();
  for (const caseRow of complaintRows) {
    const category = caseRow.rootCause || caseRow.category || "Unclassified";
    const categoryData = categories.get(category) ?? {
      count: 0,
      current: 0,
      previous: 0,
      negative: 0,
    };
    categoryData.count += 1;
    if (caseRow.createdAt >= thisMonth) categoryData.current += 1;
    if (
      caseRow.createdAt >= previousMonth &&
      caseRow.createdAt < thisMonth
    ) {
      categoryData.previous += 1;
    }
    if (caseRow.sentiment.toLowerCase().includes("negative")) {
      categoryData.negative += 1;
    }
    categories.set(category, categoryData);
    if (caseRow.recommendation && caseRow.recommendation !== "AI review pending") {
      resolutions.set(
        caseRow.recommendation,
        (resolutions.get(caseRow.recommendation) ?? 0) + 1,
      );
    }
  }
  const issues = [...categories.entries()]
    .map(([name, data]) => ({
      name,
      count: data.count,
      change: data.previous > 0
          ? Number((((data.current - data.previous) / data.previous) * 100).toFixed(1))
          : data.current > 0
            ? 100
            : 0,
      sentiment:
        data.negative / data.count > 0.6
          ? "Negative"
          : data.negative > 0
            ? "Mixed"
            : "Neutral",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const resolutionBreakdown = [...resolutions.entries()]
    .map(([name, count]) => ({
      name,
      value: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const sentimentScore = total
    ? Math.round(
        (complaintRows.reduce((score, caseRow) => {
          const sentiment = caseRow.sentiment.toLowerCase();
          return (
            score +
            (sentiment.includes("positive")
              ? 1
              : sentiment.includes("neutral")
                ? 0.65
                : sentiment.includes("negative")
                  ? 0.25
                  : 0.5)
          );
        }, 0) /
          total) *
          100,
      )
    : 0;
  const resolvedCases = complaintRows.filter((caseRow) =>
    ["Resolved", "Closed"].includes(caseRow.status),
  );
  const responseTimes = complaintRows
    .map((caseRow) => {
      const event = events
        .filter(
          (item) =>
            item.caseId === caseRow.id &&
            !["CoSolve", "CoSolve AI"].includes(item.actor) &&
            item.action !== "Complaint received",
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      return event
        ? Math.max(
            0,
            (event.createdAt.getTime() - caseRow.createdAt.getTime()) /
              3_600_000,
          )
        : null;
    })
    .filter((hours): hours is number => hours !== null);
  const analytics = GetAnalyticsResponse.parse({
    trends: await makeTrends(reportTime),
    issues,
    resolutionBreakdown,
    sentimentScore,
    avgResponseHours: responseTimes.length
      ? Number(
          (
            responseTimes.reduce((totalHours, hours) => totalHours + hours, 0) /
            responseTimes.length
          ).toFixed(1),
        )
      : 0,
    firstContactResolution: total
      ? Math.round((resolvedCases.length / total) * 100)
      : 0,
    refundRate: resolvedCases.length
      ? Math.round(
          (resolvedCases.filter((caseRow) => caseRow.recommendedAmount > 0).length /
            resolvedCases.length) *
            100,
        )
      : 0,
  });
  res.json(analytics);
});

export default router;
