import assert from "node:assert/strict";
import test from "node:test";
import { classifyComplaintHybrid } from "./hybrid-classification.ts";
import { parseRunpodSentiment, RunpodError } from "./runpod-client.ts";

const input = { subject: "Late delivery", message: "Two days late", orderValue: 20 };
const sentiment = { sentiment: "Negative", confidence: 0.94, needsHumanReview: true, modelVersion: "test-model" };
const assessment = { category: "Delivery", rootCause: "Possible courier delay", urgency: "Medium", confidence: 0.72, summary: "The parcel was delayed." };

test("hybrid classification keeps Runpod sentiment and separate provider confidences", async () => {
  const calls = [];
  const result = await classifyComplaintHybrid(input, {
    analyzeSentiment: async received => { calls.push("runpod"); assert.equal(received.message, input.message); return sentiment; },
    assess: async (received, analysis) => {
      calls.push("grafilab");
      assert.deepEqual(analysis, sentiment);
      assert.equal(received.orderValue, 20);
      return { ...assessment, sentiment: "Positive" };
    },
  });
  assert.deepEqual(calls, ["runpod", "grafilab"]);
  assert.equal(result.classification.sentiment, "Negative");
  assert.equal(result.classification.confidence, 0.72);
  assert.equal(result.sentiment.confidence, 0.94);
  assert.match(result.classification.summary, /flagged this case for human review/);
});

test("Runpod sentiment parsing normalizes labels without inventing taxonomy fields", () => {
  const result = parseRunpodSentiment({ sentiment: "negative", confidence: 0.9, needs_human_review: false, model_version: "test" });
  assert.equal(result.sentiment, "Negative");
  assert.equal(result.needsHumanReview, false);
  for (const data of [
    { sentiment: "negative", confidence: 1.5, needs_human_review: true },
    { sentiment: "unknown", confidence: 0.5, needs_human_review: false },
    { sentiment: "positive", confidence: 0.5 },
  ]) assert.throws(() => parseRunpodSentiment(data), RunpodError);
});

test("provider failures are never silently replaced by the other provider", async () => {
  let assessed = false;
  await assert.rejects(classifyComplaintHybrid(input, {
    analyzeSentiment: async () => { throw new RunpodError("Runpod unavailable"); },
    assess: async () => { assessed = true; return assessment; },
  }), /Runpod unavailable/);
  assert.equal(assessed, false);
  await assert.rejects(classifyComplaintHybrid(input, {
    analyzeSentiment: async () => sentiment,
    assess: async () => { throw new Error("Grafilab unavailable"); },
  }), /Grafilab unavailable/);
  await assert.rejects(classifyComplaintHybrid(input, {
    analyzeSentiment: async () => sentiment,
    assess: async () => ({ ...assessment, confidence: 99 }),
  }), /invalid complaint assessment/);
});
