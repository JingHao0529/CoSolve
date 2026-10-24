// Explicit opt-in: invokes the real configured AI providers using synthetic data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import express from "express";
import { build } from "esbuild";
import pg from "pg";

test("live hybrid AI refreshes pending guidance and protects an explicitly reviewed approval", {
  skip: process.env.COSOLVE_LIVE_AI_TEST !== "1",
  timeout: 240_000,
}, async () => {
  const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const directory = await mkdtemp(path.join(apiDir, ".hybrid-ai-live-"));
  const email = `hybrid-ai-${randomUUID()}@example.invalid`;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let routePool, server;
  try {
    const entry = path.join(directory, "entry.ts");
    const bundle = path.join(directory, "entry.mjs");
    await writeFile(entry, [
      'export { default as complaintsRouter } from "../src/routes/cosolve/complaints";',
      'export { default as aiRouter } from "../src/routes/cosolve/ai";',
      'export { pool } from "@workspace/db";',
    ].join("\n"));
    await build({
      entryPoints: [entry], outfile: bundle, bundle: true, platform: "node", format: "esm",
      external: ["express", "pg", "pg-native", "drizzle-orm", "*.node"], logLevel: "silent",
      plugins: [{
        name: "isolated-test-identity",
        setup(builder) {
          builder.onLoad({ filter: /\/staff-auth\.ts$/ }, () => ({
            contents: 'export async function resolveStaffIdentity() { return { id: "hybrid-ai-test-manager" }; } export function staffAuthorizationStatus(identity) { return identity ? null : 401; }',
            loader: "js",
          }));
        },
      }],
    });
    const routes = await import(pathToFileURL(bundle).href);
    routePool = routes.pool;
    const app = express();
    app.use(express.json());
    app.use("/api", routes.complaintsRouter, routes.aiRouter);
    server = await new Promise(resolve => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (url, body, method = "POST") => {
      const response = await fetch(base + url, {
        method, headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      assert.ok(response.ok, `AI fixture request failed with HTTP ${response.status}: ${data.error ?? "unknown"}`);
      return data;
    };
    const saved = await request("/complaints", {
      customerName: "Synthetic AI Test", customerEmail: email,
      source: "Synthetic live AI verification", sourceId: randomUUID(), imported: true,
      subject: "Synthetic test: parcel arrived late",
      message: "This is a synthetic support test. My parcel arrived two days later than the promised date. I would like an explanation.",
      orderValue: 20,
    });
    const classification = await request(`/complaints/${saved.id}/classify`);
    assert.ok(classification.category && classification.rootCause && classification.summary);
    assert.ok(["Positive", "Neutral", "Negative"].includes(classification.sentiment));
    assert.ok(classification.confidence >= 0 && classification.confidence <= 1);
    const recommendation = await request(`/complaints/${saved.id}/recommend`);
    assert.ok(recommendation.resolution);
    if (recommendation.amount > 0) {
      await request(`/complaints/${saved.id}`, { status: "Pending approval", recommendedAmount: recommendation.amount }, "PATCH");
    }
    await request(`/complaints/${saved.id}`, { status: "Pending approval" }, "PATCH");
    const refreshed = await request(`/complaints/${saved.id}/recommend`);
    assert.ok(refreshed.rationale && refreshed.policyMatch);
    const draft = await request(`/complaints/${saved.id}/draft-response`);
    assert.ok(draft.response?.trim());
    const stored = await pool.query("select category, sentiment, response_draft, status from cosolve_complaints where id=$1 and customer_email=$2", [saved.id, email]);
    assert.equal(stored.rows[0].category, classification.category);
    assert.equal(stored.rows[0].sentiment, classification.sentiment);
    assert.equal(stored.rows[0].response_draft, draft.response);
    assert.ok(!["Closed", "Resolved"].includes(stored.rows[0].status));
    const audit = await pool.query("select actor, details from cosolve_audit_events where case_id=$1 and action='AI classification completed'", [saved.id]);
    assert.equal(audit.rows.length, 1);
    assert.match(audit.rows[0].actor, /Runpod \+ Grafilab/);
    assert.match(audit.rows[0].details, /Runpod sentiment:/);
    assert.match(audit.rows[0].details, /Grafilab assessment confidence/);
    const approved = await request(`/complaints/${saved.id}/approve`, {
      recommendation: "Synthetic manager-reviewed partial refund", recommendedAmount: 3.25,
      resolutionNote: "Synthetic review only; no external transfer.",
      expectedRecommendation: refreshed.resolution, expectedAmount: refreshed.amount,
    });
    assert.equal(approved.status, "Resolved");
    const finalRefresh = await fetch(base + `/complaints/${saved.id}/recommend`, { method: "POST" });
    assert.equal(finalRefresh.status, 409, "AI cannot overwrite an approved offer");
    assert.deepEqual((await pool.query("select amount from cosolve_compensations where case_id=$1", [saved.id])).rows, [{ amount: 3.25 }]);
    console.log("PASS: live hybrid AI, pending guidance refresh, persisted draft/audit, explicit manager approval and final-offer protection. No external transfer or message.");
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (routePool) await routePool.end();
    try {
      await pool.query("delete from cosolve_compensations where case_id in (select id from cosolve_complaints where customer_email=$1)", [email]);
      await pool.query("delete from cosolve_audit_events where case_id in (select id from cosolve_complaints where customer_email=$1)", [email]);
      await pool.query("delete from cosolve_complaints where customer_email=$1", [email]);
      await pool.query("delete from cosolve_customers where email=$1", [email]);
      assert.equal((await pool.query("select id from cosolve_complaints where customer_email=$1", [email])).rowCount, 0);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  }
});
