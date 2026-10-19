import { useEffect, useState } from 'react';
import { HYPOTHESIS_MAX, useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { pct, pp, usd } from '../../domain/format';
import type { ValidationResult } from '../../domain/validation';
import { LineChart } from '../../ui/LineChart';
import { Notice } from '../../ui/misc';

export function useValidation() {
  const { client } = useStore();
  const [v, setV] = useState<ValidationResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const h = client.request({ kind: 'validation' });
    h.promise.then(({ result }) => setV(result), (e: Error) => setErr(e.message));
    return () => h.cancel();
  }, [client]);
  return { v, err };
}

export function ValidationPage() {
  const { v, err } = useValidation();
  const { state, dispatch } = useStore();
  const [sel, setSel] = useState<number | null>(null);
  if (err) return <Notice kind="err">The validation lab failed to load: {err}</Notice>;
  if (!v) return <p>Loading the synthetic history…</p>;
  const labels = v.months.map((m) => formatMonth(m.month));
  return (
    <div className="stack">
      <h1>Validation lab</h1>
      <Notice kind="warn"><strong>Synthetic history.</strong> {v.disclosure}</Notice>
      <p>
        A forecast was frozen at {formatMonth(v.origin)} assuming the offer rate stayed at 6.75%. Below are the 24 months that followed. Compare the frozen forecast with what happened, then with the same model re-run on the rates that actually occurred, to separate a <em>rate-path miss</em> from a <em>behavior miss</em>.
      </p>
      <LineChart
        testId="chart-validation"
        title="Monthly CPR: forecasts versus synthetic actual"
        summary={`Average actual CPR ${pct(v.months.reduce((a, m) => a + (m.actualCpr ?? 0), 0) / v.months.length)} versus ${pct(v.months.reduce((a, m) => a + (m.frozenCpr ?? 0), 0) / v.months.length)} for the frozen forecast.`}
        series={[
          { id: 'actual', label: 'Synthetic actual', color: 'var(--text)', values: v.months.map((m) => m.actualCpr) },
          { id: 'frozen', label: 'Frozen forecast', color: 'var(--s1)', values: v.months.map((m) => m.frozenCpr) },
          { id: 'ar', label: 'Re-run with actual rates', color: 'var(--s2)', values: v.months.map((m) => m.actualRatesCpr), dashed: true },
          { id: 'psa', label: '100% PSA', color: 'var(--s0)', values: v.months.map((m) => m.psaCpr), dashed: true },
          { id: 'fixed', label: 'Fixed 8% CPR', color: 'var(--s3)', values: v.months.map((m) => m.fixedCpr), dashed: true },
        ]}
        xLabels={labels}
        yFormat={(x) => pct(x, 1)}
        selectedIndex={sel}
        onSelect={setSel}
        includeZero
      />
      <section className="card">
        <h2>Forecast scores</h2>
        <div className="table-wrap">
          <table data-testid="validation-scores">
            <caption className="sr-only">Forecast error</caption>
            <thead><tr><th scope="col">Forecast</th><th scope="col">Mean CPR error (bias)</th><th scope="col">Mean absolute CPR error</th><th scope="col">24-month prepaid dollars, forecast minus actual</th></tr></thead>
            <tbody>
              {v.scores.map((s) => (
                <tr key={s.id}><th scope="row">{s.label}</th><td>{pp(s.meanError)}</td><td>{pp(s.meanAbsError).replace('+', '')}</td><td>{usd(s.prepaidError, { compact: true, signed: true })}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>Negative error means the forecast was too slow. Errors are in percentage points of CPR. A more complex model is not guaranteed to win; judge it against simple benchmarks.</p>
      </section>
      <section className="card">
        <h2>Bias by note rate (frozen forecast)</h2>
        <div className="table-wrap">
          <table data-testid="validation-cohorts">
            <caption className="sr-only">Cohort bias</caption>
            <thead><tr><th scope="col">Note rate</th><th scope="col">Loans</th><th scope="col">Forecast prepaid</th><th scope="col">Actual prepaid</th><th scope="col">Bias</th><th scope="col">Bias, share of actual</th><th scope="col">Forecast 24-month CPR</th><th scope="col">Actual 24-month CPR</th></tr></thead>
            <tbody>
              {v.cohorts.map((c) => (
                <tr key={c.key}><th scope="row">{c.label}</th><td>{c.loanCount}</td><td>{usd(c.forecastPrepaid, { compact: true })}</td><td>{usd(c.actualPrepaid, { compact: true })}</td><td>{usd(c.bias, { compact: true, signed: true })}</td><td>{c.biasShare === null ? 'Not applicable' : `${(c.biasShare * 100).toFixed(1)}%`}</td><td>{pct(c.forecastCpr)}</td><td>{pct(c.actualCpr)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Your hypothesis</h2>
        <label htmlFor="hyp">What could explain the pattern of errors? What evidence would test it?</label>
        <textarea id="hyp" value={state.validationHypothesis} maxLength={HYPOTHESIS_MAX} onChange={(e) => dispatch({ type: 'setHypothesis', text: e.target.value })} data-testid="hypothesis" />
        <p className="muted" style={{ fontSize: '0.85rem' }}>{state.storage.status === 'unavailable' ? 'Not saved: local storage is unavailable, so this text lasts only while the tab is open.' : 'Saved on this device with your workspace.'}</p>
        <p className="muted" style={{ fontSize: '0.85rem' }}>A good hypothesis names a driver (rate path, refinance response, turnover, friction), predicts which cohorts it would affect, and says what data would confirm or reject it. Fitting the history better is not proof.</p>
      </section>
      <details className="drawer">
        <summary>Monthly detail</summary>
        <div className="table-wrap tall">
          <table>
            <thead><tr><th scope="col">Month</th><th scope="col">Actual offer rate</th><th scope="col">Actual CPR</th><th scope="col">Frozen forecast CPR</th><th scope="col">Error</th><th scope="col">Actual prepaid</th><th scope="col">Forecast prepaid</th></tr></thead>
            <tbody>
              {v.months.map((m) => (
                <tr key={m.t}><th scope="row">{formatMonth(m.month)}</th><td>{pct(m.actualRate)}</td><td>{pct(m.actualCpr)}</td><td>{pct(m.frozenCpr)}</td><td>{m.frozenCpr !== null && m.actualCpr !== null ? pp(m.frozenCpr - m.actualCpr) : 'Not applicable'}</td><td>{usd(m.actualPrepaid, { compact: true })}</td><td>{usd(m.frozenPrepaid, { compact: true })}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="muted" style={{ fontSize: '0.85rem' }}>Planned for real data (P1): chronological train/validation/test windows, loan-level grouping, as-of features, censoring at the observation end, and separating voluntary payoff, default, repurchase and maturity. Unknown payoff reasons stay “unknown voluntary payoff”.</p>
    </div>
  );
}
