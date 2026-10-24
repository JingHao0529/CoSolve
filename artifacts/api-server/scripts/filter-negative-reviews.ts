import { asc, eq } from "drizzle-orm";
import { auditEventsTable, complaintsTable, db } from "@workspace/db";
import { requestRunpodSentiment } from "../src/routes/cosolve/runpod-client";
import { deleteNonnegativeCases } from "../src/routes/cosolve/nonnegative-cases";
import { makeId } from "../src/routes/cosolve/helpers";

const args = new Set(process.argv.slice(2));
const expectedCount = Number(process.argv.find(arg => arg.startsWith("--expect-total="))?.split("=")[1]);
const confirmed = args.has("--confirm-delete-nonnegative");
const classifyOnly = args.has("--classify-only");
if (!args.has("--classify-unknown") || (!confirmed && !classifyOnly) || !Number.isInteger(expectedCount) || expectedCount < 1) {
  console.error("Requires --classify-unknown, either --classify-only or --confirm-delete-nonnegative, and --expect-total=N.");
  process.exitCode = 2;
} else {
  try {
    const total = await db.select({ id: complaintsTable.id }).from(complaintsTable);
    if (total.length !== expectedCount) throw new Error(`Expected ${expectedCount} development cases; found ${total.length}. No changes were made.`);
    const unknown = await db.select({
      id: complaintsTable.id, subject: complaintsTable.subject, message: complaintsTable.message,
    }).from(complaintsTable).where(eq(complaintsTable.sentiment, "Unknown")).orderBy(asc(complaintsTable.id));
    let completed = 0, failed = 0, negatives = 0;
    let next = 0;
    const worker = async () => {
      while (true) {
        const index = next++;
        const row = unknown[index];
        if (!row) return;
        try {
          let result;
          for (let attempt = 0; ; attempt++) {
            try { result = await requestRunpodSentiment({ subject: row.subject, message: row.message }); break; }
            catch (error) {
              if (attempt >= 2) throw error;
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
          }
          await db.transaction(async tx => {
            const [current] = await tx.select({ id: complaintsTable.id, sentiment: complaintsTable.sentiment })
              .from(complaintsTable).where(eq(complaintsTable.id, row.id)).for("update");
            if (!current || current.sentiment !== "Unknown") return;
            await tx.update(complaintsTable).set({ sentiment: result!.sentiment }).where(eq(complaintsTable.id, row.id));
            await tx.insert(auditEventsTable).values({
              id: makeId("evt"), caseId: row.id, actor: "CoSolve AI (Runpod)",
              action: "AI sentiment classification completed",
              details: `Runpod sentiment: ${result!.sentiment} (${Math.round(result!.confidence * 100)}% confidence); human review: ${result!.needsHumanReview ? "required" : "not flagged"}${result!.modelVersion ? `; model: ${result!.modelVersion}` : ""}.`,
            });
            if (result!.sentiment === "Negative") negatives++;
          });
        } catch (error) {
          failed++;
          await db.insert(auditEventsTable).values({
            id: makeId("evt"), caseId: row.id, actor: "CoSolve AI (Runpod)",
            action: "AI sentiment classification failed",
            details: error instanceof Error ? error.message : "Runpod could not classify this review.",
          });
        }
        completed++;
        if (completed % 25 === 0 || completed === unknown.length) {
          console.log(JSON.stringify({ phase: "classify", completed, total: unknown.length, negativeResults: negatives, failed }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, unknown.length) }, () => worker()));
    const summary = await db.select({ sentiment: complaintsTable.sentiment })
      .from(complaintsTable).where(eq(complaintsTable.sentiment, "Unknown"));
    console.log(JSON.stringify({ phase: "classification complete", classified: completed - failed, failed, remainingUnknown: summary.length, newNegatives: negatives }));
    if (confirmed) {
      const result = await deleteNonnegativeCases({
        ids: total.map(row => row.id),
        actor: "CoSolve negative-only cleanup",
        reason: `Completed the requested Runpod sentiment pass over ${unknown.length} previously Unknown reviews; ${failed} classifications did not complete.`,
      });
      console.log(JSON.stringify({ phase: "deletion complete", ...result }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Negative-only filtering failed.");
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
