export default function CaseClosure() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[83vw] font-display">Close the case. Keep the follow-up.</h2>
      <div className="absolute top-[44vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-x-[6.4vw] gap-y-[6vh]">
        <div className="border-t-[0.12vw] border-primary pt-[3vh]"><p className="copy">Record the final outcome and closure notes</p></div>
        <div className="border-t-[0.12vw] border-primary pt-[3vh]"><p className="copy">Retain the case activity timeline</p></div>
        <div className="border-t-[0.12vw] border-accent pt-[3vh]"><p className="copy">Keep follow-up notes editable while approved financial details stay locked</p></div>
        <div className="border-t-[0.12vw] border-accent pt-[3vh]"><p className="copy">Bulk-delete Closed cases only after explicit confirmation</p></div>
      </div>
      <p className="page-number">13 / 20</p>
    </div>
  );
}
