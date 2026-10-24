import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import express from "express";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("closed-case deletion requires confirmation, preserves active cases and is atomic", async () => {
  const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const schema = `delete_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: "-c search_path=public" });
  const directory = path.join(api, ".local", schema);
  const previousOptions = process.env.PGOPTIONS;
  let pool, server;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    for (const table of ["cosolve_complaints", "cosolve_customers", "cosolve_compensations",
      "cosolve_compensation_adjustments", "cosolve_audit_events", "cosolve_complaint_imports"]) {
      await admin.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await mkdir(directory, { recursive: true });
    const bundle = path.join(directory, "test.mjs");
    await build({
      stdin: { contents: 'export {default as router} from "./src/routes/cosolve/closed-cases"; export {pool} from "@workspace/db";', resolveDir: api },
      outfile: bundle, bundle: true, platform: "node", format: "esm", logLevel: "silent",
      external: ["pg", "pg-native", "express", "*.node"],
      plugins: [{ name: "synthetic-auth", setup(build) {
        build.onResolve({ filter: /\/staff-auth$/ }, () => ({ path: "fixture-auth", namespace: "test" }));
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents:
          'export async function resolveStaffIdentity(req) { return req.get("x-test-anonymous") ? null : {id:"synthetic-manager",role:"manager"}; }' }));
      }}],
    });
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const fixture = await import(pathToFileURL(bundle).href);
    pool = fixture.pool;
    assert.equal((await pool.query("select current_schema() as name")).rows[0].name, schema,
      "Refuse to exercise destructive requests outside the isolated test schema.");
    await pool.query(`insert into cosolve_customers(id,name,complaint_count) values ('customer','Synthetic customer',3)`);
    await pool.query(`insert into cosolve_complaints(id,customer_id,customer_name,source,subject,message,status)
      values ('closed','customer','Synthetic customer','Test','Closed issue','Synthetic review','Closed'),
      ('open','customer','Synthetic customer','Test','Open issue','Synthetic review','Investigating'),
      ('resolved','customer','Synthetic customer','Test','Resolved issue','Synthetic review','Resolved')`);
    await pool.query(`insert into cosolve_compensations(id,case_id,type,amount,status) values ('payout','closed','Refund',50,'Approved')`);
    await pool.query(`insert into cosolve_compensation_adjustments(id,case_id,compensation_id,base_type,base_amount,type,amount,amount_delta,rationale,requested_by)
      values ('adjustment','closed','payout','Refund',50,'Refund',40,-10,'Synthetic correction','synthetic-manager')`);
    await pool.query(`insert into cosolve_audit_events(id,case_id,action,actor,details) values
      ('closed-audit','closed','Case closed','Test','Synthetic audit'), ('open-audit','open','Case received','Test','Synthetic audit')`);
    await pool.query(`insert into cosolve_complaint_imports(key,complaint_id) values ('synthetic-key','closed')`);
    const app = express(); app.use(express.json()); app.use(fixture.router);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/complaints/closed`;
    const request = (body, anonymous = false) => fetch(url, {
      method: "DELETE", headers: { "content-type": "application/json", ...(anonymous ? {"x-test-anonymous":"1"} : {}) },
      body: JSON.stringify(body),
    });
    assert.equal((await request({confirmation:"DELETE CLOSED CASES"}, true)).status, 401);
    assert.equal((await request({confirmation:"delete"})).status, 400);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_complaints")).rows[0].n, 3);
    const response = await request({confirmation:"DELETE CLOSED CASES"});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {deletedCount:1});
    assert.deepEqual((await pool.query("select id from cosolve_complaints order by id")).rows.map(row => row.id), ["open","resolved"]);
    for (const table of ["cosolve_compensations","cosolve_compensation_adjustments","cosolve_complaint_imports"]) {
      assert.equal((await pool.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0);
    }
    assert.equal((await pool.query("select complaint_count from cosolve_customers where id='customer'")).rows[0].complaint_count, 2);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_audit_events where id='open-audit'")).rows[0].n, 1);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_audit_events where action='Closed cases deleted'")).rows[0].n, 1);
    assert.deepEqual(await (await request({confirmation:"DELETE CLOSED CASES"})).json(), {deletedCount:0});
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool?.end();
    if (previousOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = previousOptions;
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
