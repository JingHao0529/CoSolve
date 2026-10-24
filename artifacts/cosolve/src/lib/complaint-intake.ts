export interface ComplaintInput {
  originalReviewDate?: string;
  customerName: string;
  customerEmail?: string;
  source: string;
  subject: string;
  message: string;
  orderId?: string;
  orderValue?: number;
  createdAt?: string;
  rating?: number;
  sourceId?: string;
  imported?: boolean;
  sourceLocation?: { sheetName: string; rowNumber: number };
}

type FormValue = string | number | undefined;

function parseOptionalNumber(
  value: FormValue,
  label: string,
  options: { integer?: boolean; max?: number } = {},
): number | undefined {
  if (value === undefined || String(value).trim() === "") return undefined;
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    (options.integer && !Number.isInteger(number)) ||
    (options.max !== undefined && number > options.max)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return number;
}

export function complaintInputFromForm(
  fields: Record<string, FormValue>,
): ComplaintInput {
  const customerName = String(fields.customerName ?? "").trim();
  const source = String(fields.source ?? "").trim();
  const subject = String(fields.subject ?? "").trim();
  const message = String(fields.message ?? "").trim();
  if (!customerName || !source || !subject || !message) {
    throw new Error("Customer name, source, subject, and message are required.");
  }

  const createdAtValue = String(fields.createdAt ?? "").trim();
  let createdAt: string | undefined;
  if (createdAtValue) {
    const date = new Date(createdAtValue);
    if (!Number.isFinite(date.getTime())) {
      throw new Error("Received date is invalid.");
    }
    createdAt = date.toISOString();
  }

  return {
    customerName,
    customerEmail: String(fields.customerEmail ?? "").trim(),
    source,
    subject,
    message,
    orderId: String(fields.orderId ?? "").trim(),
    orderValue: parseOptionalNumber(fields.orderValue, "Order value"),
    createdAt,
    rating: parseOptionalNumber(fields.rating, "Customer rating", {
      integer: true,
      max: 5,
    }),
  };
}

function parseCsvRows(source: string): string[][] {
  source = source.replace(/^\uFEFF/, "");
  const separatorDirective = source.match(/^sep=([,;\t])\r?\n/i);
  if (separatorDirective) source = source.slice(separatorDirective[0].length);
  const header = source.split(/\r?\n/, 1)[0];
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (const char of header) {
    if (char === '"') quoted = !quoted;
    if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  const delimiter = separatorDirective?.[1] ??
    [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;

  const finishRow = () => {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
    row = [];
    field = "";
    afterQuote = false;
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"' && inQuotes && source[i + 1] === '"') {
      field += '"';
      i += 1;
    } else if (char === '"' && inQuotes) {
      inQuotes = false;
      afterQuote = true;
    } else if (char === '"' && !inQuotes && field.length === 0) {
      inQuotes = true;
    } else if (afterQuote && char !== delimiter && char !== "\n" && char !== "\r") {
      if (!/\s/.test(char)) {
        throw new Error("The CSV contains an unexpected character after a quoted value.");
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(field.trim());
      field = "";
      afterQuote = false;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      finishRow();
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error("The CSV contains an unclosed quoted value.");
  finishRow();
  return rows;
}

export const MAX_IMPORT_ROWS = 5000;

function reviewDate(value: string): string {
  if (/^Reviewed\s+(?:today|yesterday|\d+\s+(?:day|week|month|year)s?\s+ago)$/i.test(value)) return "";
  const match = value.match(/^Reviewed\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);
  if (!match) return value;
  const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(match[2].slice(0, 3).toLowerCase());
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  if (month < 0 || date.getUTCDate() !== Number(match[1]) || date.getUTCMonth() !== month) {
    throw new Error("Invalid reviewed date.");
  }
  return date.toISOString();
}

export function complaintRowsFromCsv(source: string): ComplaintInput[] {
  const rows = parseCsvRows(source);
  if (rows.length < 2) {
    throw new Error("The CSV must include a header and at least one complaint.");
  }

  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headers = new Map(rows[0].map((value, index) => [normalize(value), index]));
  const findColumn = (...names: string[]) =>
    names.map((name) => headers.get(name)).find((index) => index !== undefined);
  const nameColumn = findColumn(
    "customername",
    "name",
    "reviewer",
    "reviewername",
    "reviewauthor",
    "author",
    "authorname",
    "reviewerdisplayname",
    "displayname",
    "customer",
    "username",
  );
  const subjectColumn = findColumn("subject", "title", "reviewtitle", "complainttitle");
  const messageColumn = findColumn(
    "message",
    "content",
    "body",
    "review",
    "reviewtext",
    "reviewcontent",
    "complaint",
    "comment",
    "description",
    "text",
    "reviewbody",
    "reviewdescription",
    "complaintdescription",
    "feedback",
    "comments",
  );
  const textColumn = messageColumn ?? subjectColumn;
  if (textColumn === undefined) {
    throw new Error(
      "Required columns: message, review, content, feedback, or subject. Customer name or reviewer is optional.",
    );
  }

  const emailColumn = findColumn("customeremail", "email", "revieweremail");
  const sourceColumn = findColumn(
    "source",
    "channel",
    "platform",
    "website",
    "reviewplatform",
  );
  const orderColumn = findColumn("orderid", "ordernumber", "transactionid");
  const restaurantColumn = findColumn("restaurant");
  const valueColumn = findColumn("ordervalue", "ordertotal", "purchaseamount", "amount");
  const dateColumn = findColumn(
    "createdat",
    "receivedat",
    "reviewdate",
    "timestamp",
    "date",
    "datepublished",
    "publishedat",
    "datecreated",
    "dates",
  );
  const ratingColumn = findColumn("rating", "customerrating", "stars", "score", "ratingvalue", "reviewrating", "starrating");
  const sourceIdColumn = findColumn(
    "sourceid",
    "externalid",
    "externalreviewid",
    "reviewid",
    "messageid",
  );

  const records = rows.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== rows[0].length) {
      throw new Error(
        `Row ${rowNumber} has ${cells.length} columns; expected ${rows[0].length}.`,
      );
    }
    const cell = (column?: number) =>
      column === undefined ? "" : (cells[column] ?? "").trim();
    const customerName = cell(nameColumn) || "Anonymous reviewer";
    const message = cell(textColumn);
    const subject = cell(subjectColumn) || message.slice(0, 120).trim();
    if (!message) {
      throw new Error(
        `Row ${rowNumber} is missing a customer name or review text.`,
      );
    }
    try {
      const complaint = complaintInputFromForm({
        customerName,
        customerEmail: cell(emailColumn),
        source: [cell(sourceColumn) || "CSV import", cell(restaurantColumn)].filter(Boolean).join(" · "),
        subject,
        message,
        orderId: cell(orderColumn),
        orderValue: cell(valueColumn).replace(/^(?:RM|MYR|USD|\$)\s*/i, "").replace(/,(?=\d{3}(?:,|\.|$))/g, ""),
        createdAt: reviewDate(cell(dateColumn)),
        rating: cell(ratingColumn).replace(/^(?:rated\s*)?([0-5](?:\.0)?)(?:\s*(?:out of|\/)\s*5|\s*stars?)?$/i, "$1"),
      });
      const sourceId = cell(sourceIdColumn);
      return {
        ...complaint,
        ...(sourceId ? { sourceId } : {}),
        ...(cell(dateColumn) && !reviewDate(cell(dateColumn)) ? { originalReviewDate: cell(dateColumn) } : {}),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid value.";
      throw new Error(`Row ${rowNumber}: ${detail}`);
    }
  });

  if (records.length > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS} complaints per file.`);
  return records;
}

export function complaintRowsFromCsvBytes(data: ArrayBuffer): ComplaintInput[] {
  const bytes = new Uint8Array(data);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  return complaintRowsFromCsv(new TextDecoder(encoding).decode(bytes));
}

export async function complaintRowsFromWorkbook(
  data: ArrayBuffer,
): Promise<ComplaintInput[]> {
  let xlsx: typeof import("xlsx");
  let workbook: import("xlsx").WorkBook;
  try {
    xlsx = await import("xlsx");
    workbook = xlsx.read(data, { type: "array", cellDates: true });
  } catch {
    throw new Error("The Excel workbook could not be opened.");
  }

  if (workbook.SheetNames.length === 0) {
    throw new Error("The Excel workbook does not contain a worksheet.");
  }

  const records: ComplaintInput[] = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!xlsx.utils.sheet_to_json(worksheet, { header: 1, blankrows: false })
      .some(row => (row as unknown[]).some(cell => cell !== null && cell !== undefined && String(cell).trim()))) continue;
    const csv = xlsx.utils.sheet_to_csv(worksheet, { dateNF: "yyyy-mm-dd" });
    if (!csv.trim()) continue;

    let sheetRecords: ComplaintInput[];
    try {
      sheetRecords = complaintRowsFromCsv(csv);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid worksheet.";
      throw new Error(`Worksheet "${sheetName}": ${detail}`);
    }
    records.push(
      ...sheetRecords.map((record, index) => ({
        ...record,
        sourceLocation: { sheetName, rowNumber: index + 2 },
      })),
    );
    if (records.length > MAX_IMPORT_ROWS) {
      throw new Error(`Import up to ${MAX_IMPORT_ROWS} complaints per file.`);
    }
  }

  if (records.length === 0) {
    throw new Error("The workbook does not contain any complaint rows.");
  }
  return records;
}

export async function previewImportBatches<T, U>(
  rows: T[],
  preview: (batch: T[]) => Promise<U[]>,
  batchSize = 300,
): Promise<U[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 300) throw new Error("Invalid preview batch size.");
  const results: U[] = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const result = await preview(batch);
    if (result.length !== batch.length) throw new Error("Import preview returned an incomplete batch. No rows were imported.");
    results.push(...result);
  }
  return results;
}

export interface DuplicateImportRow {
  rowNumber: number;
  sheetName?: string;
  caseId: string;
  customerName: string;
  subject: string;
}

export interface ImportReviewResult {
  imported: number;
  linked: number;
  skipped: number;
  prepared: number;
  duplicates: DuplicateImportRow[];
  linkedCaseIds: string[];
  affectedCaseIds: string[];
  failures: { rowNumber: number; sheetName?: string; caseId?: string; error: string }[];
}

export interface ImportProgress {
  rowNumber: number;
  rowIndex: number;
  sheetName?: string;
  total: number;
  customerName: string;
  stage: string;
}

/** Auto-process only known identities and new rows. Historical matches stay unresolved. */
export function automaticImportChoices(
  reviews: { duplicate: boolean; candidates: unknown[] }[],
): string[] {
  return reviews.map(row => row.duplicate ? "duplicate" : row.candidates.length ? "" : "create");
}

export interface ImportPipelineFailure {
  rowNumber: number;
  sheetName?: string;
  caseId?: string;
  customerName: string;
  subject: string;
  stage: string;
  message: string;
}

export interface ImportPipelineCase {
  id: string;
  duplicate?: boolean;
  category?: string;
  recommendation?: string;
  recommendedAmount?: number;
  status?: string;
  responseDraft?: string;
  sentiment?: string;
}

export interface ImportPipelineActions {
  create: (data: ComplaintInput) => Promise<ImportPipelineCase>;
  classify: (id: string) => Promise<{ category: string; sentiment?: string }>;
  recommend: (id: string) => Promise<{ resolution: string; amount: number }>;
  requestApproval: (id: string, amount: number) => Promise<unknown>;
  draftResponse: (id: string) => Promise<{ response: string }>;
}

export async function importComplaintRowsThroughWorkflow(
  records: ComplaintInput[],
  actions: ImportPipelineActions,
  onProgress?: (progress: ImportProgress) => void,
): Promise<{
  imported: number;
  processed: number;
  filtered: number;
  resumed: number;
  failedRows: ImportPipelineFailure[];
  duplicates: DuplicateImportRow[];
}> {
  let imported = 0;
  let processed = 0;
  let filtered = 0;
  let resumed = 0;
  const failedRows: ImportPipelineFailure[] = [];
  const duplicates: DuplicateImportRow[] = [];

  for (const [index, record] of records.entries()) {
    const location = record.sourceLocation;
    const rowNumber = location?.rowNumber ?? index + 2;
    const complaint = { ...record };
    delete complaint.sourceLocation;
    let stage = "Saving complaint";
    let caseId: string | undefined;

    const report = (nextStage: string) => {
      stage = nextStage;
      onProgress?.({
        rowNumber,
        rowIndex: index + 1,
        ...(location?.sheetName ? { sheetName: location.sheetName } : {}),
        total: records.length,
        customerName: record.customerName,
        stage,
      });
    };

    try {
      report("Matching customer and order");
      const existing = await actions.create({ ...complaint, imported: true });
      caseId = existing.id;
      const wasDuplicate = Boolean(existing.duplicate);
      if (wasDuplicate) {
        duplicates.push({
          rowNumber,
          ...(location?.sheetName ? { sheetName: location.sheetName } : {}),
          caseId: existing.id,
          customerName: record.customerName,
          subject: record.subject,
        });
      } else {
        imported += 1;
      }

      let resumedIncompleteCase = false;
      let classification = existing.category;
      if (!classification || classification === "Unclassified" || existing.sentiment !== "Negative") {
        resumedIncompleteCase = wasDuplicate;
        report("Classifying with Runpod + Grafilab");
        const result = await actions.classify(existing.id);
        if (result.sentiment?.toLowerCase() !== "negative") {
          if (!result.sentiment) throw new Error("AI did not return a sentiment. This review was not processed.");
          filtered += 1;
          processed += 1;
          report(`Filtered out: ${result.sentiment} sentiment`);
          continue;
        }
        classification = result.category;
      }

      let resolution = existing.recommendation;
      let amount = existing.recommendedAmount ?? 0;
      if (!resolution || resolution === "AI review pending") {
        resumedIncompleteCase = wasDuplicate;
        report("Generating resolution recommendation");
        const result = await actions.recommend(existing.id);
        resolution = result.resolution;
        amount = result.amount;
      }

      let status = existing.status ?? "New";
      if (
        amount > 0 &&
        status !== "Pending approval" &&
        status !== "Resolved" &&
        status !== "Closed"
      ) {
        resumedIncompleteCase = wasDuplicate;
        report("Sending to approval queue");
        await actions.requestApproval(existing.id, amount);
        status = "Pending approval";
      }

      if (!existing.responseDraft?.trim()) {
        resumedIncompleteCase = wasDuplicate;
        report("Drafting customer response with Grafilab");
        await actions.draftResponse(existing.id);
      }

      report("Ready for human review");
      processed += 1;
      if (resumedIncompleteCase) resumed += 1;
    } catch (error) {
      failedRows.push({
        rowNumber,
        ...(location?.sheetName ? { sheetName: location.sheetName } : {}),
        caseId,
        customerName: record.customerName,
        subject: record.subject,
        stage,
        message: error instanceof Error ? error.message : "This step could not be completed.",
      });
    }
  }

  return { imported, processed, filtered, resumed, failedRows, duplicates };
}

export async function importComplaintRows<T extends { id: string; duplicate?: boolean } | void>(
  records: ComplaintInput[],
  createComplaint: (data: ComplaintInput) => Promise<T>,
): Promise<{ imported: number; failed: number; duplicates: DuplicateImportRow[] }> {
  let imported = 0;
  let failed = 0;
  const duplicates: DuplicateImportRow[] = [];
  for (const [index, data] of records.entries()) {
    try {
      const result = await createComplaint({ ...data, imported: true });
      if (result && result.duplicate) {
        duplicates.push({
          rowNumber: data.sourceLocation?.rowNumber ?? index + 2,
          ...(data.sourceLocation?.sheetName
            ? { sheetName: data.sourceLocation.sheetName }
            : {}),
          caseId: result.id,
          customerName: data.customerName,
          subject: data.subject,
        });
      } else {
        imported += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { imported, failed, duplicates };
}

/** Each uncertain row needs an explicit create, skip or case-link decision. */
export async function executeReviewedImport(
  records: ComplaintInput[],
  choices: string[],
  actions: {
    create: (row: ComplaintInput) => Promise<ImportPipelineCase>;
    link: (row: ComplaintInput, caseId: string) => Promise<{ id: string }>;
    duplicateId: (index: number) => string | undefined;
    duplicateCase?: (index: number) => ImportPipelineCase | undefined;
    prepare?: (complaint: ImportPipelineCase, index: number) => Promise<void>;
  },
): Promise<ImportReviewResult> {
  if (choices.length !== records.length || choices.some(choice => !choice)) {
    throw new Error("Review every row before confirming.");
  }
  const result: ImportReviewResult = { imported: 0, linked: 0, skipped: 0, prepared: 0, duplicates: [], linkedCaseIds: [], affectedCaseIds: [], failures: [] };
  for (const [index, row] of records.entries()) {
    const choice = choices[index];
    if (choice === "done") continue;
    const location = {
      rowNumber: row.sourceLocation?.rowNumber ?? index + 2,
      ...(row.sourceLocation?.sheetName ? { sheetName: row.sourceLocation.sheetName } : {}),
    };
    const { sourceLocation: _sourceLocation, ...input } = row;
    let caseId: string | undefined;
    try {
      if (choice === "skip") { result.skipped++; continue; }
      if (choice === "duplicate") {
        const id = actions.duplicateId(index);
        if (!id) throw new Error("Duplicate identity changed. Preview the file again.");
        caseId = id;
        result.affectedCaseIds.push(id);
        result.duplicates.push({ ...location, caseId: id, customerName: row.customerName, subject: row.subject });
        if (actions.prepare) {
          const existing = actions.duplicateCase?.(index);
          if (!existing) throw new Error("Preview the file again to resume this case.");
          await actions.prepare({ ...existing, duplicate: true }, index);
          result.prepared++;
        }
      } else if (choice === "create") {
        const saved = await actions.create({ ...input, imported: true });
        caseId = saved.id;
        result.affectedCaseIds.push(saved.id);
        if (saved.duplicate) result.duplicates.push({ ...location, caseId: saved.id, customerName: row.customerName, subject: row.subject });
        else result.imported++;
        if (actions.prepare) {
          await actions.prepare(saved, index);
          result.prepared++;
        }
      } else {
        const saved = await actions.link({ ...input, imported: true }, choice);
        result.linked++;
        result.linkedCaseIds.push(saved.id);
        result.affectedCaseIds.push(saved.id);
      }
    } catch (error) {
      result.failures.push({ ...location, ...(caseId ? { caseId } : {}), error: error instanceof Error ? error.message : "Could not save this row." });
    }
  }
  return result;
}
