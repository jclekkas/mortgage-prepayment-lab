import { useStore } from '../../app/store';
import { APP_BUILD } from '../../domain/version';
import { explainComparison } from '../../domain/narrative';
import { shortHeadline } from '../../domain/headline';
import { usd } from '../../domain/format';
import { formatMonth } from '../../domain/calendar';
import { useComparison } from './useComparison';
import { BlockedNotice } from './BlockedNotice';
import { pendingText } from './PendingEdits';
import { usePerspective } from './Perspective';

/** The short headline for the hero (Overview) and the results column (Scenario lab), plus the balance line. */
export function ShortHeadline({ size }: { size: 'hero' | 'lab' }) {
  const { state } = useStore();
  const owner = usePerspective() === 'owner';
  const { baseOut, actOut, baseInput, actInput, ready, isBaseline, sameAsBaseline } = useComparison();
  if (!ready) return null;
  const n = explainComparison(baseInput!, baseOut!, actInput!, actOut!, state.goal);
  const text = isBaseline
    ? 'You are viewing the frozen baseline. Pick a scenario tab, change one assumption and press Run to compare.'
    : sameAsBaseline ? n.headline : shortHeadline(owner, actInput!.name, baseOut!.summary, actOut!.summary);
  const Tag = size === 'hero' ? 'p' : 'h2';
  return (
    <>
      <Tag className={size === 'hero' ? 'hero-headline' : 'short-headline'} data-testid="short-headline">{text}</Tag>
      <p className="hero-line" data-testid="balance-line">
        Balance still owed: {usd(actOut!.summary.currentUpb, { compact: true })} across {actOut!.population.loanCount.toLocaleString()} loans, as of {formatMonth(state.portfolio.meta.asOfMonth)}. No assumption changes it.
      </p>
    </>
  );
}

/**
 * The reasoning behind the result: the full template headline first, then the calculated points,
 * the inputs that differ and notes on the run. Shown once per page: as a panel on the Overview,
 * as an open "Why" section in the Scenario lab.
 */
export function Explanation({ variant = 'panel' }: { variant?: 'panel' | 'details' }) {
  const { state } = useStore();
  const { baseOut, actOut, baseInput, actInput, ready, isBaseline, blockers, dirty, pending, sameAsBaseline } = useComparison();
  const stale = dirty && !isBaseline;
  if (!ready) {
    return variant === 'panel'
      ? <section className="card"><p className="kicker">Explanation</p><h2>Why</h2><BlockedNotice what="The explanation" blockers={blockers} /></section>
      : <BlockedNotice what="The explanation" blockers={blockers} />;
  }
  const groups: Record<string, string> = { market: 'Market conditions', behavior: 'Borrower behavior', business: 'Business decisions', model: 'Modeling assumptions' };
  const n = explainComparison(baseInput!, baseOut!, actInput!, actOut!, state.goal);
  const body = (
    <>
      {stale && (
        <p className="notice warn" data-testid="explanation-stale">
          <strong>Previous run.</strong> This explains the last run of {actInput!.name}. Edited since then, not yet run: {pendingText(pending)}.
        </p>
      )}
      {isBaseline ? (
        <p>You are viewing the frozen baseline. Pick a scenario tab, change one assumption and run it to compare.</p>
      ) : (
        <ul>
          <li data-testid="explanation-headline">{sameAsBaseline && stale ? `When last run, ${actInput!.name} had the same inputs as the baseline, so every result matched.` : n.headline}</li>
          {!(sameAsBaseline && stale) && n.points.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {!isBaseline && n.changes.length > 0 && (
        <div>
          <p className="kicker" style={{ color: 'var(--faint)' }}>Inputs that differ</p>
          <ul style={{ fontSize: 13, margin: 0 }}>
            {n.changes.map((c) => (
              <li key={c.id}><span className="muted">{groups[c.group]}:</span> {c.label}: {c.from} → {c.to}</li>
            ))}
          </ul>
        </div>
      )}
      {actOut!.warnings.length > 0 && (
        <ul style={{ fontSize: 13, listStyle: 'none', padding: 0 }} aria-label="Notes on this run">
          {actOut!.warnings.map((w) => <li key={w.code} style={{ borderLeft: '2px solid var(--muted)', padding: '2px 10px', margin: '6px 0' }}>{w.message}</li>)}
        </ul>
      )}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Explanations are generated from calculated results by fixed templates. Reproducibility key {actOut!.runKey.slice(0, 12)}…, model {actOut!.modelVersion}, build {APP_BUILD.slice(0, 7)}.
      </p>
    </>
  );
  if (variant === 'details') {
    return (
      <details open data-testid="explanation">
        <summary style={{ color: 'var(--accent-ink)' }}>Why</summary>
        <div className="stack" style={{ marginTop: 8 }}>{body}</div>
      </details>
    );
  }
  return (
    <section className="card stack" aria-labelledby="explain-h" data-testid="explanation">
      <div>
        <p className="kicker">Explanation</p>
        <h2 id="explain-h" style={{ margin: 0 }}>Why</h2>
      </div>
      {body}
    </section>
  );
}
