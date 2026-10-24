import type { ReactNode } from "react";

export type ApprovedCompensation = {
  type: string;
  amount: number;
};

export type CompensationAdjustmentSummary = {
  type: string;
  amount: number;
  amountDelta: number;
  status: string;
};

export function deriveApprovedCompensationDisplay(
  approvedCompensation: ApprovedCompensation,
  adjustments: CompensationAdjustmentSummary[],
) {
  const approvedAdjustments = adjustments.filter((adjustment) => adjustment.status === "Approved");
  const latestApprovedAdjustment = approvedAdjustments[0];

  return {
    finalCompensation: latestApprovedAdjustment
      ? { type: latestApprovedAdjustment.type, amount: latestApprovedAdjustment.amount }
      : approvedCompensation,
    netAdjustment: approvedAdjustments.length
      ? approvedAdjustments.reduce((total, adjustment) => total + adjustment.amountDelta, 0)
      : null,
  };
}

export function ApprovedCompensationSummary({
  approvedCompensation,
  finalCompensation,
  netAdjustment,
  resolutionNote,
  onSave,
  children,
}: {
  approvedCompensation: ApprovedCompensation;
  finalCompensation: ApprovedCompensation;
  netAdjustment: number | null;
  resolutionNote: string;
  onSave: (data: Record<string, unknown>) => void;
  children?: ReactNode;
}) {
  const money = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  return (
    <section className="panel decision-panel p-5" data-testid="approved-compensation-panel">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">Resolution guidance</div>
          <h2 className="font-semibold mt-1">Resolution offer</h2>
        </div>
        <button
          className="btn-quiet p-2"
          type="button"
          disabled
          aria-label="Generate recommendation"
          data-testid="button-generate-recommendation"
        >
          Refresh
        </button>
      </div>
      <p className="text-sm mt-4 leading-6">{finalCompensation.type}</p>
      <div className="mt-4 rounded-lg border border-ok/25 bg-ok/[.06] p-3" role="status" data-testid="approved-compensation">
        <div className="eyebrow">Final approved compensation</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="font-medium" data-testid="approved-remedy">{finalCompensation.type}</span>
          <span className="mono font-semibold" data-testid="approved-amount">{money(finalCompensation.amount)}</span>
        </div>
        <div className="text-xs text-ink-faint mt-2" data-testid="approved-original-summary">
          Original approval: {approvedCompensation.type} · {money(approvedCompensation.amount)}
        </div>
        {netAdjustment !== null && (
          <div className="text-xs text-ink-faint mt-1" data-testid="approved-net-adjustment">
            Net reviewed adjustments: {netAdjustment >= 0 ? "+" : "−"}{money(Math.abs(netAdjustment))}
          </div>
        )}
      </div>
      <label className="block mt-3 text-xs text-ink-soft">
        Resolution note (editable)
        <textarea
          className="ui-input mt-1 min-h-20 resize-y"
          data-testid="input-resolution-note"
          defaultValue={resolutionNote}
          onBlur={(event) => event.currentTarget.value !== resolutionNote && onSave({ resolutionNote: event.currentTarget.value })}
        />
      </label>
      <button
        className="btn-quiet mt-3 w-full text-xs"
        type="button"
        disabled
        data-testid="button-refresh-recommendation"
      >
        Approved compensation is locked
      </button>
      {children}
    </section>
  );
}

export function CustomerResponsePanel({
  draft,
  onDraftChange,
  onDraftBlur,
  onDraftResponse,
  onSendEmail,
  onCopyResponse,
  isDrafting,
  isSaving,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onDraftBlur: (nextTarget: EventTarget | null) => void;
  onDraftResponse: () => void;
  onSendEmail: () => void;
  onCopyResponse: () => void;
  isDrafting: boolean;
  isSaving: boolean;
}) {
  return (
    <section className="panel p-5" data-testid="customer-response-panel">
      <div className="flex justify-between items-center">
        <div>
          <div className="eyebrow">Customer communication</div>
          <h2 className="font-semibold mt-1">Response draft</h2>
        </div>
        <button
          className="btn-quiet text-xs inline-flex items-center gap-2"
          type="button"
          disabled={isDrafting}
          data-testid="button-draft-response"
          title="Generate a customer response with Grafilab"
          onClick={onDraftResponse}
        >
          {isDrafting ? "Drafting…" : "Draft response"}
        </button>
      </div>
      <textarea
        className="ui-input mt-4 min-h-40 leading-6 text-sm resize-y"
        data-testid="input-customer-response"
        placeholder="Generate a customer-ready response or write one here."
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={(event) => onDraftBlur(event.relatedTarget)}
      />
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button className="btn-quiet text-xs" type="button" disabled={!draft} onClick={onCopyResponse}>
          Copy response
        </button>
        <button
          className="btn-quiet text-xs"
          type="button"
          disabled={!draft || isSaving}
          data-testid="button-send-email"
          onClick={onSendEmail}
        >
          Send email
        </button>
      </div>
    </section>
  );
}

export function ApprovedCaseStatusPanel({
  status,
  onSave,
  error,
  isSaving,
}: {
  status: string;
  onSave: (data: Record<string, unknown>) => void;
  error: string;
  isSaving: boolean;
}) {
  return (
    <section className="panel p-5" data-testid="approved-case-status-panel">
      <h2 className="font-semibold mb-3">Next action</h2>
      <label className="block text-xs text-ink-soft mb-2" htmlFor="approved-case-status">
        Case status
      </label>
      <select
        id="approved-case-status"
        className="ui-input"
        data-testid="select-case-status"
        value={status}
        onChange={(event) => onSave({ status: event.target.value })}
      >
        <option value={status}>{status}</option>
        {status === "Resolved" && <option value="Investigating">Investigating</option>}
        {status === "Investigating" && <option value="Resolved">Resolved</option>}
        {["Resolved", "Investigating"].includes(status) && <option value="Closed">Closed</option>}
      </select>
      <div className="mt-3 rounded bg-ok/[.06] p-3 text-xs text-ink-soft">
        Reopening for investigation keeps approved compensation unchanged. Monetary changes require a separately reviewed adjustment.
      </div>
      {error && <div className="mt-3 rounded-md border border-danger/30 bg-danger-soft p-3 text-xs text-danger" role="alert" data-testid="status-update-error">{error}</div>}
      <div className="mt-3 text-xs text-ink-faint">
        {isSaving ? "Saving case update…" : error ? "Change was not saved. Review the message above." : "Every status change is recorded in the audit log."}
      </div>
    </section>
  );
}
