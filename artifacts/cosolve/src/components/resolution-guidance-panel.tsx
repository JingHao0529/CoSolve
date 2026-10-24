import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { mutationErrorMessage } from "../lib/mutation-error-message";

export type ReviewedOffer = { recommendation: string; recommendedAmount: number; resolutionNote: string };

export function ResolutionGuidancePanel({
  offer, amount, note, guidance, canEdit, final, isRefreshing, isSaving, isApproving,
  onRefresh, onSave, onApprove,
}: {
  offer: string; amount: number; note: string; guidance: string; canEdit: boolean; final: boolean;
  isRefreshing: boolean; isSaving: boolean; isApproving: boolean;
  onRefresh: () => Promise<unknown>;
  onSave: (draft: ReviewedOffer) => Promise<unknown>;
  onApprove: (draft: ReviewedOffer, expected: { offer: string; amount: number }) => Promise<unknown>;
}) {
  const [draftOffer, setDraftOffer] = useState(offer);
  const [draftAmount, setDraftAmount] = useState(String(amount));
  const [draftNote, setDraftNote] = useState(note);
  const [dirty, setDirty] = useState(false);
  const [reviewedBaseline, setReviewedBaseline] = useState({ offer, amount });
  const [error, setError] = useState("");
  const busy = isRefreshing || isSaving || isApproving;
  useEffect(() => {
    if (!dirty) {
      setDraftOffer(offer); setDraftAmount(String(amount)); setDraftNote(note);
      setReviewedBaseline({ offer, amount });
    }
  }, [offer, amount, note, dirty]);
  const valid = draftOffer.trim().length > 0 && draftAmount.trim() !== "" &&
    Number.isFinite(Number(draftAmount)) && Number(draftAmount) >= 0;
  const locked = !canEdit || final || busy;
  const perform = async (action: () => Promise<unknown>) => {
    setError("");
    try { await action(); setDirty(false); } catch (failure) {
      setError(mutationErrorMessage(failure, "The resolution was not saved. Please try again."));
    }
  };
  const draft = (): ReviewedOffer => ({
    recommendation: draftOffer.trim(), recommendedAmount: Number(draftAmount), resolutionNote: draftNote,
  });
  return <section className="panel decision-panel p-5">
    <div className="flex items-center justify-between gap-3">
      <div><div className="eyebrow">Resolution guidance</div><h2 className="font-semibold mt-1">Resolution offer</h2></div>
      <button className="btn-quiet p-2" aria-label="Generate recommendation" title="Generate fresh AI guidance"
        disabled={locked || dirty} onClick={() => void perform(onRefresh)}>
        <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""}/>
      </button>
    </div>
    {guidance ? <div className="mt-4 p-3 bg-sunk rounded border border-line text-xs text-ink-soft">
      <div className="text-ink mb-1">AI guidance</div>{guidance}
    </div> : <p className="text-sm text-ink-soft mt-4">Refresh to ask Grafilab for policy-aware resolution guidance.</p>}
    <label className="block mt-4 text-xs text-ink-soft">Resolution offer
      <textarea aria-label="Resolution offer" maxLength={500} className="ui-input mt-1 min-h-20" value={draftOffer}
        disabled={locked} onChange={e => { setDraftOffer(e.target.value); setDirty(true); }}/>
    </label>
    <label className="block mt-3 text-xs text-ink-soft">Recommended amount
      <input aria-label="Recommended amount" className="ui-input mt-1 mono" type="number" min="0" step="0.01"
        value={draftAmount} disabled={locked} onChange={e => { setDraftAmount(e.target.value); setDirty(true); }}
        data-testid="input-recommended-amount"/>
    </label>
    <label className="block mt-3 text-xs text-ink-soft">Resolution note
      <textarea aria-label="Resolution note" maxLength={5000} className="ui-input mt-1 min-h-20" value={draftNote}
        disabled={locked} onChange={e => { setDraftNote(e.target.value); setDirty(true); }}/>
    </label>
    <button className="btn-quiet mt-3 w-full text-xs" disabled={locked || dirty} onClick={() => void perform(onRefresh)}>
      {isRefreshing ? "Generating AI guidance…" : "Refresh AI guidance"}
    </button>
    {dirty && <div className="mt-2 text-xs text-ink-soft">Unsaved edits. Save or approve them, or <button className="link"
      disabled={busy} onClick={() => { setDirty(false); setError(""); }}>discard edits</button> before refreshing AI.</div>}
    {canEdit && !final && <div className="grid grid-cols-2 gap-2 mt-3">
      <button className="btn-quiet text-xs" disabled={busy || !dirty || !valid}
        onClick={() => void perform(() => onSave(draft()))}>{isSaving ? "Saving…" : "Save changes"}</button>
      <button className="btn-primary text-xs inline-flex items-center justify-center gap-1" disabled={busy || !valid}
        onClick={() => void perform(() => onApprove(draft(), reviewedBaseline))}><Check size={14}/>{isApproving ? "Approving…" : "Approve resolution"}</button>
    </div>}
    <p className="text-xs text-ink-faint mt-3">Approval saves the reviewed offer and records the final outcome. It does not send a message or transfer money automatically.</p>
    {error && <p role="alert" className="text-xs text-danger mt-3">{error}</p>}
  </section>;
}
