import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { inArray, sql } from "drizzle-orm";
import { CreateComplaintBody } from "@workspace/api-zod";
import { complaintsTable, db, pool } from "@workspace/db";
import { complaintRowsFromCsvBytes } from "../../cosolve/src/lib/complaint-intake";
import { previewComplaintImports, saveComplaintImport } from "../src/routes/cosolve/import-store";
import { prepareReviewBatch } from "../src/routes/cosolve/bulk-review-preparation";

const file = process.argv[2];
if (!file) throw new Error("Provide a CSV file path.");
const bytes = await readFile(file);
const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
const statusFile = `/tmp/cosolve-import-${digest}.json`;
const rows = complaintRowsFromCsvBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  .map(row => CreateComplaintBody.parse({ ...row, imported: true }));
const progress = {
  phase: "preview", totalRows: rows.length, imported: 0, duplicates: 0, needsReview: 0,
  failedImports: 0, uniqueCases: 0, prepared: 0, skipped: 0, failedBatches: 0,
  completeCases: 0, remainingCases: 0,
};
let writes = Promise.resolve();
const report = () => {
  const snapshot = JSON.stringify(progress);
  console.log(snapshot);
  writes = writes.then(async () => {
    await writeFile(statusFile + ".tmp", snapshot, { mode: 0o600 });
    await rename(statusFile + ".tmp", statusFile);
  });
  return writes;
};
const parallel = async <T>(items: T[], concurrency: number, action: (item: T, index: number) => Promise<void>) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await action(items[index], index);
    }
  }));
};
try {
  console.log(JSON.stringify({ statusFile }));
  const preview = await previewComplaintImports(rows);
  progress.needsReview = preview.filter(row => !row.duplicate && row.candidates.length > 0).length;
  await report();
  if (!process.argv.includes("--import")) {
    console.log(JSON.stringify({ dryRun: true, safeRows: rows.length - progress.needsReview }));
  } else {
    progress.phase = "importing";
    const ids = new Set<string>();
    await parallel(rows, 8, async (row, index) => {
      if (!preview[index].duplicate && preview[index].candidates.length) return;
      try {
        const saved = await saveComplaintImport(row);
        if (!saved.complaint.id) throw new Error("Saved complaint identity was missing.");
        ids.add(saved.complaint.id);
        if (saved.duplicate) progress.duplicates++; else progress.imported++;
      } catch (error) {
        progress.failedImports++;
        console.log(JSON.stringify({ importFailedAtRow: index + 2, errorType: (error as Error).name }));
      }
      if ((progress.imported + progress.duplicates + progress.failedImports) % 50 === 0) await report();
    });
    const unique = [...ids];
    progress.uniqueCases = unique.length;
    progress.phase = "saved";
    await report();
    if (process.argv.includes("--prepare")) {
      const chunks: string[][] = [];
      for (let offset = 0; offset < unique.length; offset += 8) chunks.push(unique.slice(offset, offset + 8));
      progress.phase = "preparing";
      await report();
      let blocked = false;
      const prepare = async (batch: string[]) => {
        if (blocked) return;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await prepareReviewBatch(batch);
            progress.prepared += result.prepared;
            progress.skipped += result.skipped;
            await report();
            return;
          } catch (error) {
            const failure = error as { name?: string; status?: number };
            if (attempt === 0 && ![401, 403, 503].includes(failure.status ?? 0)) {
              await delay(2000);
              continue;
            }
            progress.failedBatches++;
            console.log(JSON.stringify({ preparationFailed: batch.length, errorType: failure.name, status: failure.status }));
            if (progress.failedBatches >= 3 || [401, 403, 503].includes(failure.status ?? 0)) blocked = true;
          }
        }
      };
      // Confirm the live batch format before starting concurrent work.
      const first = chunks.shift();
      if (first) {
        await prepare(first);
        if (progress.failedBatches) blocked = true;
      }
      await parallel(chunks, 4, prepare);
    }
    if (unique.length) {
      const [totals] = await db.select({
        matched: sql<number>`count(*)::int`,
        complete: sql<number>`count(*) filter (where category <> 'Unclassified' and recommendation <> 'AI review pending' and response_draft <> '')::int`,
        remaining: sql<number>`count(*) filter (where status not in ('Resolved','Closed') and (category = 'Unclassified' or recommendation = 'AI review pending' or response_draft = ''))::int`,
      }).from(complaintsTable).where(inArray(complaintsTable.id, unique));
      if (totals.matched !== unique.length) throw new Error("Import tracking did not match all saved cases.");
      progress.completeCases = totals.complete;
      progress.remainingCases = totals.remaining;
    }
    progress.phase = progress.failedImports || progress.remainingCases || progress.needsReview ? "needs_review_or_retry" : "completed";
    await report();
    console.log(JSON.stringify({ importFinished: true, ...progress }));
    if (progress.phase !== "completed") process.exitCode = 1;
  }
} finally {
  await writes;
  await pool.end();
}
