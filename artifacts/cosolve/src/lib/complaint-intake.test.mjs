import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  complaintInputFromForm,
  complaintRowsFromCsv,
  complaintRowsFromCsvBytes,
  complaintRowsFromWorkbook,
  importComplaintRows,
  importComplaintRowsThroughWorkflow,
  executeReviewedImport,
  automaticImportChoices,
} from "./complaint-intake.ts";

test("automatic imports run safe new rows and tracked retries but pause uncertain matches", async () => {
  const choices = automaticImportChoices([
    { duplicate: false, candidates: [] },
    { duplicate: true, candidates: [] },
    { duplicate: false, candidates: [{ id: "legacy" }] },
  ]);
  assert.deepEqual(choices, ["create", "duplicate", ""]);
  const calls = [];
  const rows = Array.from({ length: 3 }, (_, index) => ({
    customerName: `Reviewer ${index}`, source: "CSV", subject: "Issue", message: "Details",
  }));
  await executeReviewedImport(rows, choices.map(choice => choice || "done"), {
    create: async () => { calls.push("create"); return { id: "new" }; },
    link: async () => assert.fail("Must never auto-link a historical case"),
    duplicateId: () => "tracked", duplicateCase: () => ({ id: "tracked" }),
    prepare: async row => calls.push(`prepare:${row.id}`),
  });
  assert.deepEqual(calls, ["create", "prepare:new", "prepare:tracked"]);
});

test("review imports accept BOMs, Excel delimiters, heading aliases, star ratings and currency", () => {
  const csv = '\uFEFFsep=;\r\nReviewer Display Name;Review Body;Star Rating;Order Value\r\nAlex;"Late; damaged";Rated 2 out of 5;RM 1,200.00';
  const [row] = complaintRowsFromCsv(csv);
  assert.equal(row.customerName, "Alex");
  assert.equal(row.message, "Late; damaged");
  assert.equal(row.rating, 2);
  assert.equal(row.orderValue, 1200);
  const [anonymous] = complaintRowsFromCsv('Feedback\tRating\nBroken item\t1 star');
  assert.equal(anonymous.customerName, "Anonymous reviewer");
  assert.equal(anonymous.message, "Broken item");
});

test("UTF-16 Excel CSV files decode before parsing", () => {
  const text = '\uFEFFReviewer,Review\nAlex,Package was damaged';
  const bytes = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index++) {
    bytes[index * 2] = text.charCodeAt(index) & 255;
    bytes[index * 2 + 1] = text.charCodeAt(index) >> 8;
  }
  assert.equal(complaintRowsFromCsvBytes(bytes.buffer)[0].message, "Package was damaged");
});

test("reviewed import requires a decision and only executes explicitly chosen actions", async () => {
  const row = { customerName: "Legacy", source: "CSV", subject: "Repeated", message: "Same text" };
  const records = Array.from({ length: 6 }, () => ({ ...row }));
  const calls = [];
  const actions = {
    create: async input => { calls.push(["create", input.imported]); return { id: "new" }; },
    link: async (input, id) => { calls.push(["link", id, input.imported]); return { id }; },
    duplicateId: () => "tracked",
  };
  await assert.rejects(executeReviewedImport(records, ["", "create", "skip", "duplicate", "done", "case-b"], actions), /Review every row/);
  assert.equal(calls.length, 0);
  const result = await executeReviewedImport(records, ["case-a", "create", "skip", "duplicate", "done", "case-b"], {
    ...actions,
    link: async (input, id) => { if (id === "case-b") throw new Error("Preview again"); return actions.link(input, id); },
  });
  assert.deepEqual(calls, [["link", "case-a", true], ["create", true]]);
  assert.equal(result.imported, 1);
  assert.equal(result.linked, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.duplicates[0].caseId, "tracked");
  assert.equal(result.duplicates[0].rowNumber, 5);
  assert.deepEqual(result.failures, [{ rowNumber: 7, error: "Preview again" }]);
});

test("a create decision still respects an identity linked after preview", async () => {
  const row = { customerName: "Legacy", source: "CSV", subject: "Repeated", message: "Same text" };
  const result = await executeReviewedImport([row], ["create"], {
    create: async () => ({ id: "linked-since-preview", duplicate: true }),
    link: async () => assert.fail("Must not link without selection"),
    duplicateId: () => undefined,
  });
  assert.equal(result.imported, 0);
  assert.equal(result.duplicates[0].caseId, "linked-since-preview");
});

test("review decisions preserve AI preparation for imports and retries but never prepare historical links", async () => {
  const row = { customerName: "Review", source: "CSV", subject: "Issue", message: "Details" };
  const prepared = [];
  const result = await executeReviewedImport([row, row, row, row], ["create", "duplicate", "legacy-case", "skip"], {
    create: async () => ({ id: "new-case" }),
    link: async (_row, id) => ({ id }),
    duplicateId: () => "tracked-case",
    duplicateCase: () => ({ id: "tracked-case" }),
    prepare: async complaint => { prepared.push(complaint.id); },
  });
  assert.deepEqual(prepared, ["new-case", "tracked-case"]);
  assert.equal(result.prepared, 2);
  assert.equal(result.linked, 1);
  assert.equal(result.imported, 1);
});

test("reviewed workbook rows keep worksheet locations and report saved cases after AI failures", async () => {
  const row = {
    customerName: "Workbook", source: "Excel", subject: "Issue", message: "Details",
    sourceLocation: { sheetName: "Reviews", rowNumber: 4 },
  };
  const result = await executeReviewedImport([row], ["create"], {
    create: async input => {
      assert.equal(input.sourceLocation, undefined);
      return { id: "saved-before-ai" };
    },
    link: async () => assert.fail("Not a historical link"),
    duplicateId: () => undefined,
    prepare: async () => { throw new Error("Classifying with AI: unavailable"); },
  });
  assert.equal(result.imported, 1);
  assert.equal(result.prepared, 0);
  assert.deepEqual(result.failures, [{
    rowNumber: 4, sheetName: "Reviews", caseId: "saved-before-ai",
    error: "Classifying with AI: unavailable",
  }]);
});

test("manual form mapping retains the supplied fields, date, and rating", () => {
  const payload = complaintInputFromForm({
    customerName: "  Sam Rivera ",
    customerEmail: " sam@example.com ",
    source: "Email",
    subject: "  Missing accessory ",
    message: "The filter was not in the package.",
    orderId: "ORD-420",
    orderValue: "79.5",
    createdAt: "2026-04-07T09:15",
    rating: "3",
  });

  assert.deepEqual(payload, {
    customerName: "Sam Rivera",
    customerEmail: "sam@example.com",
    source: "Email",
    subject: "Missing accessory",
    message: "The filter was not in the package.",
    orderId: "ORD-420",
    orderValue: 79.5,
    createdAt: new Date("2026-04-07T09:15").toISOString(),
    rating: 3,
  });
});

test("CSV import preserves quoted commas, escaped quotes, newlines, source, date, and rating", () => {
  const csv = [
    "customerName,customerEmail,source,subject,message,orderId,orderValue,createdAt,rating",
    'Avery Chen,avery@example.com,Google Review,Item arrived damaged,"The box was crushed, and the note said ""handle with care"".\nI need help.",ORD-774,92.25,2026-05-12T08:30:00.000Z,5',
  ].join("\r\n");

  const [complaint] = complaintRowsFromCsv(csv);
  assert.equal(complaint.customerName, "Avery Chen");
  assert.equal(complaint.customerEmail, "avery@example.com");
  assert.equal(complaint.source, "Google Review");
  assert.equal(complaint.subject, "Item arrived damaged");
  assert.equal(
    complaint.message,
    'The box was crushed, and the note said "handle with care".\nI need help.',
  );
  assert.equal(complaint.orderId, "ORD-774");
  assert.equal(complaint.orderValue, 92.25);
  assert.equal(complaint.createdAt, "2026-05-12T08:30:00.000Z");
  assert.equal(complaint.rating, 5);
});

test("CSV import reports malformed structure and invalid supplied details", () => {
  assert.throws(
    () => complaintRowsFromCsv('customerName,subject,message\nAvery,Cracked,"unclosed'),
    /unclosed quoted value/i,
  );
  assert.throws(
    () => complaintRowsFromCsv("source,author,createdAt\nEmail,Avery,2026-01-01"),
    /required columns/i,
  );
  assert.throws(
    () =>
      complaintRowsFromCsv(
        "customerName,subject,message,rating\nAvery,Cracked,The jar broke,6",
      ),
    /row 2: customer rating is invalid/i,
  );
  assert.throws(
    () =>
      complaintRowsFromCsv(
        "customerName,subject,message\nAvery,Cracked",
      ),
    /row 2 has 2 columns; expected 3/i,
  );
});

test("CSV imports report partial API failures while preserving successful records", async () => {
  const records = complaintRowsFromCsv(
    [
      "customerName,source,subject,message",
      "First,Email,Working case,Keep this message",
      "Second,Phone,Temporary failure,This row is rejected by the API",
      "Third,Web form,Working case 2,Keep this message too",
    ].join("\n"),
  );
  const saved = [];

  const result = await importComplaintRows(records, async (data) => {
    if (data.subject === "Temporary failure") throw new Error("Simulated API failure");
    saved.push(data);
    return { id: `case-${saved.length}` };
  });

  assert.deepEqual(result, { imported: 2, failed: 1, duplicates: [] });
  assert.deepEqual(saved.map((record) => record.source), ["Email", "Web form"]);
  assert.deepEqual(saved.map((record) => record.message), [
    "Keep this message",
    "Keep this message too",
  ]);
});

test("CSV source identifiers are preserved with supported aliases", () => {
  for (const column of ["sourceId", "externalId", "reviewId", "messageId"]) {
    const [row] = complaintRowsFromCsv(`customerName,subject,message,${column}\nAvery,Cracked,The jar broke,Review-ABC`);
    assert.equal(row.sourceId, "Review-ABC");
  }
});

test("Excel imports accept review headers and read every populated worksheet", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Reviewer", "Review title", "Review text", "Email", "Platform", "Order ID", "Stars", "Review ID"],
      ["Avery Chen", "Late delivery", "The order arrived a week late.", "avery@example.com", "Trustpilot", "ORD-18", 2, "TP-18"],
    ]),
    "Trustpilot",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Customer name", "Subject", "Comment", "Source", "External ID"],
      ["Morgan Lee", "Damaged item", "The glass was cracked.", "Google Review", "GR-9"],
    ]),
    "Google",
  );

  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const rows = await complaintRowsFromWorkbook(bytes);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].customerName, "Avery Chen");
  assert.equal(rows[0].message, "The order arrived a week late.");
  assert.equal(rows[0].sourceId, "TP-18");
  assert.equal(rows[0].rating, 2);
  assert.equal(rows[0].sourceLocation.sheetName, "Trustpilot");
  assert.equal(rows[1].source, "Google Review");
  assert.equal(rows[1].sourceId, "GR-9");
  assert.equal(rows[1].sourceLocation.sheetName, "Google");
});

test("review exports without a separate title use the review text as the case subject", () => {
  const [row] = complaintRowsFromCsv(
    "Reviewer,Review,Rating\nAvery Chen,The delivery took much longer than promised.,2",
  );
  assert.equal(row.subject, "The delivery took much longer than promised.");
  assert.equal(row.message, "The delivery took much longer than promised.");
});

test("Excel imports reject workbooks without complaint rows and cap all sheets together", async () => {
  const empty = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([["title", "notes"]]), "Notes");
  await assert.rejects(
    complaintRowsFromWorkbook(XLSX.write(empty, { type: "array", bookType: "xlsx" })),
    /worksheet "notes".*at least one complaint/i,
  );

  const tooLarge = XLSX.utils.book_new();
  const rows = [["name", "title", "message"]];
  for (let index = 0; index < 5001; index += 1) {
    rows.push([`Customer ${index}`, `Issue ${index}`, "Complaint details"]);
  }
  XLSX.utils.book_append_sheet(tooLarge, XLSX.utils.aoa_to_sheet(rows), "Reviews");
  await assert.rejects(
    complaintRowsFromWorkbook(XLSX.write(tooLarge, { type: "array", bookType: "xlsx" })),
    /up to 5000 complaints/i,
  );
});

test("restaurant exports retain their source and normalize exact dates without guessing relative dates", () => {
  const rows = complaintRowsFromCsv("Author,Title,Review,Rating,Dates,Restaurant\nReviewer,Good meal,Good food,5,Reviewed 10 December 2021,Bistro\nReviewer,Slow service,Long wait,2,Reviewed 2 weeks ago,Bistro");
  assert.equal(rows[0].source, "CSV import · Bistro");
  assert.equal(rows[0].createdAt, "2021-12-10T00:00:00.000Z");
  assert.equal(rows[1].createdAt, undefined);
  assert.equal(rows[1].originalReviewDate, "Reviewed 2 weeks ago");
});

test("large previews use bounded requests and preserve every row's position", async () => {
  const { previewImportBatches } = await import("./complaint-intake.ts");
  const sizes = [];
  const rows = Array.from({length:1428}, (_, index) => index);
  const result = await previewImportBatches(rows, async batch => { sizes.push(batch.length); return batch.map(index => ({index})); });
  assert.deepEqual(sizes, [300,300,300,300,228]);
  assert.deepEqual(result.map(row => row.index), rows);
  await assert.rejects(previewImportBatches(rows, async () => []), /incomplete batch/);
});

test("imports distinguish saved, duplicate and failed rows and retain existing case links", async () => {
  const rows = complaintRowsFromCsv(
    "customerName,subject,message\nFirst,New case,A\nSecond,Existing case,B\nThird,Failed case,C",
  );
  const attempted = [];
  const result = await importComplaintRows(rows, async (data) => {
    attempted.push(data);
    if (data.customerName === "Third") throw new Error("Temporary failure");
    return { id: data.customerName === "Second" ? "CS-existing" : "CS-new", duplicate: data.customerName === "Second" };
  });
  assert.deepEqual(result, {
    imported: 1, failed: 1,
    duplicates: [{ rowNumber: 3, caseId: "CS-existing", customerName: "Second", subject: "Existing case" }],
  });
  assert.ok(attempted.every(row => row.imported === true));
  assert.ok(rows.every(row => row.imported === undefined));
});

test("review imports run AI stages, request manual approval, and resume incomplete duplicates", async () => {
  const rows = complaintRowsFromCsv(
    "customerName,subject,message,reviewId\nNew customer,Refund needed,The order was damaged,TP-new\nRetry customer,Old issue,Case saved before AI completed,TP-retry\nReady customer,Resolved earlier,This case is already prepared,TP-ready",
  );
  const calls = [];
  const result = await importComplaintRowsThroughWorkflow(rows, {
    async create(data) {
      calls.push(["create", data.customerName, data.imported, data.sourceLocation]);
      if (data.customerName === "Retry customer") {
        return { id: "CS-retry", duplicate: true, category: "Unclassified", recommendation: "AI review pending", status: "New" };
      }
      if (data.customerName === "Ready customer") {
        return { id: "CS-ready", duplicate: true, sentiment: "Negative", category: "Delivery", recommendation: "Apology", recommendedAmount: 0, status: "Investigating", responseDraft: "We are sorry." };
      }
      return { id: "CS-new", category: "Unclassified", recommendation: "AI review pending", status: "New" };
    },
    async classify(id) {
      calls.push(["classify", id]);
      return { category: "Delivery", sentiment: "Negative" };
    },
    async recommend(id) {
      calls.push(["recommend", id]);
      return { resolution: "Partial refund", amount: 25 };
    },
    async requestApproval(id, amount) {
      calls.push(["approval", id, amount]);
    },
    async draftResponse(id) {
      calls.push(["draft", id]);
      return { response: "We are sorry and are reviewing this." };
    },
  });

  assert.equal(result.imported, 1);
  assert.equal(result.processed, 3);
  assert.equal(result.resumed, 1);
  assert.equal(result.failedRows.length, 0);
  assert.equal(result.duplicates.length, 2);
  assert.ok(calls.some(([action, id, amount]) => action === "approval" && id === "CS-new" && amount === 25));
  assert.ok(calls.some(([action, id]) => action === "approval" && id === "CS-retry"));
  assert.equal(calls.some(([action, id]) => action === "classify" && id === "CS-ready"), false);
  assert.equal(calls.some(([action, id]) => action === "draft" && id === "CS-ready"), false);
  assert.ok(calls.every(([action, , , sourceLocation]) => action !== "create" || sourceLocation === undefined));
});

test("a failed AI stage is reported per row while later complaints continue", async () => {
  const rows = complaintRowsFromCsv(
    "customerName,subject,message\nFirst,AI unavailable,A\nSecond,Working case,B",
  );
  const result = await importComplaintRowsThroughWorkflow(rows, {
    async create(data) {
      return { id: `CS-${data.customerName}`, category: "Unclassified", recommendation: "AI review pending", status: "New" };
    },
    async classify(id) {
      if (id === "CS-First") throw new Error("AI temporarily unavailable");
      return { category: "Delivery", sentiment: "Negative" };
    },
    async recommend() {
      return { resolution: "Apology", amount: 0 };
    },
    async requestApproval() {},
    async draftResponse() {
      return { response: "Thanks for sharing this." };
    },
  });

  assert.equal(result.imported, 2);
  assert.equal(result.processed, 1);
  assert.equal(result.failedRows.length, 1);
  assert.equal(result.failedRows[0].caseId, "CS-First");
  assert.equal(result.failedRows[0].stage, "Classifying with Runpod + Grafilab");
});

test("positive and neutral imports stop before recommendation, approval and drafting", async () => {
  for (const sentiment of ["Positive", "Neutral"]) {
    const calls = [];
    const result = await importComplaintRowsThroughWorkflow([{
      customerName: "Synthetic review", source: "CSV", subject: "Feedback", message: "Synthetic feedback",
    }], {
      create: async () => ({ id: "filtered", category: "Unclassified", sentiment: "Unknown" }),
      classify: async () => ({ category: "Feedback", sentiment }),
      recommend: async () => { calls.push("recommend"); return { resolution: "Apology", amount: 0 }; },
      requestApproval: async () => { calls.push("approve"); },
      draftResponse: async () => { calls.push("draft"); return { response: "Synthetic response" }; },
    });
    assert.equal(result.filtered, 1);
    assert.equal(result.failedRows.length, 0);
    assert.deepEqual(calls, []);
  }
});
