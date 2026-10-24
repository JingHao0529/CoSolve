export default function FileImport() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="absolute inset-y-0 left-0 w-[44vw] bg-[#25499f]"/>
      <div className="brand"><span className="brand-mark bg-white!"/><span>CoSolve</span></div>
      <h2 className="absolute top-[23vh] left-[6vw] w-[33vw] text-[5.1vw] leading-[1.12] font-extrabold font-display">Drop in a file. Start the workflow.</h2>
      <svg aria-hidden="true" viewBox="0 0 100 80" className="absolute left-[9vw] top-[60vh] w-[22vw] h-[22vh] text-white/65 line-icon">
        <path d="M18 4h36l18 18v52H18zM54 4v20h18M30 38h30M30 49h30M30 60h18"/>
        <path d="M7 20H1v56h52"/>
      </svg>
      <div className="absolute left-[49vw] right-[6vw] top-[21vh] flex flex-col gap-[2.8vh]">
        <p className="copy">Import CSV and XLSX review exports</p>
        <div className="rule"/>
        <p className="copy">Read populated Excel worksheets</p>
        <div className="rule"/>
        <p className="copy">Automatically prepare unambiguous rows with AI</p>
        <div className="rule"/>
        <p className="copy">Detect tracked duplicates; review uncertain historical matches</p>
        <div className="rule"/>
        <p className="copy">Current intake is file-based—not live WhatsApp or Google review sync</p>
      </div>
      <p className="page-number">05 / 20</p>
    </div>
  );
}
