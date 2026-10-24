import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const staffCookie = process.env.COSOLVE_TEST_STAFF_COOKIE;
const managerCookie = process.env.COSOLVE_TEST_MANAGER_COOKIE;
const staffId = process.env.COSOLVE_TEST_STAFF_USER_ID;
const managerId = process.env.COSOLVE_TEST_MANAGER_USER_ID;
const baseUrl = (process.env.COSOLVE_TEST_BASE_URL || "http://localhost:80").replace(/\/+$/, "");

test(
  "staff can request compensation review, managers approve, and anonymous requests are rejected",
  {
    skip: !staffCookie || !managerCookie || !staffId || !managerId
      ? "Set two test Clerk session cookies and user IDs to run the authenticated API integration test."
      : false,
  },
  async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const email = `approval-test-${randomUUID()}@example.invalid`;
    const request = async (method, path, data, cookie) => {
      const headers = { "Content-Type": "application/json" };
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(`${baseUrl}/api/complaints${path}`, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    };
    const listPendingAdjustments = async (cookie) => {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(`${baseUrl}/api/compensation-adjustments/pending`, { headers });
      return { status: response.status, body: await response.json() };
    };
    const create = async (subject) => {
      const result = await request("POST", "", {
        customerName: "Approval regression fixture",
        customerEmail: email,
        source: "Approval integration test",
        subject,
        message: "Disposable compensation approval test",
      });
      assert.equal(result.status, 201);
      return result.body.id;
    };
    const patch = (id, data, cookie) => request("PATCH", `/${id}`, data, cookie);
    const approve = (id, cookie) => request("POST", `/${id}/approve`, undefined, cookie);
    const requestAdjustment = (id, data, cookie) =>
      request("POST", `/${id}/compensation-adjustments`, data, cookie);
    const reviewAdjustment = (id, adjustmentId, data, cookie) =>
      request("POST", `/${id}/compensation-adjustments/${adjustmentId}/review`, data, cookie);
    const createPendingAdjustment = async (subject, originalAmount, requestedAmount, date) => {
      const caseId = await create(subject);
      assert.equal((await patch(caseId, {
        recommendation: "Partial refund",
        recommendedAmount: originalAmount,
      }, staffCookie)).status, 200);
      assert.equal((await patch(caseId, { status: "Pending approval" }, staffCookie)).status, 200);
      assert.equal((await approve(caseId, managerCookie)).status, 200);
      const result = await requestAdjustment(caseId, {
        type: "Full refund",
        amount: requestedAmount,
        rationale: "Queue ordering regression fixture.",
      }, staffCookie);
      assert.equal(result.status, 201);
      await pool.query(
        "update cosolve_compensation_adjustments set date = $2 where id = $1",
        [result.body.id, date],
      );
      return { caseId, adjustmentId: result.body.id };
    };
    const getDashboard = async (cookie) => {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(`${baseUrl}/api/dashboard`, { headers });
      assert.equal(response.status, 200);
      return response.json();
    };
    const getAnalytics = async (cookie) => {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(`${baseUrl}/api/analytics`, { headers });
      assert.equal(response.status, 200);
      return response.json();
    };
    const getRefundTrendSnapshot = async () => {
      const [dashboard, analytics] = await Promise.all([
        getDashboard(managerCookie),
        getAnalytics(managerCookie),
      ]);
      const dashboardRefunds = dashboard.trends.map(({ label, refunds }) => ({ label, refunds }));
      const analyticsRefunds = analytics.trends.map(({ label, refunds }) => ({ label, refunds }));
      assert.deepEqual(
        analyticsRefunds,
        dashboardRefunds,
        "Dashboard and analytics refund totals should match for every shared review month.",
      );
      return { dashboard, analytics };
    };
    const monthStart = (offset, reference = new Date()) => {
      return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + offset, 1));
    };
    const trendRefundsFor = (dashboard, date) => {
      const label = date.toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      });
      const point = dashboard.trends.find((entry) => entry.label === label);
      assert.ok(point, `Expected a dashboard trend for ${label}`);
      return point.refunds;
    };
    const effects = async (id) => {
      const compensation = await pool.query(
        "select amount, status from cosolve_compensations where case_id = $1", [id],
      );
      const events = await pool.query(
        "select action, actor from cosolve_audit_events where case_id = $1", [id],
      );
      const adjustments = await pool.query(
        "select id, base_type, base_amount, type, amount, amount_delta, rationale, status, requested_by, reviewer, review_note from cosolve_compensation_adjustments where case_id = $1 order by date",
        [id],
      );
      return { compensation: compensation.rows, adjustments: adjustments.rows, events: events.rows };
    };

    try {
      assert.notEqual(staffId, managerId, "Use distinct verified staff and manager test users.");
      const monetary = await create("Monetary remedy needs approval");
      assert.equal((await patch(monetary, { status: "Pending approval" })).status, 401);
      assert.equal((await approve(monetary)).status, 401);
      assert.equal((await patch(monetary, { recommendation: "Partial refund", recommendedAmount: 40 }, staffCookie)).status, 200);
      assert.equal((await patch(monetary, { status: "Pending approval" })).status, 401);

      for (const status of ["Resolved", "Closed"]) {
        const blocked = await patch(monetary, { status }, staffCookie);
        assert.equal(blocked.status, 409);
        assert.match(blocked.body.error, /manager approval/i);
      }
      const blockedEffects = await effects(monetary);
      assert.equal(blockedEffects.compensation.length, 0);
      const unchanged = await pool.query("select status from cosolve_complaints where id = $1", [monetary]);
      assert.equal(unchanged.rows[0].status, "New");

      assert.equal((await patch(monetary, { status: "Pending approval" }, staffCookie)).status, 200);
      assert.equal((await approve(monetary, staffCookie)).status, 403);
      const stillPending = await pool.query(
        "select status from cosolve_complaints where id = $1",
        [monetary],
      );
      assert.equal(stillPending.rows[0].status, "Pending approval");
      assert.equal((await effects(monetary)).compensation.length, 0);
      assert.equal((await patch(monetary, {
        recommendation: "Changed after review request",
        recommendedAmount: 55,
      }, staffCookie)).status, 200);
      assert.equal((await patch(monetary, {
        recommendation: "Partial refund", recommendedAmount: 40,
      }, managerCookie)).status, 200);
      assert.equal((await patch(monetary, { status: "Resolved" }, managerCookie)).status, 409);

      const simultaneous = await Promise.all([
        approve(monetary, staffCookie),
        approve(monetary, managerCookie),
        approve(monetary, staffCookie),
        approve(monetary, managerCookie),
        approve(monetary, staffCookie),
      ]);
      assert.equal(simultaneous.filter(result => result.status === 200).length, 1);
      assert.equal(simultaneous.filter(result => result.status === 403).length, 3);
      assert.equal(simultaneous.filter(result => result.status === 409).length, 1);
      const approved = await effects(monetary);
      assert.deepEqual(approved.compensation, [{ amount: 40, status: "Approved" }]);
      assert.deepEqual(
        approved.events.filter(event => event.action === "Manager approval requested"),
        [{ action: "Manager approval requested", actor: staffId }],
      );
      const resolutionEvents = approved.events.filter(event => event.action === "Case resolution recorded");
      const compensationEvents = approved.events.filter(event => event.action === "Compensation approved");
      assert.equal(resolutionEvents.length, 1);
      assert.equal(compensationEvents.length, 1);
      assert.equal(resolutionEvents[0].actor, managerId);
      assert.equal(compensationEvents[0].actor, managerId);
      assert.equal((await approve(monetary, managerCookie)).status, 409);
      const afterRepeatedApproval = await effects(monetary);
      assert.deepEqual(afterRepeatedApproval.compensation, [{ amount: 40, status: "Approved" }]);
      assert.equal(
        afterRepeatedApproval.events.filter(event => event.action === "Case resolution recorded").length,
        1,
      );
      assert.equal(
        afterRepeatedApproval.events.filter(event => event.action === "Compensation approved").length,
        1,
      );
      const beforeMovingPayout = await getDashboard(managerCookie);
      const originalPayoutDate = monthStart(-1);
      originalPayoutDate.setHours(12, 0, 0, 0);
      await pool.query(
        "update cosolve_compensations set date = $2 where case_id = $1",
        [monetary, originalPayoutDate],
      );
      const afterMovingPayout = await getDashboard(managerCookie);
      assert.equal(afterMovingPayout.monthlyRefunds, beforeMovingPayout.monthlyRefunds - 40);
      assert.equal(
        trendRefundsFor(afterMovingPayout, originalPayoutDate),
        trendRefundsFor(beforeMovingPayout, originalPayoutDate) + 40,
      );
      assert.equal(
        trendRefundsFor(afterMovingPayout, monthStart(0)),
        trendRefundsFor(beforeMovingPayout, monthStart(0)) - 40,
      );
      assert.match(
        (await patch(monetary, { recommendedAmount: 80 }, staffCookie)).body.error,
        /approved compensation is final/i,
      );
      assert.match(
        (await patch(monetary, { recommendation: "Store voucher" }, staffCookie)).body.error,
        /approved compensation is final/i,
      );
      assert.equal((await requestAdjustment(monetary, {
        type: "Store voucher",
        amount: 25,
        rationale: "The original refund included a duplicate line item.",
      })).status, 401);
      assert.equal((await requestAdjustment(monetary, {
        type: "Store voucher",
        amount: 25,
      }, staffCookie)).status, 400);
      const adjustmentRequest = await requestAdjustment(monetary, {
        type: "Store voucher",
        amount: 25,
        rationale: "The original refund included a duplicate line item.",
      }, staffCookie);
      assert.equal(adjustmentRequest.status, 201);
      assert.equal(adjustmentRequest.body.status, "Pending review");
      assert.equal(adjustmentRequest.body.requestedBy, staffId);
      assert.equal(adjustmentRequest.body.amountDelta, -15);
      const olderPending = await createPendingAdjustment(
        "Older pending correction fixture",
        10,
        10,
        new Date("2024-01-01T00:00:00.000Z"),
      );
      const newerPending = await createPendingAdjustment(
        "Newer pending correction fixture",
        20,
        20,
        new Date("2024-01-02T00:00:00.000Z"),
      );
      await pool.query(
        "update cosolve_compensation_adjustments set date = $2 where id = $1",
        [adjustmentRequest.body.id, new Date("2024-01-03T00:00:00.000Z")],
      );
      assert.equal((await listPendingAdjustments()).status, 401);
      assert.equal((await listPendingAdjustments(staffCookie)).status, 200);
      const pendingQueue = await listPendingAdjustments(managerCookie);
      assert.equal(pendingQueue.status, 200);
      const fixtureCaseIds = new Set([olderPending.caseId, newerPending.caseId, monetary]);
      const fixtureQueue = pendingQueue.body.filter((item) => fixtureCaseIds.has(item.caseId));
      assert.deepEqual(fixtureQueue.map((item) => item.id), [
        olderPending.adjustmentId,
        newerPending.adjustmentId,
        adjustmentRequest.body.id,
      ]);
      const queuedAdjustment = pendingQueue.body.find((item) => item.id === adjustmentRequest.body.id);
      assert.deepEqual(queuedAdjustment, {
        id: adjustmentRequest.body.id,
        caseId: monetary,
        caseSubject: "Monetary remedy needs approval",
        customerName: "Approval regression fixture",
        type: "Store voucher",
        amount: 25,
        amountDelta: -15,
        rationale: "The original refund included a duplicate line item.",
        requesterName: queuedAdjustment.requesterName,
        date: adjustmentRequest.body.date,
      });
      assert.equal(typeof queuedAdjustment.requesterName, "string");
      assert.ok(queuedAdjustment.requesterName.length > 0);
      assert.equal("requestedBy" in queuedAdjustment, false);
      const reviewedOldest = await reviewAdjustment(olderPending.caseId, olderPending.adjustmentId, {
        decision: "approve",
        reviewNote: "Oldest queue item reviewed.",
      }, managerCookie);
      assert.equal(reviewedOldest.status, 200);
      const queueAfterReviewingOldest = await listPendingAdjustments(managerCookie);
      assert.equal(queueAfterReviewingOldest.status, 200);
      const remainingFixtureQueue = queueAfterReviewingOldest.body
        .filter((item) => fixtureCaseIds.has(item.caseId));
      assert.deepEqual(remainingFixtureQueue.map((item) => item.id), [
        newerPending.adjustmentId,
        adjustmentRequest.body.id,
      ]);
      assert.equal((await requestAdjustment(monetary, {
        type: "Refund",
        amount: 30,
        rationale: "Second request while one is open.",
      }, staffCookie)).status, 409);
      const pendingAdjustmentEffects = await effects(monetary);
      assert.deepEqual(pendingAdjustmentEffects.compensation, [{ amount: 40, status: "Approved" }]);
      assert.equal(pendingAdjustmentEffects.adjustments.length, 1);
      assert.equal(pendingAdjustmentEffects.adjustments[0].status, "Pending review");
      const caseWithPendingAdjustment = await request("GET", `/${monetary}`, undefined, staffCookie);
      assert.equal(caseWithPendingAdjustment.status, 200);
      assert.equal(caseWithPendingAdjustment.body.recommendation, "Partial refund");
      assert.equal(caseWithPendingAdjustment.body.recommendedAmount, 40);
      assert.equal(caseWithPendingAdjustment.body.compensationHistory.find(entry => entry.status === "Approved").amount, 40);
      const { dashboard: withPendingReduction } = await getRefundTrendSnapshot();
      assert.equal(withPendingReduction.monthlyRefunds, afterMovingPayout.monthlyRefunds);
      assert.equal(
        trendRefundsFor(withPendingReduction, originalPayoutDate),
        trendRefundsFor(afterMovingPayout, originalPayoutDate),
      );
      assert.equal(
        trendRefundsFor(withPendingReduction, monthStart(0)),
        trendRefundsFor(afterMovingPayout, monthStart(0)),
      );
      assert.equal(pendingAdjustmentEffects.events.filter(event => event.action === "Compensation approved").length, 1);
      for (const attempt of [
        { recommendedAmount: 25 },
        { recommendation: "Store voucher" },
      ]) {
        assert.equal((await patch(monetary, attempt, staffCookie)).status, 409);
      }
      const pendingCase = await pool.query(
        "select recommendation, recommended_amount from cosolve_complaints where id = $1",
        [monetary],
      );
      assert.deepEqual(pendingCase.rows[0], { recommendation: "Partial refund", recommended_amount: 40 });
      assert.equal((await reviewAdjustment(monetary, adjustmentRequest.body.id, { decision: "approve" })).status, 401);
      assert.equal((await reviewAdjustment(monetary, adjustmentRequest.body.id, {
        decision: "approve",
      }, staffCookie)).status, 403);
      const reviewedAdjustment = await reviewAdjustment(monetary, adjustmentRequest.body.id, {
        decision: "approve",
        reviewNote: "Duplicate line item confirmed.",
      }, managerCookie);
      assert.equal(reviewedAdjustment.status, 200);
      assert.equal(reviewedAdjustment.body.status, "Approved");
      assert.equal(reviewedAdjustment.body.reviewer, managerId);
      assert.equal(reviewedAdjustment.body.reviewNote, "Duplicate line item confirmed.");
      const refreshedQueue = await listPendingAdjustments(managerCookie);
      assert.equal(refreshedQueue.status, 200);
      assert.equal(refreshedQueue.body.some((item) => item.id === adjustmentRequest.body.id), false);
      assert.equal((await reviewAdjustment(monetary, adjustmentRequest.body.id, {
        decision: "approve",
      }, managerCookie)).status, 409);
      const adjustedEffects = await effects(monetary);
      assert.deepEqual(adjustedEffects.compensation, [{ amount: 40, status: "Approved" }]);
      assert.deepEqual(adjustedEffects.adjustments.map(({ type, amount, amount_delta, status, requested_by, reviewer }) =>
        ({ type, amount, amount_delta, status, requested_by, reviewer })), [{
        type: "Store voucher",
        amount: 25,
        amount_delta: -15,
        status: "Approved",
        requested_by: staffId,
        reviewer: managerId,
      }]);
      assert.deepEqual(
        adjustedEffects.events.filter(event => event.action === "Compensation approved"),
        compensationEvents,
      );
      assert.deepEqual(adjustedEffects.events.filter(event => event.action === "Compensation adjustment approved"), [
        { action: "Compensation adjustment approved", actor: managerId },
      ]);
      const finalAdjustedCase = await pool.query(
        "select recommendation, recommended_amount from cosolve_complaints where id = $1",
        [monetary],
      );
      assert.deepEqual(finalAdjustedCase.rows[0], { recommendation: "Store voucher", recommended_amount: 25 });
      const approvedReductionTotal = adjustedEffects.compensation
        .filter(({ status }) => status === "Approved")
        .reduce((total, compensation) => total + compensation.amount, 0) +
        adjustedEffects.adjustments
          .filter(({ status }) => status === "Approved")
          .reduce((total, adjustment) => total + adjustment.amount_delta, 0);
      assert.equal(finalAdjustedCase.rows[0].recommended_amount, approvedReductionTotal);
      const { dashboard: afterApprovedReduction } = await getRefundTrendSnapshot();
      assert.equal(
        afterApprovedReduction.monthlyRefunds,
        withPendingReduction.monthlyRefunds - 15,
      );
      assert.equal(
        trendRefundsFor(afterApprovedReduction, originalPayoutDate),
        trendRefundsFor(withPendingReduction, originalPayoutDate),
      );
      assert.equal(
        trendRefundsFor(afterApprovedReduction, monthStart(0)),
        trendRefundsFor(withPendingReduction, monthStart(0)) - 15,
      );
      const detail = await request("GET", `/${monetary}`, undefined, staffCookie);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.recommendation, "Store voucher");
      assert.equal(detail.body.recommendedAmount, 25);
      assert.equal(detail.body.compensationAdjustments[0].amountDelta, -15);
      assert.equal(detail.body.compensationHistory.find(entry => entry.status === "Approved").amount, 40);
      const rejectionRequest = await requestAdjustment(monetary, {
        type: "Full refund",
        amount: 40,
        rationale: "Rejected correction fixture.",
      }, staffCookie);
      assert.equal(rejectionRequest.status, 201);
      const rejectedAdjustment = await reviewAdjustment(monetary, rejectionRequest.body.id, {
        decision: "reject",
        reviewNote: "Evidence does not support the correction.",
      }, managerCookie);
      assert.equal(rejectedAdjustment.status, 200);
      assert.equal(rejectedAdjustment.body.status, "Rejected");
      assert.equal(rejectedAdjustment.body.reviewer, managerId);
      const { dashboard: afterRejectedIncrease } = await getRefundTrendSnapshot();
      assert.equal(afterRejectedIncrease.monthlyRefunds, afterApprovedReduction.monthlyRefunds);
      assert.equal(
        trendRefundsFor(afterRejectedIncrease, monthStart(0)),
        trendRefundsFor(afterApprovedReduction, monthStart(0)),
      );
      const afterRejection = await pool.query(
        "select recommendation, recommended_amount from cosolve_complaints where id = $1",
        [monetary],
      );
      assert.deepEqual(afterRejection.rows[0], { recommendation: "Store voucher", recommended_amount: 25 });
      const caseAfterRejectedAdjustment = await request("GET", `/${monetary}`, undefined, staffCookie);
      assert.equal(caseAfterRejectedAdjustment.status, 200);
      assert.equal(caseAfterRejectedAdjustment.body.recommendation, "Store voucher");
      assert.equal(caseAfterRejectedAdjustment.body.recommendedAmount, 25);
      assert.equal(caseAfterRejectedAdjustment.body.compensationHistory.find(entry => entry.status === "Approved").amount, 40);

      const increaseCase = await create("Positive adjustment analytics fixture");
      assert.equal((await patch(increaseCase, {
        recommendation: "Partial refund",
        recommendedAmount: 30,
      }, staffCookie)).status, 200);
      assert.equal((await patch(increaseCase, { status: "Pending approval" }, staffCookie)).status, 200);
      assert.equal((await approve(increaseCase, managerCookie)).status, 200);
      const { dashboard: beforePositiveRequest } = await getRefundTrendSnapshot();
      const positiveRequest = await requestAdjustment(increaseCase, {
        type: "Full refund",
        amount: 45,
        rationale: "The reviewed evidence supports a higher refund.",
      }, staffCookie);
      assert.equal(positiveRequest.status, 201);
      assert.equal(positiveRequest.body.amountDelta, 15);
      const { dashboard: withPendingIncrease } = await getRefundTrendSnapshot();
      assert.equal(withPendingIncrease.monthlyRefunds, beforePositiveRequest.monthlyRefunds);
      const approvedIncrease = await reviewAdjustment(increaseCase, positiveRequest.body.id, {
        decision: "approve",
        reviewNote: "Additional refund approved.",
      }, managerCookie);
      assert.equal(approvedIncrease.status, 200);
      assert.equal(approvedIncrease.body.status, "Approved");
      const increaseEffects = await effects(increaseCase);
      const increaseCaseAmount = await pool.query(
        "select recommended_amount from cosolve_complaints where id = $1",
        [increaseCase],
      );
      const approvedIncreaseTotal = increaseEffects.compensation
        .filter(({ status }) => status === "Approved")
        .reduce((total, compensation) => total + compensation.amount, 0) +
        increaseEffects.adjustments
          .filter(({ status }) => status === "Approved")
          .reduce((total, adjustment) => total + adjustment.amount_delta, 0);
      assert.equal(increaseCaseAmount.rows[0].recommended_amount, approvedIncreaseTotal);
      assert.equal(increaseCaseAmount.rows[0].recommended_amount, 45);
      const { dashboard: afterApprovedIncrease } = await getRefundTrendSnapshot();
      assert.equal(afterApprovedIncrease.monthlyRefunds, withPendingIncrease.monthlyRefunds + 15);
      assert.equal(
        trendRefundsFor(afterApprovedIncrease, monthStart(0)),
        trendRefundsFor(withPendingIncrease, monthStart(0)) + 15,
      );
      const beforeReopen = await effects(monetary);
      const reopened = await patch(monetary, { status: "Investigating" }, managerCookie);
      assert.equal(reopened.status, 200);
      const reopenedStatus = await pool.query("select status from cosolve_complaints where id = $1", [monetary]);
      assert.equal(reopenedStatus.rows[0].status, "Investigating");
      const afterReopen = await effects(monetary);
      assert.deepEqual(afterReopen.compensation, beforeReopen.compensation);
      assert.deepEqual(afterReopen.adjustments, beforeReopen.adjustments);
      const reopenedEvent = afterReopen.events.find(event => event.action === "Case reopened for investigation");
      assert.equal(reopenedEvent.actor, managerId);
      assert.match(reopenedEvent.details, /approved compensation remains unchanged at \$25\.00/i);
      assert.equal((await patch(monetary, { status: "Resolved" }, managerCookie)).status, 200);
      const restoredStatus = await pool.query("select status from cosolve_complaints where id = $1", [monetary]);
      assert.equal(restoredStatus.rows[0].status, "Resolved");
      const afterReResolve = await effects(monetary);
      assert.deepEqual(afterReResolve.compensation, beforeReopen.compensation);
      assert.deepEqual(afterReResolve.adjustments, beforeReopen.adjustments);
      for (const status of ["New", "Pending approval"]) {
        assert.match(
          (await patch(monetary, { status }, staffCookie)).body.error,
          /cannot be moved back/i,
        );
      }
      assert.equal((await patch(monetary, {
        resolutionNote: "Reviewed by the support team",
      }, staffCookie)).status, 200);
      assert.equal((await patch(monetary, {
        customerResponseSent: "We have arranged your partial refund.",
      }, staffCookie)).status, 200);
      assert.equal((await patch(monetary, { status: "Closed" }, managerCookie)).status, 200);
      assert.equal((await patch(monetary, { status: "Closed" }, managerCookie)).status, 200);
      const beforeClosedFollowUp = await effects(monetary);
      for (const status of ["New", "Investigating", "Pending approval", "Resolved"]) {
        assert.equal((await patch(monetary, { status }, managerCookie)).status, 409);
      }
      assert.equal((await patch(monetary, {
        recommendation: "Full refund",
        recommendedAmount: 80,
      }, managerCookie)).status, 409);
      assert.equal((await approve(monetary, managerCookie)).status, 409);
      assert.equal((await patch(monetary, {
        resolutionNote: "Updated follow-up after closure",
      }, staffCookie)).status, 200);
      assert.equal((await patch(monetary, {
        responseDraft: "Updated customer response after closure.",
      }, staffCookie)).status, 200);
      assert.equal((await patch(monetary, {
        customerResponseSent: "We confirmed the approved remedy with you.",
      }, staffCookie)).status, 200);
      assert.equal((await patch(monetary, { status: "Closed" }, managerCookie)).status, 200);
      const closedEvents = await effects(monetary);
      const finalCase = await pool.query(
        "select status, recommendation, recommended_amount, resolution_note, response_draft from cosolve_complaints where id = $1",
        [monetary],
      );
      assert.deepEqual(finalCase.rows[0], {
        status: "Closed",
        recommendation: "Store voucher",
        recommended_amount: 25,
        resolution_note: "Updated follow-up after closure",
        response_draft: "Updated customer response after closure.",
      });
      assert.deepEqual(closedEvents.compensation, beforeClosedFollowUp.compensation);
      assert.deepEqual(closedEvents.adjustments, beforeClosedFollowUp.adjustments);
      assert.equal(closedEvents.events.filter(event => event.action === "Case resolution recorded").length, 1);
      assert.equal(closedEvents.events.filter(event => event.action === "Case closed").length, 1);
      assert.equal(closedEvents.events.filter(event => event.action === "Manager approval requested").length, 1);
      assert.deepEqual(closedEvents.events.filter(event => event.action === "Compensation approved"), [
        { action: "Compensation approved", actor: managerId },
      ]);

      const bypass = await create("New amount cannot bypass approval");
      assert.equal((await patch(bypass, {
        status: "Resolved", recommendation: "Refund", recommendedAmount: 60,
      }, staffCookie)).status, 409);
      const bypassCase = await pool.query("select status, recommended_amount from cosolve_complaints where id = $1", [bypass]);
      assert.deepEqual(bypassCase.rows[0], { status: "New", recommended_amount: 0 });
      assert.equal((await effects(bypass)).compensation.length, 0);

      for (const status of ["Resolved", "Closed"]) {
        const zero = await create(`Zero-value apology ${status}`);
        assert.equal((await patch(zero, { status, recommendation: "Apology", recommendedAmount: 0 }, staffCookie)).status, 200);
        const zeroEffects = await effects(zero);
        assert.equal(zeroEffects.compensation.length, 0);
        assert.equal(zeroEffects.events.filter(event => event.action === "Manager approval requested").length, 0);
        const expectedAction = status === "Resolved" ? "Case resolution recorded" : "Case closed";
        assert.equal(zeroEffects.events.filter(event => event.action === expectedAction).length, 1);
      }

      const boundaryAnchor = new Date();
      const boundaryMonth = monthStart(0, boundaryAnchor);
      const payoutMonth = monthStart(-2, boundaryAnchor);
      const payoutDate = new Date(payoutMonth.getTime() + 12 * 60 * 60 * 1000);
      const boundaryBefore = new Date(boundaryMonth.getTime() - 1);
      const boundaryAfter = new Date(boundaryMonth);
      const beforeBoundaryCorrection = await createPendingAdjustment(
        "Correction reviewed just before UTC month-end",
        100,
        80,
        new Date("2024-01-04T00:00:00.000Z"),
      );
      const afterBoundaryCorrection = await createPendingAdjustment(
        "Correction reviewed just after UTC month-end",
        200,
        230,
        new Date("2024-01-05T00:00:00.000Z"),
      );
      for (const fixture of [beforeBoundaryCorrection, afterBoundaryCorrection]) {
        await pool.query(
          "update cosolve_compensations set date = $2 where case_id = $1",
          [fixture.caseId, payoutDate],
        );
      }
      const beforeBoundaryBaseline = await getRefundTrendSnapshot();

      for (const fixture of [beforeBoundaryCorrection, afterBoundaryCorrection]) {
        const reviewed = await reviewAdjustment(
          fixture.caseId,
          fixture.adjustmentId,
          { decision: "approve", reviewNote: "Month-boundary fixture approved." },
          managerCookie,
        );
        assert.equal(reviewed.status, 200);
        assert.equal(reviewed.body.status, "Approved");
      }
      await pool.query(
        "update cosolve_compensation_adjustments set reviewed_at = $2 where id = $1",
        [beforeBoundaryCorrection.adjustmentId, boundaryBefore],
      );
      await pool.query(
        "update cosolve_compensation_adjustments set reviewed_at = $2 where id = $1",
        [afterBoundaryCorrection.adjustmentId, boundaryAfter],
      );

      const boundaryRecords = await pool.query(
        `select c.amount as payout_amount, c.date as payout_date,
                a.amount_delta, a.reviewed_at, a.status
         from cosolve_compensations c
         join cosolve_compensation_adjustments a on a.compensation_id = c.id
         where a.id = any($1::text[])`,
        [[beforeBoundaryCorrection.adjustmentId, afterBoundaryCorrection.adjustmentId]],
      );
      assert.equal(boundaryRecords.rows.length, 2);
      for (const row of boundaryRecords.rows) {
        assert.equal(row.payout_date.toISOString(), payoutDate.toISOString());
        assert.equal(row.status, "Approved");
      }
      const beforeBoundaryRecord = boundaryRecords.rows.find(
        (row) => row.reviewed_at.toISOString() === boundaryBefore.toISOString(),
      );
      const afterBoundaryRecord = boundaryRecords.rows.find(
        (row) => row.reviewed_at.toISOString() === boundaryAfter.toISOString(),
      );
      assert.ok(beforeBoundaryRecord, "Expected a review at 1 ms before the UTC month boundary.");
      assert.ok(afterBoundaryRecord, "Expected a review exactly at the UTC month boundary.");
      assert.equal(beforeBoundaryRecord.payout_amount, 100);
      assert.equal(beforeBoundaryRecord.amount_delta, -20);
      assert.equal(afterBoundaryRecord.payout_amount, 200);
      assert.equal(afterBoundaryRecord.amount_delta, 30);

      const afterBoundarySnapshot = await getRefundTrendSnapshot();
      for (let index = -5; index <= 0; index += 1) {
        const reportMonth = monthStart(index, boundaryAnchor);
        const expectedDelta = index === -1 ? -20 : index === 0 ? 30 : 0;
        assert.equal(
          trendRefundsFor(afterBoundarySnapshot.dashboard, reportMonth) -
            trendRefundsFor(beforeBoundaryBaseline.dashboard, reportMonth),
          expectedDelta,
          `Expected month ${reportMonth.toISOString()} to include only its reviewed correction delta.`,
        );
      }
      assert.equal(
        trendRefundsFor(afterBoundarySnapshot.dashboard, payoutMonth) -
          trendRefundsFor(beforeBoundaryBaseline.dashboard, payoutMonth),
        0,
        "The original approved payouts must stay in their payout month.",
      );
      assert.equal(
        afterBoundarySnapshot.dashboard.monthlyRefunds,
        beforeBoundaryBaseline.dashboard.monthlyRefunds + 30,
        "The current month's refund total should include only the correction reviewed at its UTC boundary.",
      );
    } finally {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        await connection.query("delete from cosolve_compensation_adjustments where case_id in (select id from cosolve_complaints where customer_email = $1)", [email]);
        await connection.query("delete from cosolve_compensations where case_id in (select id from cosolve_complaints where customer_email = $1)", [email]);
        await connection.query("delete from cosolve_audit_events where case_id in (select id from cosolve_complaints where customer_email = $1)", [email]);
        await connection.query("delete from cosolve_complaints where customer_email = $1", [email]);
        await connection.query("delete from cosolve_customers where email = $1", [email]);
        await connection.query("COMMIT");
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
        await pool.end();
      }
    }
  },
);
