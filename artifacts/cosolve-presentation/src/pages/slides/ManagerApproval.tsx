export default function ManagerApproval() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[84vw] font-display">The manager makes the final decision.</h2>
      <div className="blue-surface absolute top-[42vh] left-[6vw] w-[40vw] h-[44vh] p-[3vw]">
        <svg aria-hidden="true" className="w-[11vw] h-[16vh] text-white line-icon mb-[3vh]" viewBox="0 0 75 65"><path d="M37 3 66 14v19c0 15-29 29-29 29S8 48 8 33V14zM23 32l10 10 21-22"/></svg>
        <p className="copy text-white!">Review the complaint, order context and policy compliance</p>
      </div>
      <div className="absolute top-[43vh] right-[6vw] w-[41vw] flex flex-col gap-[3vh]">
        <p className="copy">Adjust the proposed resolution before approving</p>
        <div className="rule"/>
        <p className="copy">Keep approved financial details protected from ordinary edits</p>
        <div className="rule"/>
        <p className="copy">Approval records a refund decision; it does not transfer money through a bank</p>
      </div>
      <p className="page-number">11 / 20</p>
    </div>
  );
}
