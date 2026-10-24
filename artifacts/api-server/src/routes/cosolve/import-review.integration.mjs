import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import express from "express";
import { build } from "esbuild";
import pg from "pg";

test("historical CSV review is read-only; explicit links preserve cases, counts and receipt events", {
  skip: !process.env.DATABASE_URL ? "Requires the development database" : false,
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const bundleDir = await mkdtemp(path.join(apiDir, ".import-review-integration-"));
  const token = randomUUID();
  const email = `legacy-${token}@example.invalid`;
  const input = {
    customerName: "Legacy fixture", customerEmail: email,
    source: `CSV fixture ${token}`, subject: "Repeated historical text", message: "Disposable fixture",
  };
  let server;
  let routePool;
  try {
    const entry = path.join(bundleDir, "entry.ts");
    const output = path.join(bundleDir, "bundle.mjs");
    await writeFile(entry, 'export { default as router } from "../src/routes/cosolve/complaints"; export { pool } from "@workspace/db";');
    await build({
      entryPoints: [entry], outfile: output, bundle: true, platform: "node", format: "esm",
      external: ["express", "pg", "pg-native", "drizzle-orm", "*.node"],
      logLevel: "silent",
      plugins: [{
        name: "fixture-staff-identity",
        setup(builder) {
          builder.onLoad({ filter: /\/staff-auth\.ts$/ }, () => ({
            contents: `
              export async function resolveStaffIdentity(req) {
                return req.headers["x-fixture-user"] ? { id: "fixture-manager" } : null;
              }
              export function staffAuthorizationStatus(identity) { return identity ? null : 401; }
            `,
            loader: "ts",
          }));
        },
      }],
    });
    const module = await import(pathToFileURL(output).href);
    routePool = module.pool;
    const app = express();
    app.use(express.json());
    app.use("/api", module.router);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const post = async (url, body, authenticated = true) => {
      const response = await fetch(base + url, {
        method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { "x-fixture-user": "yes" } : {}) },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const effects = async () => {
      const result = await pool.query(`
        select
          (select count(*)::int from cosolve_complaints where customer_email=$1) as cases,
          (select sum(complaint_count)::int from cosolve_customers where email=$1) as customer_count,
          (select count(*)::int from cosolve_audit_events where action='Complaint received'
            and case_id in (select id from cosolve_complaints where customer_email=$1)) as receipts,
          (select count(*)::int from cosolve_complaint_imports
            where complaint_id in (select id from cosolve_complaints where customer_email=$1)) as identities,
          (select count(*)::int from cosolve_audit_events where action='Import identity linked'
            and case_id in (select id from cosolve_complaints where customer_email=$1)) as links
      `, [email]);
      return result.rows[0];
    };

    assert.equal((await post("/complaint-imports/preview", { rows: [input] }, false)).status, 401);
    assert.equal((await post("/complaint-imports/link", { row: input, caseId: "anything" }, false)).status, 401);
    assert.equal((await post("/complaint-imports/preview", { rows: [] })).status, 400);
    const first = await post("/complaints", { ...input, createdAt: "2020-01-01T12:00:00Z" });
    const second = await post("/complaints", { ...input, createdAt: "2021-01-01T12:00:00Z" });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const baseline = { cases: 2, customer_count: 2, receipts: 2, identities: 0, links: 0 };
    assert.deepEqual(await effects(), baseline);
    const preview = await post("/complaint-imports/preview", { rows: [
      input,
      { ...input, createdAt: "2020-01-01T12:00:00Z" },
      { ...input, source: input.source + " other account", sourceId: "123" },
    ] });
    assert.equal(preview.status, 200);
    assert.equal(preview.body[0].duplicate, false);
    assert.equal(preview.body[0].candidates.length, 2);
    assert.equal(preview.body[1].candidates.length, 1);
    assert.equal(preview.body[1].candidates[0].id, first.body.id);
    assert.equal(preview.body[2].candidates.length, 0);
    assert.deepEqual(await effects(), baseline);

    const row = { ...input, sourceId: "123" };
    const links = await Promise.all(Array.from({ length: 5 }, () => post("/complaint-imports/link", { row, caseId: first.body.id })));
    assert.ok(links.every(link => link.status === 200 && link.body.id === first.body.id));
    assert.deepEqual(await effects(), { ...baseline, identities: 1, links: 1 });
    assert.equal((await post("/complaint-imports/link", { row, caseId: second.body.id })).status, 409);
    const tracked = await post("/complaint-imports/preview", { rows: [row] });
    assert.equal(tracked.body[0].duplicate, true);
    assert.equal(tracked.body[0].existingCase.id, first.body.id);
    assert.equal(tracked.body[0].candidates.length, 0);
    const retry = await post("/complaints", { ...row, imported: true });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.duplicate, true);
    assert.deepEqual(await effects(), { ...baseline, identities: 1, links: 1 });
    // The source/channel namespaces account-local IDs, both for suggestions and tracked identities.
    const otherAccount = { ...row, source: input.source + " other account" };
    assert.equal((await post("/complaint-imports/link", { row: otherAccount, caseId: first.body.id })).status, 409);
    const separate = await post("/complaints", { ...otherAccount, imported: true });
    assert.equal(separate.status, 201);
    assert.notEqual(separate.body.id, first.body.id);
    // A deliberate separate complaint with a different identity is preserved.
    assert.equal((await post("/complaints", { ...input, sourceId: "genuinely-separate", imported: true })).status, 201);
    // No-date content identities can also be linked to an old case.
    assert.equal((await post("/complaint-imports/link", { row: input, caseId: second.body.id })).status, 200);
    assert.equal((await post("/complaints", { ...input, imported: true })).body.id, second.body.id);
    assert.deepEqual(await effects(), { cases: 4, customer_count: 4, receipts: 4, identities: 4, links: 2 });
    const event = await pool.query("select actor from cosolve_audit_events where action='Import identity linked' and case_id=$1", [first.body.id]);
    assert.equal(event.rows[0].actor, "fixture-manager");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (routePool) await routePool.end();
    await pool.query("delete from cosolve_audit_events where case_id in (select id from cosolve_complaints where customer_email=$1)", [email]);
    await pool.query("delete from cosolve_complaints where customer_email=$1", [email]);
    await pool.query("delete from cosolve_customers where email=$1", [email]);
    await pool.end();
    await rm(bundleDir, { recursive: true, force: true });
  }
});
