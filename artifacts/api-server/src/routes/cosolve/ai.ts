import OpenAI from "openai";
import { and, eq, ne } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ClassifyComplaintParams,
  ClassifyComplaintResponse,
  DraftResponseParams,
  DraftResponseResponse,
  RecommendResolutionParams,
  RecommendResolutionResponse,
} from "@workspace/api-zod";
import {
  compensationsTable,
  complaintsTable,
  db,
  policiesTable,
  auditEventsTable,
} from "@workspace/db";
import { addAuditEvent, findComplaint, makeId } from "./helpers";
import { requestRunpodSentiment, RunpodError } from "./runpod-client";
import { classifyComplaintHybrid } from "./hybrid-classification";
import { deleteNonnegativeCases } from "./nonnegative-cases";

const router: IRouter = Router();

function grafilabModel(): string {
  return process.env.GRAFILAB_CHAT_MODEL?.trim() ||
    process.env.GRAFILAB_MODEL?.trim() || "grafilab/deepseek-v4-flash";
}

function getGrafilabClient(): OpenAI {
  const apiKey = process.env.GRAFILAB_API_KEY;
  if (!apiKey) {
    throw new Error("GRAFILAB_API_KEY is not configured.");
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://llm.grafilab.ai/v1",
    timeout: 90_000,
    maxRetries: 0,
  });
}

export async function requestJson<T>(
  systemPrompt: string,
  input: unknown,
  parse: (value: unknown) => T,
  maxTokens = 1024,
): Promise<T> {
  const result = await getGrafilabClient().chat.completions.create({
    model: grafilabModel(),
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  const content = result.choices[0]?.message.content;
  if (!content) {
    throw new Error("The AI service returned an empty response.");
  }
  return parse(parseModelJson(content));
}

async function requestText(
  systemPrompt: string,
  input: unknown,
): Promise<string> {
  const result = await getGrafilabClient().chat.completions.create({
    model: grafilabModel(),
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  const content = result.choices[0]?.message.content?.trim();
  if (!content) {
    throw new Error("The AI service returned an empty response.");
  }
  return content.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseModelJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("The AI service did not return a JSON object.");
  }
  return JSON.parse(fenced.slice(start, end + 1)) as unknown;
}

function sendAiError(req: Request, res: Response, error: unknown, provider = "Grafilab"): void {
  const failure = error as { name?: unknown; status?: unknown; code?: unknown };
  const missingKey =
    error instanceof Error && error.message === "GRAFILAB_API_KEY is not configured.";
  const rejectedKey = failure.status === 401;
  req.log?.error(
    {
      error: {
        name: typeof failure.name === "string" ? failure.name : "UnknownError",
        status: typeof failure.status === "number" ? failure.status : undefined,
        code: typeof failure.code === "string" ? failure.code : undefined,
        provider,
      },
    },
    "CoSolve AI request failed",
  );
  if (error instanceof RunpodError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(missingKey || rejectedKey ? 503 : 502).json({
    error: missingKey
      ? "AI is not configured. Add a Grafilab API key in Replit Secrets."
      : rejectedKey
        ? "Grafilab rejected the configured key. Update GRAFILAB_API_KEY in Replit Secrets."
         : failure.status === 404
         ? "Grafilab could not find the configured model. Set GRAFILAB_CHAT_MODEL to an available model from its catalog."
         : `${provider} could not complete this step. Review the case and try again.`,
  });
}

router.post("/complaints/:id/classify", async (req, res): Promise<void> => {
  const params = ClassifyComplaintParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const complaint = await findComplaint(params.data.id);
  if (!complaint) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }
  const [approvedResolution] = await db.select({ id: compensationsTable.id }).from(compensationsTable)
    .where(and(eq(compensationsTable.caseId, complaint.id), eq(compensationsTable.status, "Approved"))).limit(1);
  if (approvedResolution || ["Resolved", "Closed"].includes(complaint.status)) {
    res.status(409).json({ error: "Approved or closed cases cannot be reclassified or automatically removed by AI." });
    return;
  }
  let provider = "Runpod";
  try {
    const previousCases = await db
      .select({
        subject: complaintsTable.subject,
        category: complaintsTable.category,
        status: complaintsTable.status,
        sentiment: complaintsTable.sentiment,
      })
      .from(complaintsTable)
      .where(
        and(
          eq(complaintsTable.customerId, complaint.customerId),
          ne(complaintsTable.id, complaint.id),
        ),
      );

    const hybrid = await classifyComplaintHybrid(
      {
        subject: complaint.subject,
        message: complaint.message,
        orderValue: complaint.orderValue,
        source: complaint.source,
        previousCases,
      },
      {
        analyzeSentiment: requestRunpodSentiment,
        assess: async (input, sentiment) => {
          provider = "Grafilab";
          return requestJson(
            "Assess a customer complaint using only its evidence and history. Runpod has already provided sentiment; do not replace it. Assign category, likely rootCause, urgency (Critical, High, Medium, Low), confidence from 0 to 1 in YOUR assessment, and a one-sentence summary. Sentiment confidence is not urgency or assessment confidence. Treat root cause as provisional when not established. Never infer protected traits or make a financial decision. Return JSON with category, rootCause, urgency, confidence, summary. Do not repeat provider metadata or human-review flags in summary; the application adds them.",
            { ...input, runpodSentiment: sentiment },
            value => ClassifyComplaintResponse.parse({
              ...(value as Record<string, unknown>),
              sentiment: sentiment.sentiment,
            }),
          );
        },
      },
    );
    const result = ClassifyComplaintResponse.parse(hybrid.classification);
    provider = "Saving classification";
    if (result.sentiment === "Positive" || result.sentiment === "Neutral") {
      await deleteNonnegativeCases({
        ids: [complaint.id], actor: "CoSolve AI",
        confirmedSentiment: result.sentiment,
        reason: `A new sentiment analysis classified this review as ${result.sentiment}.`,
      });
      res.json(result);
      return;
    }

    const [updated] = await db
      .update(complaintsTable)
      .set({
        category: result.category,
        rootCause: result.rootCause,
        urgency: result.urgency,
        confidence: result.confidence,
        sentiment: result.sentiment,
        status: complaint.status === "New" ? "Investigating" : complaint.status,
      })
      .where(eq(complaintsTable.id, complaint.id))
      .returning();

    await addAuditEvent(
      complaint.id,
      "AI classification completed",
       "CoSolve AI (Runpod + Grafilab)",
      result.category + " · " + result.urgency + " urgency · " +
         Math.round(result.confidence * 100) + "% Grafilab assessment confidence. " +
         "Runpod sentiment: " + hybrid.sentiment.sentiment + " (" +
         Math.round(hybrid.sentiment.confidence * 100) + "% confidence); human review: " +
         (hybrid.sentiment.needsHumanReview ? "required" : "not flagged") +
         (hybrid.sentiment.modelVersion ? "; model: " + hybrid.sentiment.modelVersion : "") +
         ". " + result.summary,
    );
    res.json(result);
    void updated;
  } catch (error) {
    sendAiError(req, res, error, provider);
  }
});

router.post("/complaints/:id/recommend", async (req, res): Promise<void> => {
  const params = RecommendResolutionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const complaint = await findComplaint(params.data.id);
  if (!complaint) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }
  try {
    const [approved] = await db.select({ id: compensationsTable.id }).from(compensationsTable)
      .where(and(eq(compensationsTable.caseId, complaint.id), eq(compensationsTable.status, "Approved"))).limit(1);
    if (approved || complaint.status === "Resolved" || complaint.status === "Closed") {
      res.status(409).json({ error: "This resolution is final. Use a reviewed correction rather than generating a new offer." });
      return;
    }
    const [policies, previousCases, compensation] = await Promise.all([
      db.select().from(policiesTable).where(eq(policiesTable.enabled, true)),
      db
        .select({
          subject: complaintsTable.subject,
          category: complaintsTable.category,
          status: complaintsTable.status,
          recommendation: complaintsTable.recommendation,
          recommendedAmount: complaintsTable.recommendedAmount,
        })
        .from(complaintsTable)
        .where(eq(complaintsTable.customerId, complaint.customerId)),
      db
        .select({
          type: compensationsTable.type,
          amount: compensationsTable.amount,
          status: compensationsTable.status,
        })
        .from(compensationsTable)
        .innerJoin(
          complaintsTable,
          eq(compensationsTable.caseId, complaintsTable.id),
        )
        .where(eq(complaintsTable.customerId, complaint.customerId)),
    ]);
    const recommendations = await requestJson(
      "You recommend fair, proportionate remedies for a customer complaint. Follow the active compensation policies exactly, consider order value and the customer's complaint and compensation history, and explain policy fit. Do not promise that a refund was sent. Return JSON with resolution, amount, rationale, policyMatch, requiresApproval. Always require manager approval for refunds or any amount above the matching policy threshold. If no policy matches, choose no monetary remedy and require approval.",
      {
        case: {
          subject: complaint.subject,
          message: complaint.message,
          category: complaint.category,
          rootCause: complaint.rootCause,
          urgency: complaint.urgency,
          orderId: complaint.orderId,
          orderValue: complaint.orderValue,
        },
        previousCases,
        priorCompensation: compensation,
        activePolicies: policies,
      },
      (value) => RecommendResolutionResponse.parse(value),
    );
    const matchingPolicy = policies.find((policy) =>
      policy.category.toLowerCase() === complaint.category.toLowerCase(),
    );
    const amountOverPolicyCap =
      matchingPolicy !== undefined && recommendations.amount > matchingPolicy.maxAmount;
    const overApprovalThreshold =
      matchingPolicy !== undefined &&
      recommendations.amount > matchingPolicy.approvalThreshold;
    const result = RecommendResolutionResponse.parse({
      ...recommendations,
      policyMatch: amountOverPolicyCap
        ? "Exceeds " + matchingPolicy.name + " cap; manager review required"
        : recommendations.policyMatch,
      requiresApproval:
        recommendations.requiresApproval ||
        overApprovalThreshold ||
        amountOverPolicyCap ||
        recommendations.amount > 0,
    });
    if (!result.resolution.trim() || !Number.isFinite(result.amount) || result.amount < 0) {
      throw new Error("Invalid AI recommendation.");
    }
    const saved = await db.transaction(async tx => {
      const [current] = await tx.select().from(complaintsTable)
        .where(eq(complaintsTable.id, complaint.id)).for("update");
      const [final] = await tx.select({ id: compensationsTable.id }).from(compensationsTable)
        .where(and(eq(compensationsTable.caseId, complaint.id), eq(compensationsTable.status, "Approved"))).limit(1);
      if (!current || final || current.status === "Resolved" || current.status === "Closed") {
        return { error: "The resolution was finalized while AI was working. Its approved terms were not changed." };
      }
      if (current.recommendation !== complaint.recommendation || current.recommendedAmount !== complaint.recommendedAmount) {
        return { error: "The offer changed while AI was working. Your saved edits were preserved; review the case and retry." };
      }
      await tx.update(complaintsTable).set({
        recommendation: result.resolution, recommendedAmount: result.amount,
      }).where(eq(complaintsTable.id, complaint.id));
      await tx.insert(auditEventsTable).values({
        id: makeId("log"), caseId: complaint.id,
        action: "AI resolution recommendation generated", actor: "CoSolve AI (Grafilab)",
        details: result.resolution + "; $" + result.amount.toFixed(2) +
          ". Rationale: " + result.rationale + ". Policy: " + result.policyMatch +
          ". Manager review required before recording the final resolution.",
      });
      return { saved: true };
    });
    if ("error" in saved) {
      res.status(409).json({ error: saved.error });
      return;
    }
    res.json(result);
  } catch (error) {
    sendAiError(req, res, error);
  }
});

router.post("/complaints/:id/draft-response", async (req, res): Promise<void> => {
  const params = DraftResponseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const complaint = await findComplaint(params.data.id);
  if (!complaint) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }
  try {
    const response = await requestText(
      "Write a concise, warm customer-support response. Acknowledge the specific issue, avoid making unsupported promises, and clearly present the proposed resolution as pending manager approval when approval is required. Do not claim a refund, replacement, or voucher has already been sent. Return only the customer-ready message with no heading, JSON, or code fence.",
      {
        customerName: complaint.customerName,
        subject: complaint.subject,
        message: complaint.message,
        category: complaint.category,
        urgency: complaint.urgency,
        resolution: complaint.recommendation,
        amount: complaint.recommendedAmount,
        status: complaint.status,
      },
    );
    await db
      .update(complaintsTable)
      .set({ responseDraft: response })
      .where(eq(complaintsTable.id, complaint.id));
    await addAuditEvent(
      complaint.id,
      "Customer response drafted",
      "CoSolve AI",
      "A customer-ready response was created for the agent to review and send.",
    );
    res.json(DraftResponseResponse.parse({ response }));
  } catch (error) {
    sendAiError(req, res, error);
  }
});

export default router;
