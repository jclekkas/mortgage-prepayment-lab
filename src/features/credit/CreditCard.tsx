import { useMemo } from 'react';
import { href } from '../../app/router';
import { useStore } from '../../app/store';
import { CREDIT_DATA_LABEL, creditFixture, isRefreshApplied, snapshotsFor, summarize } from '../../domain/credit';
import { selectPopulation } from '../../domain/engine';
import { pct } from '../../domain/format';

/** Compact Overview link to the credit score refresh workspace. */
export function CreditCard() {
  const { state } = useStore();
  const f = creditFixture(state.portfolio);
  const ids = state.credit.appliedSnapshotIds;
  const s = useMemo(() => summarize(selectPopulation(state.portfolio, state.filter), snapshotsFor(f, ids), f.analysisDate), [state.portfolio, state.filter, f, ids]);
  const latest = snapshotsFor(f, ids).at(-1)!;
  return (
    <section className="card" aria-labelledby="credit-card-h" data-testid="overview-credit-card">
      <p className="kicker">Synthetic</p>
      <h3 id="credit-card-h" style={{ marginTop: 0 }}>Credit score refresh</h3>
      <p style={{ margin: '0 0 6px' }}>
        Newer score information changes what we know, not what loans pay. Using: {latest.label}{isRefreshApplied(f, state.credit) ? '' : ' (newest not applied)'}.
        Usable coverage {s.population.loans ? pct(s.usable.loans / s.population.loans, 1) : 'not applicable'} of {s.population.loans.toLocaleString()} loans.
      </p>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>{CREDIT_DATA_LABEL}. Prepayment results do not use scores.</p>
      <a href={href('credit')} data-testid="overview-credit-link">Open Credit score refresh</a>
    </section>
  );
}
