import React, { useEffect, useRef, useState } from 'react';

export function TermsBox({ checked, onChange, disabled }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(false);
  useEffect(() => () => dialog.current?.close(), []);
  function open() {
    setDraft(checked);
    dialog.current.showModal();
  }
  function agree() {
    if (!draft) return;
    onChange(true);
    dialog.current.close();
  }
  return <div className="termsControl">
    <button type="button" className="outline" onClick={open} disabled={disabled}>{checked ? 'ToS agreed' : 'Agree to ToS'}</button>
    <dialog ref={dialog} className="termsDialog" aria-labelledby="termsTitle">
      <h2 id="termsTitle">ToS</h2>
      <div className="termsPlaceholder" aria-label="ToS placeholder"/>
      <label><input type="checkbox" checked={draft} onChange={event => setDraft(event.target.checked)}/> ToS</label>
      <div className="termsActions"><button type="button" className="outline" onClick={() => dialog.current.close()}>Cancel</button><button type="button" className="primary" disabled={!draft} onClick={agree}>Agree</button></div>
    </dialog>
  </div>;
}
