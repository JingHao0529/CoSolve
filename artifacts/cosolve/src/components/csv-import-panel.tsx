import { useState } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePreviewComplaintImport, useLinkComplaintImport, useCreateComplaint,
  useClassifyComplaint, useRecommendResolution, useDraftResponse, useUpdateComplaint,
  getListComplaintsQueryKey, getGetDashboardQueryKey, getListAuditLogQueryKey,
  getListCustomersQueryKey, getGetComplaintQueryKey, getGetAnalyticsQueryKey,
  getComplaint,
  type ImportRowReview,
} from "@workspace/api-client-react";
import { automaticImportChoices, complaintRowsFromCsvBytes, complaintRowsFromWorkbook, previewImportBatches, importComplaintRowsThroughWorkflow, executeReviewedImport, type ComplaintInput, type ImportReviewResult, type ImportProgress } from "../lib/complaint-intake";
import { mutationErrorMessage } from "../lib/mutation-error-message";

const caseHref = (id: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/cases/${encodeURIComponent(id)}`;

export function CsvImportPanel() {
  const { isLoaded: authLoaded, user } = useUser();
  const preview = usePreviewComplaintImport();
  const link = useLinkComplaintImport();
  const create = useCreateComplaint();
  const classify = useClassifyComplaint();
  const recommend = useRecommendResolution();
  const draftResponse = useDraftResponse();
  const update = useUpdateComplaint();
  const client = useQueryClient();
  const [records, setRecords] = useState<ComplaintInput[]>([]);
  const [reviews, setReviews] = useState<ImportRowReview[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ImportReviewResult>();
  const [progress, setProgress] = useState<ImportProgress>();

  async function readFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setNotice("");
    setResult(undefined);
    setProgress(undefined);
    setRecords([]);
    setReviews([]);
    setChoices([]);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file smaller than 10 MB.");
      const rows = file.name.toLowerCase().endsWith(".csv")
        ? complaintRowsFromCsvBytes(await file.arrayBuffer())
        : await complaintRowsFromWorkbook(await file.arrayBuffer());
      const review = await previewImportBatches(rows, batch => preview.mutateAsync({ data: { rows: batch } }));
      setRecords(rows);
      setReviews(review);
      const decisions = automaticImportChoices(review);
      setChoices(decisions);
      if (decisions.some(Boolean)) {
        // Uncertain historical matches remain untouched while safe rows run immediately.
        await runImport(rows, review, decisions.map(choice => choice || "done"), decisions);
      } else {
        setNotice("These rows have uncertain historical matches. Choose how to handle them below; nothing has been saved.");
      }
    } catch (error) {
      setNotice(mutationErrorMessage(error, "The CSV / XLSX could not be read or checked. Nothing was saved."));
    } finally {
      setBusy(false);
    }
  }

  function refreshViews(id?: string) {
    for (const queryKey of [
      getListComplaintsQueryKey(), getGetDashboardQueryKey(), getGetAnalyticsQueryKey(),
      getListAuditLogQueryKey(), getListCustomersQueryKey(),
    ]) void client.invalidateQueries({ queryKey });
    if (id) void client.invalidateQueries({ queryKey: getGetComplaintQueryKey(id) });
  }

  async function runImport(
    rows: ComplaintInput[], reviewRows: ImportRowReview[],
    decisions: string[], originalDecisions = decisions,
  ) {
    setBusy(true);
    setNotice("");
    try {
      let filteredReviews = 0;
      const saved = await executeReviewedImport(rows, decisions, {
        create: async row => {
          const complaint = await create.mutateAsync({ data: row });
          refreshViews(complaint.id);
          return complaint;
        },
        link: (row, caseId) => link.mutateAsync({ data: { row, caseId } }),
        duplicateId: index => reviewRows[index].existingCase?.id,
        duplicateCase: index => reviewRows[index].existingCase,
        prepare: async (complaint, index) => {
          const workflow = await importComplaintRowsThroughWorkflow([rows[index]], {
            create: async () => complaint.duplicate && complaint.sentiment === "Negative"
              ? { ...await getComplaint(complaint.id), duplicate: true } : complaint,
            classify: id => classify.mutateAsync({ id }),
            recommend: id => recommend.mutateAsync({ id }),
            requestApproval: (id, amount) => update.mutateAsync({ id, data: { status: "Pending approval", recommendedAmount: amount } }),
            draftResponse: id => draftResponse.mutateAsync({ id }),
          }, value => setProgress({ ...value, rowIndex: index + 1, total: rows.length }));
          filteredReviews += workflow.filtered;
          refreshViews(complaint.id);
          if (workflow.failedRows.length) {
            const failure = workflow.failedRows[0];
            throw new Error(`${failure.stage}: ${failure.message}`);
          }
        },
      });
      setResult(saved);
      // Only failed rows remain actionable, so retrying does not repeat successes.
      setChoices(originalDecisions.map((choice, index) => decisions[index] === "done" ? choice :
        saved.failures.some(row =>
          row.rowNumber === (rows[index].sourceLocation?.rowNumber ?? index + 2)
          && row.sheetName === rows[index].sourceLocation?.sheetName
        ) ? choice : "done"));
      refreshViews();
      const pending = originalDecisions.filter(choice => !choice).length;
      setNotice(`Processed ${saved.imported} new review rows; removed ${filteredReviews} positive or neutral reviews; linked ${saved.linked}; found ${saved.duplicates.length} tracked duplicates. AI preparation finished for ${saved.prepared} rows. Only AI-negative reviews appear in the Inbox. ${saved.failures.length} need retry${pending ? `; ${pending} uncertain matches need your decision` : ""}.`);
    } catch (error) {
      setNotice(mutationErrorMessage(error, "The selected actions could not be completed."));
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }

  return <section className="panel p-4 mb-4" aria-label="CSV import review">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Import CSV / XLSX complaints</h2>
        <p className="text-xs text-ink-soft mt-1">AI checks sentiment before a review appears in the Inbox. Only negative reviews are kept; positive and neutral results are removed. Uncertain historical matches pause for review.</p></div>
      {authLoaded && user ? <label className={`btn-primary text-sm cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
        {busy ? "Working…" : "Choose CSV / XLSX"}
        <input aria-label="Choose complaint CSV or XLSX" type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" disabled={busy}
          onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void readFile(file); }}/>
      </label> : <Link href="/sign-in" className="btn-quiet text-sm">Sign in to import</Link>}
    </div>
    <p className="text-xs text-ink-soft mt-2">Up to 5,000 rows and 10 MB, reviewed in safe batches. Runpod analyses sentiment; Grafilab completes classification, recommends a resolution and drafts a response. Keep this page open during processing. Approval, sending replies and closure remain manual.</p>
    <p className="text-xs text-ink-faint mt-2">Use a distinct source for each account when source IDs overlap. Missing dates and repeated text are not proof of a duplicate. Genuinely separate identical rows need distinct source IDs.</p>
    {notice && <p role="status" className="text-sm mt-3">{notice}</p>}
    {busy && progress && <div className="mt-3" aria-live="polite"><p className="text-sm">Record {progress.rowIndex} of {progress.total}{progress.sheetName ? ` · ${progress.sheetName} row ${progress.rowNumber}` : ""}: {progress.stage}</p><progress className="w-full" value={progress.rowIndex} max={progress.total}/></div>}
    {records.length > 0 && <div className="mt-4">
      <p className="text-sm mb-3">{choices.filter(choice => choice === "done").length} rows processed; {choices.filter(choice => !choice).length} uncertain matches awaiting a decision. Rows with errors can be retried below without creating another tracked case.</p>
      <div className="space-y-3 max-h-[32rem] overflow-y-auto">
        {records.map((record, index) => {
          const review = reviews[index];
          return <div key={index} className="subpanel p-3 text-sm">
            <div className="font-medium">{record.sourceLocation?.sheetName ? `${record.sourceLocation.sheetName} · ` : ""}Row {record.sourceLocation?.rowNumber ?? index + 2}: {record.customerName} — {record.subject}</div>
            <p className="text-xs text-ink-soft mt-1 whitespace-pre-wrap">{record.message}</p>
            <p className="text-xs text-ink-faint mt-1">{record.source} · {record.sourceId || "No source ID"} · {record.createdAt || "No received date"} · {record.customerEmail || "No email"}</p>
            {choices[index] === "done" && <p className="mt-2 text-ok">Processed — saved or linked cases are in the Inbox.</p>}
            {review.duplicate ? <p className="mt-2">Tracked duplicate — <a className="link" href={caseHref(review.existingCase!.id)} target="_blank" rel="noopener noreferrer">existing case {review.existingCase!.id}</a>. No new complaint; incomplete AI preparation may resume.</p>
              : <><p className="mt-2">{review.candidates.length ? `Uncertain historical match${review.candidates.length > 1 ? "es" : ""} (${review.candidates.length}). Review the case details before linking.` : "No potential matches found. Import as a separate complaint, or leave it out."}</p>
                {review.candidates.map(candidate => <div className="text-xs mt-2" key={candidate.id}>
                  <a className="link" href={caseHref(candidate.id)} target="_blank" rel="noopener noreferrer">Review case {candidate.id} (opens new tab)</a>
                  <span> · {candidate.customerName} · {candidate.createdAt} · {candidate.status} · {candidate.orderId || "No order"}</span>
                </div>)}
                <select aria-label={`Decision for CSV row ${index + 2}`} className="ui-input mt-2" disabled={busy || choices[index] === "done"} value={choices[index]}
                  onChange={event => setChoices(current => current.map((choice, i) => i === index ? event.target.value : choice))}>
                  <option value="">Choose how to handle this row</option>
                  <option value="create">Import as a separate complaint</option>
                  <option value="skip">Leave out — do not save</option>
                  {review.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>Confirm link to existing case {candidate.id}</option>)}
                  <option value="done" disabled>Processed</option>
                </select>
              </>}
          </div>;
        })}
      </div>
      <div className="flex gap-2 mt-4">
        <button className="btn-primary text-sm" disabled={busy || choices.some(choice => !choice) || choices.every(choice => choice === "done")} onClick={() => void runImport(records, reviews, choices)}>Run remaining actions / retry AI</button>
        <button className="btn-quiet text-sm" disabled={busy} onClick={() => { setRecords([]); setReviews([]); setChoices([]); }}>Close review</button>
      </div>
    </div>}
    {!!result?.duplicates.length && <details className="mt-3 text-sm"><summary>View tracked duplicates ({result.duplicates.length})</summary>
      {result.duplicates.map((row, index) => <p key={index}>{row.sheetName ? `${row.sheetName} · ` : ""}Row {row.rowNumber}: {row.customerName} — {row.subject} · <a className="link" href={caseHref(row.caseId)} target="_blank" rel="noopener noreferrer">Existing case {row.caseId}</a></p>)}
    </details>}
    {!!result?.failures.length && <ul className="mt-3 text-sm" role="alert">{result.failures.map((row, index) => <li key={index}>{row.sheetName ? `${row.sheetName} · ` : ""}Row {row.rowNumber}: {row.error} {row.caseId && <a className="link" href={caseHref(row.caseId)} target="_blank" rel="noopener noreferrer">Open case {row.caseId}</a>} You can retry failed actions or preview the file again.</li>)}</ul>}
  </section>;
}
