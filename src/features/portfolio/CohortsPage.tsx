import { useState } from 'react';
import { useStore } from '../../app/store';
import { pct, usd } from '../../domain/format';
import { DIMENSION_LABELS, DIMENSIONS, segmentOptions } from '../../domain/segments';
import type { CohortRow, PopulationFilter, SegmentDimension } from '../../domain/types';
import { PopulationBadge, RunStatus } from '../results/RunStatus';
import { useComparison } from '../results/useComparison';
import { BlockedNotice } from '../results/BlockedNotice';
import { LabelWithHelp, TermsOnPage } from '../../ui/TermHelp';
import { trendOf } from '../../domain/trend';
import { TrendArrow, TrendKey } from '../../ui/TrendArrow';

export function CohortsPage() {
  const { state, dispatch } = useStore();
  const { baseOut, actOut, isBaseline, actSlot, blockers, dirty } = useComparison();
  const stale = dirty && !isBaseline && !!actOut;
  const [dim, setDim] = useState<SegmentDimension>('coupon');
  const filter = state.filter;
  const toggle = (d: SegmentDimension, key: string) => {
    const cur = new Set(filter[d] ?? []);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    const next: PopulationFilter = { ...filter, [d]: [...cur] };
    if (next[d]!.length === 0) delete next[d];
    dispatch({ type: 'setFilter', filter: next });
  };
  const only = (d: SegmentDimension, key: string) => dispatch({ type: 'setFilter', filter: { ...filter, [d]: [key] } });
  const rows = actOut?.cohorts[dim] ?? [];
  const baseRows = baseOut?.cohorts[dim] ?? [];
  const find = (r: CohortRow) => baseRows.find((b) => b.key === r.key);
  return (
    <div className="stack">
      <h1>Cohort explorer: {actSlot.draft.name}</h1>
      <TermsOnPage ids={['upb', 'cpr', 'prepaid', 'npv', 'bp', 'netServicing']} />
      <p className="muted">
        Filter the population to a segment and every chart, card and comparison updates. Each row shows the segment’s unpaid principal balance (UPB), its conditional prepayment rate (CPR), the yearly pace of early payoffs, and its servicing net present value (NPV), future fees less costs in today’s dollars. Dollars show size; the normalized columns (share of balance, and basis points of balance) show intensity, so a large segment is not automatically the riskier one.
        There is no credit-score effect in this release: a credit score is not a prepayment probability.
      </p>
      <PopulationBadge />
      <RunStatus />
      {!actOut && <BlockedNotice what="Segment results" blockers={blockers} />}
      {actOut && actOut.population.loanCount === 0 && (
        <p className="notice warn" role="status">No loans match these filters. Clear a filter to see results.</p>
      )}
      <details className="drawer" open>
        <summary>Filters</summary>
        <div className="two-col" style={{ marginTop: '0.5rem' }}>
          {DIMENSIONS.map((d) => (
            <fieldset key={d} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
              <legend style={{ fontWeight: 600 }}>{DIMENSION_LABELS[d]}</legend>
              <div className="chips">
                {segmentOptions(d, state.portfolio.loans).map((o) => (
                  <label key={o.key} className="row" style={{ gap: '0.25rem', fontWeight: 400 }}>
                    <input type="checkbox" checked={(filter[d] ?? []).includes(o.key)} onChange={() => toggle(d, o.key)} data-testid={`filter-${d}-${o.key}`} />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <button type="button" onClick={() => dispatch({ type: 'setFilter', filter: {} })} disabled={Object.keys(filter).length === 0} style={{ marginTop: '0.5rem' }}>
          Clear all filters
        </button>
      </details>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Results by segment</h2>
          <label className="row" style={{ gap: '0.35rem' }}>
            Group by
            <select value={dim} onChange={(e) => setDim(e.target.value as SegmentDimension)}>
              {DIMENSIONS.map((d) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
            </select>
          </label>
        </div>
        {!isBaseline && <TrendKey />}
        <div className="table-wrap">
          <table data-testid="cohort-table">
            <caption>{DIMENSION_LABELS[dim]}: {actSlot.draft.name}{!isBaseline ? ', with change versus baseline' : ''}{stale ? ' (previous run; edits not yet run)' : ''}</caption>
            <thead>
              <tr>
                <th scope="col">Segment</th>
                <th scope="col">Loans</th>
                <th scope="col"><LabelWithHelp label="Beginning balance (UPB)" term="upb" /></th>
                <th scope="col"><LabelWithHelp label="Next-month CPR" term="cpr" /></th>
                <th scope="col">12-month CPR</th>
                <th scope="col">12-month scheduled principal</th>
                <th scope="col">12-month prepaid principal</th>
                <th scope="col">Prepaid, share of balance</th>
                <th scope="col">12-month net servicing</th>
                <th scope="col"><LabelWithHelp label="Servicing NPV" term="npv" /></th>
                <th scope="col"><LabelWithHelp label="NPV, basis points of balance" term="bp" /></th>
                {!isBaseline && <th scope="col">Change in prepaid vs baseline</th>}
                {!isBaseline && <th scope="col">Change in NPV vs baseline</th>}
                <th scope="col"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = find(r);
                return (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    <td>{r.loanCount}</td>
                    <td>{usd(r.beginningUpb, { compact: true })}</td>
                    <td>{pct(r.nextMonthCpr)}</td>
                    <td>{pct(r.cpr12)}</td>
                    <td>{usd(r.scheduled12, { compact: true })}</td>
                    <td>{usd(r.prepaid12, { compact: true })}</td>
                    <td>{pct(r.prepaid12Share)}</td>
                    <td>{usd(r.netServicing12, { compact: true })}</td>
                    <td>{usd(r.servicingNpv, { compact: true })}</td>
                    <td>{r.servicingValueBps === null ? 'Not applicable' : r.servicingValueBps.toFixed(1)}</td>
                    {!isBaseline && <td>{b ? <>{usd(r.prepaid12 - b.prepaid12, { compact: true, signed: true })} <TrendArrow trend={trendOf('prepaid12', b.prepaid12, r.prepaid12)} /></> : 'Not applicable'}</td>}
                    {!isBaseline && <td>{b ? <>{usd(r.servicingNpv - b.servicingNpv, { compact: true, signed: true })} <TrendArrow trend={trendOf('npv', b.servicingNpv, r.servicingNpv)} /></> : 'Not applicable'}</td>}
                    <td><button type="button" className="link" onClick={() => only(dim, r.key)}>Filter to this<span className="sr-only"> segment: {r.label}</span></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
