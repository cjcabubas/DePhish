import React, { useEffect, useRef, useState } from 'react';
import { ScrollText, ShieldCheck, X } from 'lucide-react';

const TOS_TEXT = `DePhish Terms of Service

This is placeholder text. The final Terms of Service will be added before release. Nothing in this document is legally binding.

1. Purpose

DePhish is an educational phishing-detection tool. A scan is evidence you can use, not a final verdict: phishing content can change quickly, so always treat the result as guidance rather than certainty.

2. Acceptable use

You may use DePhish for lawful, educational purposes. Do not attempt to overload the service, automate scans to the point of abuse, or scan content you are not permitted to process.

3. What we do with collected content

Content you scan is processed by the service and may be stored briefly to produce a report and to improve detection quality. Do not paste secrets. The service is a school project, not a replacement for professional security controls.

4. No guarantee

The service is provided \u201cas is\u201d. Detection results can be wrong, and the project team accepts no liability for decisions you make based on a scan. When in doubt, verify messages with the sender or the official app before acting.

5. Contact

Questions about these terms can be sent to the project team. The final document will include the real contact details, a privacy notice, and the policy for deleting stored scans.

6. Changes

We may update these placeholder terms as the project evolves. The version you agree to when you run a scan is the one that applies to that scan.`;

export function TermsBox({ checked, onChange, disabled }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const checkbox = useRef(null);
  const [draft, setDraft] = useState(false);
  useEffect(() => () => dialog.current?.close(), []);
  function open() {
    setDraft(checked);
    dialog.current.showModal();
    checkbox.current?.focus();
  }
  function close() {
    dialog.current.close();
  }
  function agree() {
    if (!draft) return;
    onChange(true);
    close();
  }
  function handleDialogClick(event) {
    if (event.target === dialog.current) close();
  }
  return <div className="termsControl">
    <button type="button" ref={trigger} className="outline" onClick={open} disabled={disabled} aria-haspopup="dialog">
      <ShieldCheck size={15} aria-hidden="true"/> {checked ? 'ToS agreed' : 'Agree to ToS'}
    </button>
    <dialog ref={dialog} className="termsDialog" aria-labelledby="tosTitle" aria-describedby="tosBody" onClick={handleDialogClick} onCancel={() => dialog.current.close()}>
      <header className="tosHeader">
        <span className="tosBadge"><ScrollText size={16} aria-hidden="true"/></span>
        <h2 id="tosTitle">Terms of Service</h2>
        <button type="button" className="close" onClick={close} aria-label="Close"><X size={16}/></button>
      </header>
      <div className="tosBody" id="tosBody">{TOS_TEXT.split(/\n\s*\n/).map((block, index) => <p key={index}>{block.split('\n').join(' ')}</p>)}</div>
      <footer className="tosFoot">
        <label className="tosCheck">
          <input ref={checkbox} type="checkbox" checked={draft} onChange={event => setDraft(event.target.checked)}/>
          <span>I have read and agree to the <b>Terms of Service</b>.</span>
        </label>
        <div className="termsActions">
          <button type="button" className="outline" onClick={close}>Cancel</button>
          <button type="button" className="primary" disabled={!draft} onClick={agree}>Agree</button>
        </div>
      </footer>
    </dialog>
  </div>;
}