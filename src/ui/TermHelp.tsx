import { useId, useState } from 'react';
import { fullName, TERMS, type TermId } from './terms';

/**
 * A small "?" button that shows a term's plain-English meaning in place, below it.
 * A real button, so it works with touch, keyboard and screen readers; nothing depends on hover.
 */
export function TermHelp({ id }: { id: TermId }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <>
      <button
        type="button"
        className="term-help"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      >
        <span aria-hidden="true">?</span>
        <span className="sr-only">What is {fullName(id)}?</span>
      </button>
      <span id={panel} className="term-pop" hidden={!open}>
        <strong>{fullName(id)}:</strong> {TERMS[id].plain}
      </span>
    </>
  );
}

/** A label whose last word stays on the same line as its help button. */
export function LabelWithHelp({ label, term }: { label: string; term?: TermId }) {
  if (!term) return <>{label}</>;
  const cut = label.lastIndexOf(' ');
  return (
    <>
      {label.slice(0, cut + 1)}
      <span className="nowrap">{label.slice(cut + 1)}<TermHelp id={term} /></span>
    </>
  );
}

/** A collapsed reference list of every term the page uses. */
export function TermsOnPage({ ids, open }: { ids: TermId[]; open?: boolean }) {
  return (
    <details className="terms-on-page" data-testid="terms-on-page" open={open}>
      <summary>Terms on this page</summary>
      <dl>
        {ids.map((id) => (
          <div key={id}>
            <dt>{fullName(id)}</dt>
            <dd>{TERMS[id].plain}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
