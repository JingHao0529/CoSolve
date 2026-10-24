export default function NegativeOnly() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="absolute inset-y-0 right-0 w-[36vw] bg-[#304cc0]"/>
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="statement-title absolute top-[19vh] left-[6vw] w-[87vw] font-display">Only negative reviews reach the Inbox.</h2>
      <div className="absolute top-[56vh] left-[6vw] w-[49vw] flex flex-col gap-[5vh]">
        <p className="copy">Runpod sentiment determines inclusion</p>
        <p className="copy">Unknown sentiment is checked before inclusion</p>
      </div>
      <div className="absolute top-[56vh] left-[69vw] right-[5vw] flex flex-col gap-[4vh]">
        <p className="copy text-white!">Positive and Neutral results are filtered out</p>
        <p className="copy text-white!">AI failures are reported—not silently treated as Negative</p>
      </div>
      <p className="page-number text-white/75!">06 / 20</p>
    </div>
  );
}
