import type { RunpodSentiment } from "./runpod-client.ts";

type Assessment = {
  category: string;
  rootCause: string;
  urgency: string;
  confidence: number;
  summary: string;
};

export async function classifyComplaintHybrid(
  input: { subject: string; message: string; [key: string]: unknown },
  actions: {
    analyzeSentiment: (input: { subject: string; message: string }) => Promise<RunpodSentiment>;
    assess: (input: Record<string, unknown>, sentiment: RunpodSentiment) => Promise<Assessment>;
  },
) {
  // A provider failure is explicit: neither provider is a silent fallback for the other.
  const sentiment = await actions.analyzeSentiment(input);
  const assessment = await actions.assess(input, sentiment);
  if (
    !assessment.category?.trim() || !assessment.rootCause?.trim() || !assessment.summary?.trim() ||
    !["Critical", "High", "Medium", "Low"].includes(assessment.urgency) ||
    !Number.isFinite(assessment.confidence) || assessment.confidence < 0 || assessment.confidence > 1
  ) {
    throw new Error("Grafilab returned an invalid complaint assessment.");
  }
  return {
    classification: {
      category: assessment.category,
      rootCause: assessment.rootCause,
      urgency: assessment.urgency,
      confidence: assessment.confidence,
      sentiment: sentiment.sentiment,
      summary: sentiment.needsHumanReview
        ? `${assessment.summary} Runpod flagged this case for human review.`
        : assessment.summary,
    },
    sentiment,
  };
}
