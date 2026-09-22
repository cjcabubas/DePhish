import React, { useEffect, useRef, useState } from 'react';
import { ScrollText, ShieldCheck, X } from 'lucide-react';

import { SCAN_TERMS } from '../data/scanTerms.js';

export function TermsBox({ checked, onChange, disabled }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const checkbox = useRef(null);
  const [draft, setDraft] = useState(false);
  useEffect(() => () => dialog.current?.close(), []);
  function open() {
    setDraft(Boolean(checked));
    dialog.current.showModal();
    checkbox.current?.focus();
  }
  function close() {
    dialog.current.close();
  }
  function agree() {
    if (!draft) return;
    onChange(SCAN_TERMS.version);
    close();
  }
  function handleDialogClick(event) {
    if (event.target === dialog.current) close();
  }
  return <div className="termsControl">
    <button type="button" ref={trigger} className="outline" onClick={open} disabled={disabled} aria-haspopup="dialog">
      <ShieldCheck size={15} aria-hidden="true"/> {checked ? 'Scan consent given' : 'Review scan consent'}
    </button>
    <dialog ref={dialog} className="termsDialog" aria-labelledby="tosTitle" aria-describedby="tosBody" onClick={handleDialogClick} onCancel={() => dialog.current.close()}>
      <header className="tosHeader">
        <span className="tosBadge"><ScrollText size={16} aria-hidden="true"/></span>
        <h2 id="tosTitle">Scan Consent and Data Processing Terms</h2>
        <button type="button" className="close" onClick={close} aria-label="Close"><X size={16}/></button>
      </header>
      <div className="tosBody" id="tosBody">{SCAN_TERMS.text.split(/\n\s*\n/).map((block, index) => /^\d+\. /.test(block)
        ? <h3 key={index}>{block}</h3> : <p key={index}>{block}</p>)}</div>
      <footer className="tosFoot">
        <label className="tosCheck">
          <input ref={checkbox} type="checkbox" checked={draft} onChange={event => setDraft(event.target.checked)}/>
          <span>I have read and agree to the <b>Scan Consent and Data Processing Terms (version {SCAN_TERMS.version})</b>.</span>
        </label>
        <div className="termsActions">
          <button type="button" className="outline" onClick={close}>Cancel</button>
          <button type="button" className="primary" disabled={!draft} onClick={agree}>Agree</button>
        </div>
      </footer>
    </dialog>
  {checked && <button type="button" className="sample" disabled={disabled} onClick={() => onChange(false)}>Clear consent for future scans</button>}
  </div>;
}
