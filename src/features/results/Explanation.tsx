import { useStore } from '../../app/store';
import { explainComparison } from '../../domain/narrative';
import { useComparison } from './useComparison';
import { BlockedNotice } from './BlockedNotice';

export function Explanation() {
  const { state } = useStore();
  const { baseOut, actOut, baseInput, actInput, ready, isBaseline, blockers } = useComparison();
  if (!ready) return <section className="card"><h2>What changed, in plain English</h2><BlockedNotice what="The explanation" blockers={blockers} /></section>;
  const groups: Record<string, string> = { market: 'Market conditions', behavior: 'Borrower behavior', business: 'Business decisions', model: 'Modeling assumptions' };
  const n = explainComparison(baseInput!, baseOut!, actInput!, actOut!, state.goal);
  return (
    <section className="card stack" aria-labelledby="explain-h" data-testid="explanation">
      <h2 id="explain-h">What changed, in plain English</h2>
      {isBaseline ? (
        <p>You are viewing the frozen baseline. Pick or duplicate a scenario, change one assumption and run it to compare.</p>
      ) : (
        <>
          <p data-testid="explanation-headline"><strong>{n.headline}</strong></p>
          {n.points.length > 0 && (
            <ul>
              {n.points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          {n.changes.length > 0 && (
            <div>
              <h3>Inputs that differ from the baseline</h3>
              <ul style={{ fontSize: '0.9rem' }}>
                {n.changes.map((c) => (
                  <li key={c.id}>
                    <span className="muted">{groups[c.group]}:</span> {c.label}: {c.from} → {c.to}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {actOut!.warnings.length > 0 && (
        <div>
          <h3>Notes on this run</h3>
          <ul style={{ fontSize: '0.88rem' }}>
            {actOut!.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
          </ul>
        </div>
      )}
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Explanations are generated from calculated results by fixed templates. Run key {actOut!.runKey.slice(0, 12)}…, model {actOut!.modelVersion}.
      </p>
    </section>
  );
}
