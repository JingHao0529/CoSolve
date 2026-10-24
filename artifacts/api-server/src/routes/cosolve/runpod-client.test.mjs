import assert from "node:assert/strict";
import test from "node:test";
import { requestRunpodJson, runpodConfig, RunpodError } from "./runpod-client.ts";

const env = { RUNPOD_API_KEY: "test-only-key", RUNPOD_ENDPOINT_ID: "test-endpoint", RUNPOD_MODEL: "test-model" };
const answer = { category: "Delivery", rootCause: "Delay", urgency: "High", confidence: 0.9, sentiment: "Negative", summary: "Late order." };

test("Runpod configuration is mandatory and never falls back to Grafilab", () => {
  assert.throws(() => runpodConfig({ GRAFILAB_API_KEY: "test-only" }), /Runpod classification is not configured/);
  assert.throws(() => runpodConfig({ RUNPOD_API_KEY: "test-only" }), /RUNPOD_BASE_URL/);
  assert.equal(runpodConfig(env).baseURL, "https://api.runpod.ai/v2/test-endpoint/openai/v1");
  assert.throws(() => runpodConfig({ ...env, RUNPOD_BASE_URL: "http://example.com/v1" }), /HTTPS/);
});

test("classification sends the configured Runpod model and bearer key, not Grafilab", async () => {
  const calls = [];
  const result = await requestRunpodJson("Return classification JSON.", { message: "Late order" }, value => value, {
    env, fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
    },
  });
  assert.deepEqual(result, answer);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.runpod.ai/v2/test-endpoint/openai/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-only-key");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "test-model");
  assert.equal(body.response_format.type, "json_object");
});

test("Runpod can discover its deployed model and parse fenced reasoning-model JSON", async () => {
  const calls = [];
  const result = await requestRunpodJson("Return JSON.", {}, value => value, {
    env: { RUNPOD_API_KEY: "test-only-key", RUNPOD_BASE_URL: "https://runpod.example.test/discovery/v1/" },
    fetch: async url => {
      calls.push(url);
      return url.endsWith("/models")
        ? Response.json({ data: [{ id: "deployed-model" }] })
        : Response.json({ choices: [{ message: { content: `<think>Reasoning</think>\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`` } }] });
    },
  });
  assert.deepEqual(result, answer);
  assert.equal(calls.length, 2);
});

test("Runpod failures are explicit and do not expose upstream response bodies", async () => {
  await assert.rejects(requestRunpodJson("", {}, value => value, {
    env, fetch: async () => new Response("private upstream details", { status: 401 }),
  }), error => error instanceof RunpodError && error.status === 503 && /rejected/.test(error.message) && !/private/.test(error.message));
  await assert.rejects(requestRunpodJson("", {}, value => value, {
    env, fetch: async () => Response.json({ choices: [{ message: { content: "Not JSON" } }] }),
  }), /invalid classification/);
  await assert.rejects(requestRunpodJson("", {}, value => value, {
    env, fetch: async () => { throw new Error("private network details"); },
  }), /unavailable/);
});

test("custom Runpod classifier URLs use the saved endpoint and optional service key", async () => {
  const result = await requestRunpodJson("", { subject: "Late delivery", message: "Still waiting" }, value => value, {
    env: {
      COSOLVE_RUNPOD_API_KEY: "test-only-key",
      COSOLVE_SENTIMENT_URL: "https://classifier.example.test/analyze",
      COSOLVE_API_KEY: "test-only-service-key",
    },
    fetch: async (url, options) => {
      assert.equal(url, "https://classifier.example.test/analyze");
      assert.equal(options.headers["X-API-Key"], "test-only-service-key");
      assert.deepEqual(JSON.parse(options.body), { text: "Late delivery\n\nStill waiting" });
      return Response.json(answer);
    },
  });
  assert.deepEqual(result, answer);
});

test("sentiment-only endpoints are not falsely presented as full classification", async () => {
  await assert.rejects(requestRunpodJson("", { message: "Late" }, value => {
    if (!value.category) throw new Error("Category missing");
    return value;
  }, {
    env: { COSOLVE_RUNPOD_API_KEY: "test-only", COSOLVE_SENTIMENT_URL: "https://sentiment.example.test" },
    fetch: async () => Response.json({ sentiment: "negative", confidence: 0.9 }),
  }), /returns sentiment only/);
});

test("custom application authentication failures identify the separate service key", async () => {
  await assert.rejects(requestRunpodJson("", { message: "Synthetic test" }, value => value, {
    env: { COSOLVE_RUNPOD_API_KEY: "test-only", COSOLVE_SENTIMENT_URL: "https://classifier.example.test" },
    fetch: async () => new Response("private upstream details", { status: 401 }),
  }), error => error instanceof RunpodError && /COSOLVE_API_KEY/.test(error.message) && !/private/.test(error.message));
});
