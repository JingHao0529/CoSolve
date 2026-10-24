import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createRequire } from "node:module";
import express from "express";
import { build } from "esbuild";
import pg from "pg";
import { launchChromium, until } from "./helpers/chromium.mjs";
const XLSX = createRequire(new URL("../../cosolve/package.json", import.meta.url))("xlsx");

// Real inbox, generated HTTP client, import routes and PostgreSQL. Only Clerk
// identity and AI preparation are substituted in this isolated test server.
test("inbox CSV and XLSX uploads import automatically, disclose duplicates and recover safely", {
  timeout: 120_000,
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Requires the development DATABASE_URL");
  const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const webDir = path.resolve(apiDir, "../cosolve");
  const directory = await mkdtemp(path.join(apiDir, ".csv-browser-"));
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const token = randomUUID();
  const email = `csv-browser-${token}@example.invalid`;
  const source = `CSV browser ${token}`;
  let server, routePool, browser;
  let releaseRequest;
  let heldRequest;
  let failNextCreate = false;
  let createRequests = 0;
  let previewRequests = 0;
  let manualGuidanceCase = "";
  let guidanceRequests = 0;
  const fixtureIds = async () => (await pool.query(
    "select id from cosolve_complaints where customer_email=$1", [email],
  )).rows.map(row => row.id);
  const effects = async count => {
    const ids = await fixtureIds();
    assert.equal(ids.length, count, "fixture case count");
    const receipts = await pool.query(
      "select case_id from cosolve_audit_events where action='Complaint received' and case_id=any($1::text[])", [ids],
    );
    assert.equal(receipts.rowCount, count, "creation audit count");
    assert.equal(new Set(receipts.rows.map(row => row.case_id)).size, count, "one creation event per case");
    const customers = await pool.query("select complaint_count from cosolve_customers where email=$1", [email]);
    assert.equal(customers.rowCount, count ? 1 : 0);
    if (count) assert.equal(customers.rows[0].complaint_count, count);
  };
  try {
    const apiEntry = path.join(directory, "api.ts");
    const apiBundle = path.join(directory, "api.mjs");
    await writeFile(apiEntry, 'export { default as router } from "../src/routes/cosolve/complaints"; export { pool } from "@workspace/db";');
    await build({
      entryPoints: [apiEntry], outfile: apiBundle, bundle: true, platform: "node", format: "esm",
      external: ["express", "pg", "pg-native", "drizzle-orm", "*.node"], logLevel: "silent",
      plugins: [{
        name: "isolated-staff-identity",
        setup(builder) {
          builder.onResolve({ filter: /^@replit\/connectors-sdk$/ }, () => ({ path: "gmail-fixture", namespace: "gmail-fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "gmail-fixture" }, () => ({
            contents: 'export class ReplitConnectors { async proxy(name,path,options) { if(name!=="google-mail") throw Error("Unexpected connector"); if(path.endsWith("/profile")) return Response.json({emailAddress:"sender@example.com"}); if(path.endsWith("/messages/send")) { if(!options.body.raw) throw Error("Missing MIME message"); return Response.json({id:"synthetic-email-receipt"}); } return Response.json({messages:[]}); } }',
            loader: "js",
          }));
          builder.onLoad({ filter: /\/staff-auth\.ts$/ }, () => ({
            contents: 'export async function resolveStaffIdentity(req) { return req.headers["x-test-anonymous"] ? null : { id: "csv-browser-manager" }; } export function staffAuthorizationStatus(identity) { return identity ? null : 401; }',
            loader: "ts",
          }));
        },
      }],
    });
    await build({
      entryPoints: [path.join(webDir, "test/csv-import-app.tsx")],
      outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "esm",
      jsx: "automatic", tsconfig: path.join(webDir, "tsconfig.json"),
      define: { "import.meta.env.BASE_URL": '"/"', "process.env.NODE_ENV": '"test"' },
      logLevel: "silent",
      plugins: [{
        name: "isolated-clerk-hooks",
        setup(builder) {
          builder.onResolve({ filter: /^@clerk\/react$/ }, () => ({ path: "clerk-fixture", namespace: "fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: 'export const useUser = () => ({ isLoaded: true, user: { id: "csv-browser-manager", firstName: "CSV", fullName: "CSV Tester" } }); export const useClerk = () => ({ signOut() {} });',
            loader: "js",
          }));
        },
      }],
    });
    const route = await import(pathToFileURL(apiBundle).href);
    routePool = route.pool;
    const app = express();
    app.use(express.json());
    app.use("/api", async (req, res, next) => {
      if (req.method === "POST" && req.path === "/complaint-imports/preview") previewRequests++;
      if (req.method === "POST" && req.path === "/complaints") {
        createRequests++;
        if (heldRequest) {
          const signal = heldRequest;
          heldRequest = undefined;
          await signal;
        }
        if (failNextCreate) {
          failNextCreate = false;
          res.status(503).json({ error: "Temporary CSV save failure" });
          return;
        }
      }
      next();
    });
    // Deterministic, zero-cost preparation, persisted so duplicate retries use
    // the same real detail endpoint and do not repeatedly invoke preparation.
    app.post("/api/complaints/:id/:stage", async (req, res, next) => {
      const { id, stage } = req.params;
      const stages = {
        classify: ["category", "Delivery", { category: "Delivery", sentiment: "Negative" }],
        recommend: ["recommendation", "Apology", { resolution: "Apology", amount: 0 }],
        "draft-response": ["response_draft", "We are reviewing your delivery.", { response: "We are reviewing your delivery." }],
      };
      if (!stages[stage]) return next();
      const [column, value, response] = stages[stage];
      const saved = await pool.query(
        `update cosolve_complaints set ${column}=$1 where id=$2 and customer_email=$3 returning id`, [value, id, email],
      );
      assert.equal(saved.rowCount, 1, "AI stub must only touch this run's fixtures");
      if (stage === "classify") {
        await pool.query("update cosolve_complaints set sentiment='Negative' where id=$1 and customer_email=$2", [id, email]);
      }
      if (stage === "recommend") {
        const manual = id === manualGuidanceCase;
        if (manual) guidanceRequests++;
        response.resolution = manual ? "Partial refund" : "Apology";
        response.amount = manual ? 12.5 : 0;
        response.rationale = "AI-guidance-fixture: review delivery evidence and order value.";
        response.policyMatch = "Delivery review policy";
        response.requiresApproval = true;
        await pool.query("update cosolve_complaints set recommendation=$1, recommended_amount=$2 where id=$3 and customer_email=$4",
          [response.resolution, response.amount, id, email]);
        await pool.query("insert into cosolve_audit_events (id,case_id,action,actor,details) values ($1,$2,$3,$4,$5)",
          [randomUUID(), id, "AI resolution recommendation generated", "Grafilab test fixture", response.rationale]);
      }
      res.json(response);
    });
    app.use("/api", route.router);
    // Unrelated inbox badges must not depend on other users' data.
    app.get("/api/whatsapp/status", (_req, res) => res.json({
      configured: false, requiredSecretNames: [], callbackPath: "/api/webhooks/whatsapp",
    }));
    app.get("/api/whatsapp/messages", (_req, res) => res.json([]));
    const javascript = await readFile(path.join(directory, "app.js"), "utf8");
    app.get("/app.js", (_req, res) => res.type("js").send(javascript));
    app.use((_req, res) => res.type("html").send('<!doctype html><html><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'));
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await launchChromium();
    const tab = await browser.connect((await browser.targets()).find(target => target.type === "page"));
    await tab.send("Page.navigate", { url: `${base}/inbox` });
    const evaluate = tab.evaluate;
    const text = () => evaluate("document.body?.innerText || ''");
    const has = async value => (await text()).includes(value);
    const waitText = value => until(() => has(value), value);
    const inputSelector = 'input[aria-label="Choose complaint CSV or XLSX"]';
    const click = async label => {
      assert.ok(await evaluate(`(() => {
        const button = [...document.querySelectorAll('button,summary')].find(el => el.textContent === ${JSON.stringify(label)});
        if (!button || button.disabled) return false;
        button.click(); return true;
      })()`), `click enabled ${label}`);
    };
    const status = () => evaluate('document.querySelector(\'[aria-label="CSV import review"] [role="status"]\')?.textContent || ""');
    const waitStatus = value => until(async () => (await status()).includes(value), value);
    const upload = async (name, csv) => {
      const filename = path.join(directory, name);
      await writeFile(filename, csv);
      const { root } = await tab.send("DOM.getDocument");
      const { nodeId } = await tab.send("DOM.querySelector", { nodeId: root.nodeId, selector: inputSelector });
      assert.ok(nodeId, `real inbox file input exists: ${await text()}`);
      await tab.send("DOM.setFileInputFiles", { nodeId, files: [filename] });
    };
    const csv = rows => `customerName,customerEmail,source,subject,message,sourceId\n${rows.map(([id, message]) =>
      `CSV Fixture,${email},${source},Subject ${id},"${message}",${token}-${id}`).join("\n")}`;
    const original = csv([["A", "First line\nSecond line"], ["B", "Other issue"]]);
    const ready = () => waitText("rows processed;");
    const assertPreview = async expectedRows => {
      const preview = await evaluate(`(() => {
        const panel = document.querySelector('[aria-label="CSV import review"]');
        return {
          rows: [...panel.querySelectorAll('.subpanel')].map(row => ({
            title: row.querySelector('div').textContent,
            warning: [...row.querySelectorAll('p')].find(p => p.textContent.startsWith('Tracked duplicate'))?.textContent || '',
            links: [...row.querySelectorAll('a')].map(a => a.getAttribute('href')),
            decision: row.querySelector('select')?.value,
          })),
        };
      })()`);
      assert.equal(preview.rows.length, expectedRows.length, "preview row count");
      for (const [index, expected] of expectedRows.entries()) {
        const row = preview.rows[index];
        assert.equal(row.title, `Row ${index + 2}: CSV Fixture — Subject ${expected.subject}`, "preview record number and subject");
        if (expected.caseId) {
          assert.ok(row.warning.startsWith("Tracked duplicate —"), `row ${index + 2} warns before confirmation`);
          assert.ok(row.warning.includes(`existing case ${expected.caseId}`), "warning names the existing case");
          assert.deepEqual(row.links, [`/cases/${expected.caseId}`], "preview existing-case link");
          assert.equal(row.decision, undefined, "tracked row cannot be accidentally selected as a new complaint");
        } else {
          assert.equal(row.warning, "", `new row ${index + 2} has no false duplicate warning`);
          assert.deepEqual(row.links, [], "new row has no existing-case link");
          assert.ok(["create", "done"].includes(row.decision), "new row automatically imports separately");
        }
      }
    };
    const holdCreate = () => { heldRequest = new Promise(resolve => { releaseRequest = resolve; }); };
    const assertDisabled = async () => {
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(inputSelector)}).disabled`), true, "picker disabled while processing");
      assert.equal(await evaluate("[...document.querySelectorAll('button')].find(el => el.textContent === 'Run remaining actions / retry AI').disabled"), true, "retry disabled while processing");
    };
    await waitText("Import CSV / XLSX complaints");
    assert.equal(await evaluate("Boolean(document.querySelector('[aria-label=\"Import complaints\"]'))"), false);
    holdCreate();
    await upload("original.csv", original);
    await ready();
    await assertPreview([{ subject: "A" }, { subject: "B" }]);
    await until(() => createRequests === 1, "first create is held");
    await effects(0); // held create has not committed yet
    await assertDisabled();
    releaseRequest();
    await waitStatus("Processed 2 new review rows");
    assert.ok((await status()).includes("0 need retry"));
    await effects(2);
    const originalCases = await pool.query("select id, subject from cosolve_complaints where customer_email=$1", [email]);
    const caseA = originalCases.rows.find(row => row.subject === "Subject A").id;
    const caseB = originalCases.rows.find(row => row.subject === "Subject B").id;

    // Same physical file, no reload: input reset must allow the change event.
    await upload("original.csv", original);
    await ready();
    await waitStatus("Processed 0 new review rows");
    await assertPreview([{ subject: "A", caseId: caseA }, { subject: "B", caseId: caseB }]);
    assert.ok((await status()).includes("found 2 tracked duplicates"));
    await effects(2);
    assert.equal(createRequests, 2, "tracked duplicate retries never post new cases");
    await click("View tracked duplicates (2)");
    const disclosure = await evaluate(`(() => {
      const el = document.querySelector('[aria-label="CSV import review"] details');
      return { open: el.open, rows: [...el.querySelectorAll('p')].map(p => ({ text: p.textContent, href: p.querySelector('a').getAttribute('href') })) };
    })()`);
    assert.equal(disclosure.open, true);
    assert.deepEqual(disclosure.rows.map(row => row.href), [`/cases/${caseA}`, `/cases/${caseB}`]);
    assert.match(disclosure.rows[0].text, /^Row 2: CSV Fixture — Subject A/);
    assert.match(disclosure.rows[1].text, /^Row 3: CSV Fixture — Subject B/); // multiline CSV record
    manualGuidanceCase = caseA;
    await pool.query("update cosolve_complaints set status='Pending approval', recommendation='Partial refund', recommended_amount=10 where id=$1 and customer_email=$2", [caseA, email]);
    await evaluate("document.querySelector('details p a').click()");
    const linkedTarget = await until(async () => (await browser.targets()).find(target => target.url === `${base}/cases/${caseA}`), "case link opens the correct new tab");
    const linkedTab = await browser.connect(linkedTarget);
    await until(() => linkedTab.evaluate(`document.body.innerText.includes('Subject A') && document.body.innerText.includes('First line')`), "linked case details load");
    assert.equal(await evaluate("location.pathname"), "/inbox", "opening a case preserves the inbox results");

    // The real case screen must let managers regenerate, edit and approve a pending offer.
    await until(() => linkedTab.evaluate("Boolean(document.querySelector('[aria-label=\"Generate recommendation\"]'))"), "resolution controls load");
    assert.equal(await linkedTab.evaluate("document.querySelector('[aria-label=\"Generate recommendation\"]').disabled"), false);
    await linkedTab.evaluate("document.querySelector('[aria-label=\"Generate recommendation\"]').click()");
    await until(() => linkedTab.evaluate("document.querySelector('[aria-label=\"Recommended amount\"]')?.value === '12.5'"), "AI guidance refresh changes saved offer");
    assert.equal(guidanceRequests, 1);
    const edit = async (label, value, textarea = false) => linkedTab.evaluate(`(() => {
      const el = document.querySelector('[aria-label="${label}"]');
      Object.getOwnPropertyDescriptor(${textarea ? "HTMLTextAreaElement" : "HTMLInputElement"}.prototype, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', {bubbles:true}));
    })()`);
    const caseButton = async text => linkedTab.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(text)});
      if (!button || button.disabled) return false; button.click(); return true;
    })()`);
    await edit("Resolution offer", "Manager reviewed partial refund", true);
    await edit("Recommended amount", "7.50");
    await edit("Resolution note", "Delivery evidence reviewed", true);
    await until(() => caseButton("Save changes"), "manager can save edits to a pending offer");
    await until(async () => (await pool.query("select recommended_amount from cosolve_complaints where id=$1", [caseA])).rows[0].recommended_amount === 7.5, "manager edits persisted");
    await linkedTab.send("Page.reload");
    await until(() => linkedTab.evaluate("document.querySelector('[aria-label=\"Resolution note\"]')?.value === 'Delivery evidence reviewed'"), "manager note survives reload");
    assert.equal(await linkedTab.evaluate("document.body.innerText.includes('AI-guidance-fixture')"), true, "guidance survives reload");
    const stale = await fetch(`${base}/api/complaints/${caseA}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendation: "Stale offer", recommendedAmount: 8, expectedAmount: 99 }),
    });
    assert.equal(stale.status, 409, "stale reviews cannot approve an unseen offer");
    const anonymous = await fetch(`${base}/api/complaints/${caseA}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-test-anonymous": "1" }, body: "{}",
    });
    assert.equal(anonymous.status, 401);
    await edit("Resolution offer", "Manager final partial refund", true);
    await edit("Recommended amount", "6.25");
    await until(() => caseButton("Approve resolution"), "manager can approve unsaved reviewed edits atomically");
    await until(async () => (await pool.query("select status from cosolve_complaints where id=$1", [caseA])).rows[0].status === "Resolved", "manager approval resolves case");
    await until(() => linkedTab.evaluate("Boolean(document.querySelector('[data-testid=\"approved-compensation-panel\"]')) && document.querySelector('[aria-label=\"Generate recommendation\"]').disabled && document.body.innerText.includes('Manager final partial refund')"), "approved offer is protected from further AI refresh");
    const approved = await pool.query("select type,amount from cosolve_compensations where case_id=$1", [caseA]);
    assert.deepEqual(approved.rows, [{ type: "Manager final partial refund", amount: 6.25 }]);
    await until(() => linkedTab.evaluate(`(() => { const button=document.querySelector('[data-testid="button-send-email"]'); if(!button || button.disabled) return false; button.click(); return true; })()`), "email composer can open");
    await until(() => linkedTab.evaluate("Boolean(document.querySelector('[data-testid=\"input-email-recipient\"]')) && document.body.innerText.includes('sender@example.com')"), "Gmail sender and recipient form are visible");
    await linkedTab.evaluate(`(() => { const input=document.querySelector('[data-testid="input-email-recipient"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"customer@example.com"); input.dispatchEvent(new Event("input",{bubbles:true})); })()`);
    assert.equal(await linkedTab.evaluate("document.body.innerText.includes('.txt')"), true, "text attachment is disclosed before sending");
    await until(() => linkedTab.evaluate(`(() => { const button=document.querySelector('[data-testid="button-confirm-send-email"]'); if(!button || button.disabled) return false; button.click(); return true; })()`), "reviewed email can be submitted");
    await until(() => linkedTab.evaluate("document.querySelector('[data-testid=\"email-send-success\"]')?.textContent.includes('Gmail accepted')"), "provider acceptance is shown");
    assert.equal((await pool.query("select count(*)::int as n from cosolve_audit_events where case_id=$1 and action='Customer email submitted'",[caseA])).rows[0].n,1,"accepted email receipt is persisted");
    await linkedTab.evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==="Done")?.click()`);
    assert.equal((await fetch(`${base}/api/complaints/${caseA}/approve`, {method:"POST"})).status, 409);
    const free = await fetch(`${base}/api/complaints/${caseB}/approve`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({recommendation:"Apology",recommendedAmount:0,expectedAmount:0}),
    });
    assert.equal(free.status, 200, "managers can explicitly approve non-monetary resolutions");

    // New and repeated records, including a duplicate created earlier in this batch.
    await upload("mixed.csv", csv([["A", "First line\nSecond line"], ["C", "New issue"], ["C", "New issue"]]));
    await ready();
    // C is not tracked until the automatic save of its first occurrence. Only A
    // should be marked in the read-only preview; both repeats appear in results.
    await assertPreview([{ subject: "A", caseId: caseA }, { subject: "C" }, { subject: "C" }]);
    await waitStatus("Processed 1 new review rows");
    assert.ok((await status()).includes("found 2 tracked duplicates"));
    await effects(3);
    await click("View tracked duplicates (2)");
    const mixedRows = await evaluate("[...document.querySelectorAll('details p')].map(p => p.textContent)");
    assert.match(mixedRows[0], /^Row 2:.*Subject A/);
    assert.match(mixedRows[1], /^Row 4:.*Subject C/);

    failNextCreate = true;
    await upload("retry.csv", csv([["D", "Retry issue"], ["E", "Successful sibling"]]));
    await ready();
    await waitStatus("1 need retry");
    await assertPreview([{ subject: "D" }, { subject: "E" }]);
    const failureText = await evaluate("document.querySelector('[aria-label=\"CSV import review\"] [role=\"alert\"]').textContent");
    assert.match(failureText, /Row 2:.*Temporary CSV save failure/);
    await effects(4);
    const beforeRetry = createRequests;
    holdCreate();
    await click("Run remaining actions / retry AI");
    await until(() => createRequests === beforeRetry + 1, "retry is held");
    await assertDisabled();
    releaseRequest();
    await waitStatus("0 need retry");
    await effects(5);
    assert.equal(createRequests, beforeRetry + 1, "retry sends only the failed row");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(inputSelector)}).disabled`), false);

    // Produce duplicate results again, then malformed input must clear them.
    await upload("original.csv", original);
    await ready();
    await waitStatus("found 2 tracked duplicates");
    await assertPreview([{ subject: "A", caseId: caseA }, { subject: "B", caseId: caseB }]);
    const previewsBeforeMalformed = previewRequests;
    await upload("malformed.csv", 'customerName,message\nFixture,"unclosed');
    await waitStatus("unclosed quoted value");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"CSV import review\"] details') === null"), true, "stale duplicate disclosure cleared");
    assert.equal(await has("rows processed;"), false, "stale review cleared");
    assert.equal(await has("Run remaining actions / retry AI"), false);
    assert.equal(previewRequests, previewsBeforeMalformed, "malformed file never reaches preview API");
    await effects(5);

    // A real two-worksheet XLSX uses the same automatic path and retries safely.
    const workbook = XLSX.utils.book_new();
    const headers = ["customerName", "customerEmail", "source", "subject", "message", "sourceId"];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      headers, ["CSV Fixture", email, source, "Subject A", "First line\nSecond line", `${token}-A`],
    ]), "Tracked");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      headers, ["CSV Fixture", email, source, "Subject F", "Excel complaint", `${token}-F`],
    ]), "New reviews");
    await upload("reviews.xlsx", XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    await waitStatus("Processed 1 new review rows");
    assert.ok((await status()).includes("found 1 tracked duplicates"));
    await effects(6);
    const excel = await pool.query("select category, recommendation, response_draft from cosolve_complaints where customer_email=$1 and subject='Subject F'", [email]);
    assert.equal(excel.rows[0].category, "Delivery");
    assert.equal(excel.rows[0].recommendation, "Apology");
    assert.ok(excel.rows[0].response_draft);
    assert.equal(await has("WhatsApp intake"), false);
    console.log("PASS: automatic CSV/XLSX imports; pending AI guidance refresh; persistent manager edits; atomic approval; stale/anonymous/duplicate rejection; non-monetary approval.");
  } finally {
    releaseRequest?.();
    const cleanupErrors = [];
    const cleanup = async action => {
      try { await action(); } catch (error) { cleanupErrors.push(error); }
    };
    if (browser) await cleanup(() => browser.close());
    if (server) await cleanup(async () => {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    });
    if (routePool) await cleanup(() => routePool.end());
    try {
      await pool.query("delete from cosolve_compensations where case_id in (select id from cosolve_complaints where customer_email=$1)", [email]);
      await pool.query("delete from cosolve_audit_events where case_id in (select id from cosolve_complaints where customer_email=$1)", [email]);
      await pool.query("delete from cosolve_complaints where customer_email=$1", [email]);
      await pool.query("delete from cosolve_customers where email=$1", [email]);
      assert.equal((await fixtureIds()).length, 0, "fixture cases cleaned");
      assert.equal((await pool.query("select id from cosolve_customers where email=$1", [email])).rowCount, 0, "fixture customers cleaned");
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
    assert.deepEqual(cleanupErrors, [], "browser/server cleanup succeeds");
  }
});
