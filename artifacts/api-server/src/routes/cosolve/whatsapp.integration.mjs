import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import express from "express";
import path from "node:path";
import pino from "pino";
import pinoHttp from "pino-http";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

test(
  "WhatsApp webhook signatures, retries, and simultaneous staff reviews are safe",
  {
    skip: !process.env.DATABASE_URL
      ? "Set DATABASE_URL to run the WhatsApp persistence integration test."
      : false,
  },
  async () => {
    const secret = `whatsapp-integration-${randomUUID()}`;
    process.env.META_WHATSAPP_APP_SECRET = secret;

    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const apiServerDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    let bundleDir;
    let appDbPool;
    let server;
    let baseUrl;
    const token = randomUUID();
    const phone = `+1555${token.replaceAll("-", "").slice(0, 10)}`;
    const providerIds = ["create", "ignore", "race"].map(
      (suffix) => `wamid.integration.${token}.${suffix}`,
    );
    const app = express();
    app.use(pinoHttp({ logger: pino({ level: "silent" }), quietReqLogger: true }));
    app.use(
      express.json({
        verify(req, _res, buffer) {
          if (req.originalUrl.startsWith("/api/webhooks/whatsapp")) {
            req.rawBody = Buffer.from(buffer);
          }
        },
      }),
    );
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ wa_id: phone, profile: { name: "Integration fixture" } }],
                messages: providerIds.map((id, index) => ({
                  id,
                  from: phone,
                  timestamp: "1792735200",
                  type: "text",
                  text: { body: `Disposable WhatsApp fixture ${index} ${token}` },
                })),
              },
            },
          ],
        },
      ],
    };
    const sendWebhook = async (body, signatureMode = "valid") => {
      const raw = JSON.stringify(body);
      const signature =
        signatureMode === "missing"
          ? undefined
          : signatureMode === "invalid"
            ? "sha256=" + "0".repeat(64)
            : `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
      const headers = { "Content-Type": "application/json" };
      if (signature) headers["x-hub-signature-256"] = signature;
      const response = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
        method: "POST",
        headers,
        body: raw,
      });
      return { status: response.status, body: await response.json() };
    };
    const review = async (messageId, action) => {
      const response = await fetch(
        `${baseUrl}/api/whatsapp/messages/${messageId}/${action}`,
        { method: "POST" },
      );
      return { status: response.status, body: await response.json() };
    };
    const jsonQuery = async (query, params) => (await pool.query(query, params)).rows;

    try {
      bundleDir = await mkdtemp(
        path.join(apiServerDir, ".whatsapp-integration-"),
      );
      const entryPath = path.join(bundleDir, "entry.ts");
      const bundlePath = path.join(bundleDir, "bundle.mjs");
      await writeFile(
        entryPath,
        [
          'import router from "../src/routes/cosolve/whatsapp.ts";',
          'import { pool } from "@workspace/db";',
          "export { router, pool };",
        ].join("\n"),
      );
      await build({
        absWorkingDir: apiServerDir,
        entryPoints: [entryPath],
        outfile: bundlePath,
        bundle: true,
        platform: "node",
        format: "esm",
        external: [
          "express",
          "pg",
          "pg-native",
          "drizzle-orm",
          "*.node",
        ],
        logLevel: "silent",
      });
      const { router, pool: routeDbPool } = await import(
        pathToFileURL(bundlePath).href
      );
      appDbPool = routeDbPool;
      app.use("/api", router);
      server = app.listen(0, "127.0.0.1");
      await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const address = server.address();
      assert.ok(address && typeof address === "object");
      baseUrl = `http://127.0.0.1:${address.port}`;

      const rejectedPayload = {
        ...payload,
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messages: [
                    {
                      id: providerIds[0],
                      from: phone,
                      type: "text",
                      text: { body: "Must not be queued before a valid signature." },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      assert.equal((await sendWebhook(rejectedPayload, "invalid")).status, 401);
      assert.equal((await sendWebhook(rejectedPayload, "missing")).status, 401);
      assert.deepEqual(
        await jsonQuery(
          "select id from cosolve_whatsapp_messages where provider_message_id = any($1::text[])",
          [providerIds],
        ),
        [],
      );

      const firstDelivery = await sendWebhook(payload);
      assert.equal(firstDelivery.status, 200);
      assert.deepEqual(firstDelivery.body, { received: 3, queued: 3 });
      const replay = await sendWebhook(payload);
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.body, { received: 3, queued: 0 });

      const storedMessages = await jsonQuery(
        "select id, provider_message_id, status, complaint_id from cosolve_whatsapp_messages where provider_message_id = any($1::text[])",
        [providerIds],
      );
      assert.equal(storedMessages.length, 3);
      assert.deepEqual(
        storedMessages.map((message) => message.provider_message_id).sort(),
        [...providerIds].sort(),
      );
      assert.ok(storedMessages.every((message) => message.status === "Pending review"));
      const receivedEvents = await jsonQuery(
        "select case_id, count(*)::int as count from cosolve_audit_events where action = 'WhatsApp message received for review' and case_id = any($1::text[]) group by case_id",
        [storedMessages.map((message) => `WHATSAPP-${message.id}`)],
      );
      assert.equal(receivedEvents.length, 3);
      assert.ok(receivedEvents.every((event) => event.count === 1));

      const messageByProviderId = new Map(
        storedMessages.map((message) => [message.provider_message_id, message]),
      );
      const createMessage = messageByProviderId.get(providerIds[0]);
      const simultaneousCreates = await Promise.all(
        Array.from({ length: 8 }, () => review(createMessage.id, "create-case")),
      );
      assert.equal(
        simultaneousCreates.filter((result) => result.status === 201).length,
        1,
      );
      assert.equal(
        simultaneousCreates.filter((result) => result.status === 409).length,
        7,
      );
      const createdCase = simultaneousCreates.find((result) => result.status === 201);
      assert.ok(createdCase?.body.id);
      const repeatedCreates = await Promise.all([
        review(createMessage.id, "create-case"),
        review(createMessage.id, "create-case"),
      ]);
      assert.deepEqual(repeatedCreates[0], repeatedCreates[1]);
      assert.equal(repeatedCreates[0].status, 409);
      assert.match(repeatedCreates[0].body.error, /already been reviewed/i);

      const createdComplaints = await jsonQuery(
        "select id from cosolve_complaints where source = 'WhatsApp' and message like $1",
        [`%${token}%`],
      );
      assert.equal(createdComplaints.length, 1);
      assert.equal(createdComplaints[0].id, createdCase.body.id);
      const acceptedEvents = await jsonQuery(
        "select action from cosolve_audit_events where case_id = $1 order by action",
        [createdCase.body.id],
      );
      assert.deepEqual(
        acceptedEvents.map((event) => event.action),
        ["Complaint received", "WhatsApp message accepted"],
      );
      const createdMessageState = await jsonQuery(
        "select status, complaint_id from cosolve_whatsapp_messages where id = $1",
        [createMessage.id],
      );
      assert.deepEqual(createdMessageState, [
        { status: "Case created", complaint_id: createdCase.body.id },
      ]);
      const customerState = await jsonQuery(
        "select complaint_count from cosolve_customers where phone = $1",
        [phone],
      );
      assert.deepEqual(customerState, [{ complaint_count: 1 }]);

      const ignoreMessage = messageByProviderId.get(providerIds[1]);
      const simultaneousIgnores = await Promise.all(
        Array.from({ length: 6 }, () => review(ignoreMessage.id, "ignore")),
      );
      assert.equal(
        simultaneousIgnores.filter((result) => result.status === 200).length,
        1,
      );
      assert.equal(
        simultaneousIgnores.filter((result) => result.status === 409).length,
        5,
      );
      const repeatedIgnores = await Promise.all([
        review(ignoreMessage.id, "ignore"),
        review(ignoreMessage.id, "ignore"),
      ]);
      assert.deepEqual(repeatedIgnores[0], repeatedIgnores[1]);
      assert.equal(repeatedIgnores[0].status, 409);
      assert.match(repeatedIgnores[0].body.error, /already been reviewed/i);
      const ignoredEvents = await jsonQuery(
        "select count(*)::int as count from cosolve_audit_events where case_id = $1 and action = 'WhatsApp message ignored'",
        [`WHATSAPP-${ignoreMessage.id}`],
      );
      assert.deepEqual(ignoredEvents, [{ count: 1 }]);
      assert.deepEqual(
        await jsonQuery(
          "select status from cosolve_whatsapp_messages where id = $1",
          [ignoreMessage.id],
        ),
        [{ status: "Ignored" }],
      );

      const raceMessage = messageByProviderId.get(providerIds[2]);
      const [createRace, ignoreRace] = await Promise.all([
        review(raceMessage.id, "create-case"),
        review(raceMessage.id, "ignore"),
      ]);
      const raceResults = [createRace, ignoreRace];
      assert.equal(raceResults.filter((result) => result.status === 409).length, 1);
      assert.equal(
        raceResults.filter((result) => result.status === 201 || result.status === 200)
          .length,
        1,
      );
      const [raceState] = await jsonQuery(
        "select status, complaint_id from cosolve_whatsapp_messages where id = $1",
        [raceMessage.id],
      );
      if (createRace.status === 201) {
        assert.equal(raceState.status, "Case created");
        assert.equal(raceState.complaint_id, createRace.body.id);
        assert.deepEqual(
          await jsonQuery(
            "select action from cosolve_audit_events where case_id = $1 order by action",
            [createRace.body.id],
          ),
          [
            { action: "Complaint received" },
            { action: "WhatsApp message accepted" },
          ],
        );
      } else {
        assert.equal(ignoreRace.status, 200);
        assert.equal(raceState.status, "Ignored");
        assert.equal(raceState.complaint_id, "");
        assert.deepEqual(
          await jsonQuery(
            "select action from cosolve_audit_events where case_id = $1",
            [`WHATSAPP-${raceMessage.id}`],
          ),
          [{ action: "WhatsApp message ignored" }],
        );
      }
    } finally {
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const rows = await connection.query(
          "select id, complaint_id from cosolve_whatsapp_messages where provider_message_id = any($1::text[])",
          [providerIds],
        );
        const messageCaseIds = rows.rows.map((row) => `WHATSAPP-${row.id}`);
        const complaintIds = rows.rows
          .map((row) => row.complaint_id)
          .filter(Boolean);
        await connection.query(
          "delete from cosolve_audit_events where case_id = any($1::text[])",
          [[...messageCaseIds, ...complaintIds]],
        );
        await connection.query(
          "delete from cosolve_complaints where id = any($1::text[])",
          [complaintIds],
        );
        await connection.query(
          "delete from cosolve_whatsapp_messages where provider_message_id = any($1::text[])",
          [providerIds],
        );
        await connection.query(
          "delete from cosolve_customers where phone = $1",
          [phone],
        );
        await connection.query("COMMIT");
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
        await pool.end();
        if (appDbPool) await appDbPool.end();
        if (bundleDir) await rm(bundleDir, { recursive: true, force: true });
      }
    }
  },
);
