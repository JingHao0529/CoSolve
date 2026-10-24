import { useEffect, useState } from "react";
import { Mail, Paperclip } from "lucide-react";
import { useGetEmailSender, getGetEmailSenderQueryKey, useSendComplaintEmail } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mutationErrorMessage } from "@/lib/mutation-error-message";

export function EmailResponseDialog({
  open, onOpenChange, caseId, initialRecipient, initialMessage, savedMessage, subject, history, onSubmitted,
}: {
  open: boolean; onOpenChange: (value: boolean) => void; caseId: string; initialRecipient: string;
  initialMessage: string; savedMessage: string; subject: string; history: {action: string; details: string}[];
  onSubmitted: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const sender = useGetEmailSender({ query: { queryKey: getGetEmailSenderQueryKey(), enabled: open, retry: false, staleTime: 0 } });
  const send = useSendComplaintEmail();
  const pending = history.find(event => event.action === "Customer email sending");
  let pendingRecipient = "";
  if (pending) { try { pendingRecipient = JSON.parse(pending.details).recipient || ""; } catch { /* Legacy history need not contain email metadata. */ } }
  useEffect(() => {
    if (open) {
      setRecipient(pendingRecipient || initialRecipient);
      setMessage(pending ? savedMessage : initialMessage);
      send.reset();
    }
  }, [open, caseId]);
  useEffect(() => {
    if (open && pending) { setRecipient(pendingRecipient); setMessage(savedMessage); }
  }, [open, Boolean(pending), pendingRecipient, savedMessage]);
  return (
    <Dialog open={open} onOpenChange={value => { if (!send.isPending) onOpenChange(value); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail size={18}/>Email customer response</DialogTitle>
          <DialogDescription>Review the recipient and message. The response is included in the email body and attached as a UTF-8 text file. It is not sent until you confirm below.</DialogDescription>
        </DialogHeader>
        <div className="text-xs text-ink-soft">
          {sender.isLoading ? "Checking Gmail sender…" : sender.data ? <>From: <strong>{sender.data.emailAddress}</strong></> : "Gmail sender unavailable"}
        </div>
        {sender.error && <div role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-700">
          {mutationErrorMessage(sender.error, "The running app cannot access Gmail. Check the project's Gmail connection. The sender check does not send email.")}
          <button type="button" className="underline block mt-2" onClick={() => void sender.refetch()}>Check connection again</button>
        </div>}
        <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          if (!sender.data || sender.isError || sender.isFetching || send.isPending || send.isSuccess) return;
          send.mutate({id:caseId, data:{recipient:recipient.trim(),message}}, {
            onSettled: onSubmitted,
          });
        }}>
          <label className="block text-sm">To
            <input type="email" required maxLength={254} autoComplete="email" className="ui-input mt-1"
              data-testid="input-email-recipient" value={recipient} disabled={send.isPending || send.isSuccess || Boolean(pending)}
              onChange={event => setRecipient(event.target.value)} placeholder="customer@example.com"/>
          </label>
          {!initialRecipient && !pending && <p className="text-xs text-ink-soft">No email address was included with this review. Enter an address verified with the customer; CoSolve will not guess one.</p>}
          <p className="text-xs text-ink-soft">Subject: CoSolve response: {Array.from(subject).slice(0,120).join("")}</p>
          <label className="block text-sm">Message
            <textarea className="ui-input mt-1 min-h-44" required maxLength={20000} data-testid="input-email-message"
              value={message} disabled={send.isPending || send.isSuccess || Boolean(pending)} onChange={event => setMessage(event.target.value)}/>
          </label>
          <div className="flex items-center gap-2 text-xs text-ink-soft"><Paperclip size={14}/>CoSolve-{caseId.replace(/[^a-zA-Z0-9_-]/g,"")}-response.txt</div>
          {pending && <p role="status" className="text-sm text-amber-700">An earlier send is unconfirmed. This checks Gmail Sent for that message and does not send it again.</p>}
          {send.error && <p role="alert" className="text-sm text-red-700">{mutationErrorMessage(send.error, "Gmail has not confirmed this email. Check its status before trying a different message.")}</p>}
          {send.data && <p role="status" className="text-sm text-green-700" data-testid="email-send-success">
            {send.data.replayed ? "Gmail already accepted this email; no duplicate was sent." : "Gmail accepted the email with your response attached."} Delivery or reading is not yet confirmed.
          </p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-quiet" disabled={send.isPending} onClick={() => onOpenChange(false)}>{send.isSuccess ? "Done" : "Cancel"}</button>
            {!send.isSuccess && <button type="submit" className="btn-primary" data-testid="button-confirm-send-email"
              disabled={send.isPending || !sender.data || sender.isError || sender.isFetching || !recipient.trim() || !message.trim()}>
              {send.isPending ? (pending ? "Checking…" : "Sending…") : pending ? "Check Gmail status" : "Send email with attachment"}
            </button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
