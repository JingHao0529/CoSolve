import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useDeleteClosedComplaints } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mutationErrorMessage } from "@/lib/mutation-error-message";

export function DeleteClosedCases({ closedCount }: { closedCount: number }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const deletion = useDeleteClosedComplaints();
  const close = () => { if (!deletion.isPending) { setOpen(false); setConfirmation(""); deletion.reset(); } };
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 my-4">
      {message && <p role="status" className="text-xs text-ink-soft">{message}</p>}
      <button type="button" className="btn-quiet text-xs inline-flex items-center gap-2" disabled={!closedCount}
        onClick={() => { setMessage(""); setOpen(true); }} data-testid="button-delete-closed">
        <Trash2 size={14} />Delete closed cases ({closedCount})
      </button>
      <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete all closed reviews and complaints?</DialogTitle>
            <DialogDescription>This permanently deletes every case whose status is Closed, including its review or complaint text, response drafts, case audit history, compensation records, adjustments and import tracking. Historical refund totals will change. Customer profiles and orders stay. Open, pending and Resolved cases are not deleted. This cannot be undone in the app.</DialogDescription>
          </DialogHeader>
          <label className="block text-sm mt-2">Type <strong>DELETE CLOSED CASES</strong> to confirm
            <input className="ui-input mt-2" value={confirmation} onChange={event => setConfirmation(event.target.value)}
              disabled={deletion.isPending} autoComplete="off" data-testid="input-delete-confirmation" />
          </label>
          {deletion.error && <p role="alert" className="text-sm text-red-600">{mutationErrorMessage(deletion.error, "Closed cases could not be deleted. Nothing has been removed unless the server confirmed success.")}</p>}
          <div className="flex justify-end gap-3 mt-3">
            <button type="button" className="btn-quiet" disabled={deletion.isPending} onClick={close}>Cancel</button>
            <button type="button" className="btn-primary !bg-red-700 !text-white"
              disabled={confirmation !== "DELETE CLOSED CASES" || deletion.isPending}
              data-testid="button-confirm-delete-closed"
              onClick={() => deletion.mutate({ data: { confirmation: "DELETE CLOSED CASES" } }, { onSuccess: result => {
                setOpen(false); setConfirmation("");
                setMessage(`${result.deletedCount} closed ${result.deletedCount === 1 ? "case" : "cases"} permanently deleted.`);
                void client.invalidateQueries();
              } })}>{deletion.isPending ? "Deleting…" : "Permanently delete closed cases"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
