export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="statement-title absolute top-[19vh] left-[6vw] w-[85vw] font-display">Complaints get lost. Decisions become inconsistent.</h2>
      <div className="absolute top-[62vh] left-[6vw] right-[6vw] grid grid-cols-4 gap-[3.2vw]">
        <div className="border-t-[0.15vw] border-primary pt-[3vh]"><p className="copy">Reviews are scattered across messages and exports</p></div>
        <div className="border-t-[0.15vw] border-primary pt-[3vh]"><p className="copy">Customer and order context takes time to assemble</p></div>
        <div className="border-t-[0.15vw] border-accent pt-[3vh]"><p className="copy">Compensation decisions vary between staff</p></div>
        <div className="border-t-[0.15vw] border-accent pt-[3vh]"><p className="copy">Recurring problems are easy to miss</p></div>
      </div>
      <p className="page-number">02 / 20</p>
    </div>
  );
}
