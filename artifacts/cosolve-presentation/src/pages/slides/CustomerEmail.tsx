export default function CustomerEmail() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[85vw] font-display">From draft to customer-ready email.</h2>
      <div className="absolute top-[43vh] left-[6vw] w-[38vw] flex flex-col gap-[3vh]">
        <p className="copy">Generate a response with Grafilab</p>
        <p className="copy">Review and edit the message before sending</p>
      </div>
      <svg aria-hidden="true" className="absolute left-[8vw] top-[66vh] w-[33vw] h-[20vh]" viewBox="0 0 270 135">
        <rect x="4" y="6" width="238" height="116" rx="8" fill="#294eae"/>
        <path d="m8 12 115 72L239 12M8 117l80-60m149 60-80-60" fill="none" stroke="#b8cdff" strokeWidth="2"/>
        <rect x="198" y="64" width="66" height="64" rx="7" fill="#7c6bf0"/>
        <path d="M229 78v32a9 9 0 0 1-18 0V87a6 6 0 0 1 12 0v22" fill="none" stroke="white" strokeWidth="2"/>
      </svg>
      <div className="absolute top-[43vh] left-[50vw] right-[6vw] flex flex-col gap-[4vh]">
        <p className="copy">Send through connected Gmail with the message in the body and a text attachment</p>
        <p className="copy">Require a valid customer email address</p>
        <p className="copy blue-text">Record send status: accepted does not mean delivered</p>
      </div>
      <p className="page-number">12 / 20</p>
    </div>
  );
}
