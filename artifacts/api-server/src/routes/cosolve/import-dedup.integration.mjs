import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

// Run explicitly against the development API. Every fixture is removed in finally.
test("CSV retries and concurrent deliveries preserve one case, customer count and audit entry", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const token = randomUUID();
  const email = `import-test-${token}@example.invalid`;
  const payload = {
    imported: true,
    source: "CSV integration test",
    sourceId: token,
    customerName: "Import test fixture",
    customerEmail: email,
    subject: "Import retry test",
    message: "Disposable duplicate protection fixture",
  };
  const send = async (data) => {
    const response = await fetch("http://localhost:80/api/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    assert.ok([200, 201, 400].includes(response.status), `Unexpected API status ${response.status}`);
    return { status: response.status, body };
  };
  try {
    const simultaneous = await Promise.all(Array.from({ length: 6 }, () => send(payload)));
    assert.equal(simultaneous.filter(result => result.status === 201).length, 1);
    assert.equal(simultaneous.filter(result => result.status === 200 && result.body.duplicate).length, 5);
    assert.equal(new Set(simultaneous.map(result => result.body.id)).size, 1);
    const originalId = simultaneous[0].body.id;
    const editedRetry = await send({ ...payload, message: "The external complaint was edited" });
    assert.equal(editedRetry.body.id, originalId);
    assert.equal(editedRetry.body.duplicate, true);

    const fallback = { ...payload, sourceId: undefined, subject: "Fallback without a received date" };
    const repeatedFallback = await Promise.all([send(fallback), send(fallback), send(fallback)]);
    assert.equal(repeatedFallback.filter(result => result.status === 201).length, 1);
    assert.equal(new Set(repeatedFallback.map(result => result.body.id)).size, 1);

    const otherSource = await send({ ...payload, source: "Other integration test source" });
    assert.equal(otherSource.status, 201);
    assert.notEqual(otherSource.body.id, originalId);

    const datedFirst = await send({ ...fallback, createdAt: "2026-10-01T09:00:00Z" });
    const datedSecond = await send({ ...fallback, createdAt: "2026-10-02T09:00:00Z" });
    assert.equal(datedFirst.status, 201);
    assert.equal(datedSecond.status, 201);
    assert.notEqual(datedFirst.body.id, datedSecond.body.id);

    const manualFirst = await send({ ...payload, imported: undefined });
    const manualSecond = await send({ ...payload, imported: false });
    assert.equal(manualFirst.status, 201);
    assert.equal(manualSecond.status, 201);
    assert.notEqual(manualFirst.body.id, manualSecond.body.id);

    const retryable = { ...payload, sourceId: `${token}-retry`, rating: 6 };
    assert.equal((await send(retryable)).status, 400);
    assert.equal((await send({ ...retryable, rating: 5 })).status, 201);
    assert.equal((await send({ ...retryable, rating: 5 })).status, 200);

    const cases = await pool.query("select id from cosolve_complaints where customer_email = $1", [email]);
    assert.equal(cases.rowCount, 8);
    const customers = await pool.query("select complaint_count from cosolve_customers where email = $1", [email]);
    assert.equal(customers.rowCount, 1);
    assert.equal(customers.rows[0].complaint_count, 8);
    const audit = await pool.query(
      "select count(*)::int as count from cosolve_audit_events where action = 'Complaint received' and case_id = any($1::text[])",
      [cases.rows.map(row => row.id)],
    );
    assert.equal(audit.rows[0].count, 8);
    const identities = await pool.query(
      "select count(*)::int as count from cosolve_complaint_imports where complaint_id = any($1::text[])",
      [cases.rows.map(row => row.id)],
    );
    assert.equal(identities.rows[0].count, 6);
  } finally {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
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
});
