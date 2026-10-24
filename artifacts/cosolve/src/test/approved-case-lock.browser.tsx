import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ApprovedCaseStatusPanel,
  ApprovedCompensationSummary,
  CustomerResponsePanel,
  deriveApprovedCompensationDisplay,
} from "@/components/approved-case-controls";
import { mutationErrorMessage } from "@/lib/mutation-error-message";

const approvedCompensation = { type: "Partial refund", amount: 40 };
const adjustments = [
  { type: "Store voucher", amount: 25, amountDelta: -15, status: "Approved" },
  { type: "Full refund", amount: 80, amountDelta: 40, status: "Pending review" },
  { type: "Full refund", amount: 100, amountDelta: 60, status: "Rejected" },
];
const approvedDisplay = deriveApprovedCompensationDisplay(approvedCompensation, adjustments);
const staleChangeExplanation =
  "This approved compensation is final. Changing its amount or remedy requires a separately reviewed adjustment.";

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const pendingAndRejectedDisplay = deriveApprovedCompensationDisplay(
  approvedCompensation,
  adjustments.filter((adjustment) => adjustment.status !== "Approved"),
);
check(
  pendingAndRejectedDisplay.finalCompensation.amount === 40 && pendingAndRejectedDisplay.netAdjustment === null,
  "Pending or rejected corrections changed the effective approved compensation.",
);
check(
  approvedDisplay.finalCompensation.type === "Store voucher" &&
    approvedDisplay.finalCompensation.amount === 25 &&
    approvedDisplay.netAdjustment === -15,
  "The approved correction did not produce the effective amount and signed delta.",
);

function TestCaseScreen() {
  const [status, setStatus] = useState("Resolved");
  const [note, setNote] = useState("Initial resolution note");
  const [draft, setDraft] = useState("");
  const [savedDraft, setSavedDraft] = useState("");
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<Record<string, unknown> | null>(null);
  const [payoutCount] = useState(1);

  const save = (data: Record<string, unknown>) => {
    if ("recommendedAmount" in data || "recommendation" in data) {
      setError(mutationErrorMessage({ data: { error: staleChangeExplanation } }, "Update failed."));
      return;
    }
    if (typeof data.resolutionNote === "string") setNote(data.resolutionNote);
    if (typeof data.status === "string") setStatus(data.status);
    setLastSaved(data);
    setError("");
  };

  return (
    <main>
      <ApprovedCompensationSummary
        approvedCompensation={approvedCompensation}
        finalCompensation={approvedDisplay.finalCompensation}
        netAdjustment={approvedDisplay.netAdjustment}
        resolutionNote={note}
        onSave={save}
      />
      <CustomerResponsePanel
        draft={draft}
        onDraftChange={setDraft}
        onDraftBlur={(nextTarget) => {
          if ((nextTarget as HTMLElement | null)?.dataset?.testid === "button-send-email") return;
          if (draft !== savedDraft) {
            setSavedDraft(draft);
            save({ responseDraft: draft });
          }
        }}
        onDraftResponse={() => setDraft("We have arranged your partial refund.")}
        onSendEmail={() => save({ emailComposerOpened: true })}
        onCopyResponse={() => undefined}
        isDrafting={false}
        isSaving={false}
      />
      <ApprovedCaseStatusPanel status={status} onSave={save} error={error} isSaving={false} />
      <button
        type="button"
        data-testid="simulate-stale-update"
        onClick={() => save({ recommendedAmount: 80 })}
      >
        Simulate stale screen submission
      </button>
      <output data-testid="last-saved">{JSON.stringify(lastSaved)}</output>
      <output data-testid="payout-count">{payoutCount}</output>
      <output data-testid="saved-response-draft">{savedDraft}</output>
    </main>
  );
}

async function runBrowserChecks() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("browser-test-root")!);
  try {
    await act(async () => root.render(<TestCaseScreen />));

    const get = <T extends HTMLElement>(selector: string) => {
      const element = document.querySelector<T>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      return element;
    };
    check(get('[data-testid="approved-remedy"]').textContent === "Store voucher", "Corrected remedy is not shown.");
    check(get('[data-testid="approved-amount"]').textContent === "$25.00", "Effective approved amount is not shown.");
    check(
      get('[data-testid="approved-original-summary"]').textContent?.includes("Partial refund · $40.00"),
      "Original approved payout is not shown unchanged.",
    );
    check(
      get('[data-testid="approved-net-adjustment"]').textContent?.includes("−$15.00"),
      "Signed reviewed adjustment delta is not shown.",
    );
    check((get('[data-testid="button-generate-recommendation"]') as HTMLButtonElement).disabled, "Recommendation refresh is available.");
    check((get('[data-testid="button-refresh-recommendation"]') as HTMLButtonElement).disabled, "Recommendation refresh action is available.");
    check(
      !get('[data-testid="approved-compensation-panel"]').querySelector("input, select"),
      "Direct approved remedy or amount editing is still available.",
    );
    check(!document.querySelector('[data-testid="input-recommended-amount"]'), "Approved amount editor is still rendered.");
    check(!Array.from(document.querySelectorAll("button")).some((button) => /request approval|resolve case|approve & resolve/i.test(button.textContent || "")), "Approval or reopening controls are still rendered.");

    const statusSelect = get('[data-testid="select-case-status"]') as HTMLSelectElement;
    check(statusSelect.options.length === 3, "Approved resolved cases should offer investigation and closure without unlocking compensation.");
    check(statusSelect.options[1]?.value === "Investigating", "Reopening the resolved case for investigation is unavailable.");
    check(statusSelect.options[2]?.value === "Closed", "Closing the resolved case is unavailable.");
    await act(async () => {
      statusSelect.value = "Investigating";
      statusSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    check(get('[data-testid="last-saved"]').textContent?.includes('"status":"Investigating"'), "The investigation status was not saved.");
    check(statusSelect.value === "Investigating", "The case did not enter its investigating state.");
    check(statusSelect.options.length === 3, "An investigating approved case should allow resolution or closure.");
    check(statusSelect.options[1]?.value === "Resolved", "The reopened case cannot be resolved after investigation.");
    await act(async () => {
      statusSelect.value = "Closed";
      statusSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    check(get('[data-testid="last-saved"]').textContent?.includes('"status":"Closed'), "The supported next-step status was not saved.");
    check(statusSelect.value === "Closed", "The case did not enter its closed state.");
    check(statusSelect.options.length === 1, "A closed approved case still offers a status change.");
    check(
      !Array.from(document.querySelectorAll("button")).some((button) => /request approval|resolve case|approve & resolve/i.test(button.textContent || "")),
      "Approval or reopening controls are available after closure.",
    );

    const note = get('[data-testid="input-resolution-note"]') as HTMLTextAreaElement;
    await act(async () => {
      note.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(note, "Reviewed by the support team");
      note.dispatchEvent(new Event("input", { bubbles: true }));
      note.blur();
    });
    check(get('[data-testid="last-saved"]').textContent?.includes('"resolutionNote":"Reviewed by the support team"'), "Resolution note edit was not saved.");

    const response = get('[data-testid="input-customer-response"]') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(response, "We have arranged your partial refund.");
      response.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      response.focus();
      response.blur();
    });
    check(
      get('[data-testid="saved-response-draft"]').textContent === "We have arranged your partial refund.",
      "Customer response could not be updated after closure.",
    );
    await act(async () => get('[data-testid="button-send-email"]').click());
    check(get('[data-testid="last-saved"]').textContent?.includes('"emailComposerOpened":true'), "Email composer was not requested.");
    check(!get('[data-testid="last-saved"]').textContent?.includes("customerResponseSent"), "Opening an email must not record a delivery.");

    await act(async () => get('[data-testid="simulate-stale-update"]').click());
    check(get('[data-testid="status-update-error"]').textContent === staleChangeExplanation, "The useful API rejection explanation is not shown.");
    check(get('[data-testid="payout-count"]').textContent === "1", "An approved payout was duplicated by a follow-up update.");
    document.getElementById("browser-test-result")!.textContent = "PASS: approved compensation case-screen browser regression";
  } catch (error) {
    document.getElementById("browser-test-result")!.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    await act(async () => root.unmount());
  }
}

void runBrowserChecks();
