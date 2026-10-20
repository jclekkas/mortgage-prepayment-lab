import { useEffect, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { href } from '../app/router';

/** Shared confirmation: clearing local storage alone does not reset an open workspace. */
export function ResetWorkspace() {
  const { state, resetWorkspace } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) { dialog.current?.showModal(); cancel.current?.focus(); }
    else dialog.current?.close();
  }, [open]);
  const reset = async () => {
    setBusy(true); setError('');
    try { await resetWorkspace(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return <>
    <button type="button" onClick={() => { setError(''); setOpen(true); }} disabled={state.storage.status === 'loading'}>Clear workspace and start over</button>
    <dialog ref={dialog} className="dialog reset-dialog" aria-labelledby="reset-title" aria-describedby="reset-description" onCancel={(e) => { if (busy) e.preventDefault(); else setOpen(false); }}>
      <h2 id="reset-title">Start with a clean workspace?</h2>
      <p id="reset-description">This removes your scenarios, results, notes, filters, lesson progress, credit refresh selections and saved workspace backups from this browser. Setup and display preferences return to their defaults.</p>
      <p>This cannot be undone. Files you have already downloaded stay on your computer. Close any other tabs running this tool first so they cannot save old work again.</p>
      <p><a href={href('decision', 'files')} onClick={() => setOpen(false)}>Export your scenarios first</a> if you want to keep them.</p>
      {error && <p role="alert">{error}</p>}
      <div className="row"><button ref={cancel} type="button" disabled={busy} onClick={() => setOpen(false)}>Keep my workspace</button><button type="button" disabled={busy} onClick={() => void reset()}>{busy ? 'Clearing workspace…' : 'Clear everything and restart'}</button></div>
    </dialog>
  </>;
}
