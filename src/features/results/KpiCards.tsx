import { useState } from 'react';
import { addMonths, formatMonth } from '../../domain/calendar';
import { pct, pp, signedPct, usd, years } from '../../domain/format';
import { explainMetric, type MetricId } from '../../domain/narrative';
import type { RunOutput } from '../../domain/types';
import { useStore } from '../../app/store';
import { useComparison } from './useComparison';
import { BlockedNotice } from './BlockedNotice';
import { TermHelp } from '../../ui/TermHelp';
import type { TermId } from '../../ui/terms';
import { trendOf, type TrendMetric } from '../../domain/trend';
import { TrendArrow, TrendKey } from '../../ui/TrendArrow';
import { Sparkline } from '../../ui/Sparkline';
import { usePerspective } from './Perspective';

type Ledger = RunOutput['ledger'];

interface CardDef {
  id: MetricId;
  /** Plain label first; the technical name sits underneath. */
  label: string;
  technical: string;
  period: (asOf: string) => string;
  /** The number the card shows, read from a run; null when not applicable. */
  metric: (o: RunOutput) => number | null;
  format: (v: number | null) => string;
  /** How the difference is written. */
  delta: (b: number, s: number) => string;
  term?: TermId;
  trend: TrendMetric;
  /** Monthly series for the sparkline, and what it plots. */
  series: (l: Ledger) => number[];
  seriesName: string;
}

const pctChange = (b: number, s: number) => (b === 0 ? '' : ` (${signedPct((s - b) / Math.abs(b))})`);
const dollars = (v: number | null) => usd(v, { compact: true });
const dollarDelta = (b: number, s: number) => `${usd(s - b, { compact: true, signed: true })}${pctChange(b, s)}`;
const next12 = (a: string) => `${formatMonth(addMonths(a, 1))} to ${formatMonth(addMonths(a, 12))}`;

/** Sum of a ledger field over the first 12 projected months (display aggregation only). */
const first12 = (o: RunOutput, f: (m: Ledger[number]) => number) => o.ledger.slice(0, 12).reduce((a, m) => a + f(m), 0);
const cumulative = (xs: number[]) => { let s = 0; return xs.map((x) => (s += x)); };

const NPV: CardDef = { id: 'npv', term: 'npv', trend: 'npv', label: 'Lifetime servicing value', technical: 'Illustrative net present value (NPV)', period: () => 'All remaining months, in today’s dollars', metric: (o) => o.summary.servicingNpv, format: dollars, delta: dollarDelta, series: (l) => cumulative(l.map((m) => m.pvNetServicing)), seriesName: 'value built up month by month, in today’s dollars' };
const NET12: CardDef = { id: 'net12', term: 'netServicing', trend: 'net12', label: 'Net servicing cash flow, 12 months', technical: 'Fees minus servicing costs', period: next12, metric: (o) => o.summary.netServicing12, format: dollars, delta: dollarDelta, series: (l) => l.map((m) => m.netServicing), seriesName: 'net servicing cash flow each month' };
const CPR: CardDef = { id: 'cpr', term: 'cpr', trend: 'cpr', label: 'Prepayment speed, next month', technical: 'Conditional prepayment rate (CPR)', period: (a) => `${formatMonth(addMonths(a, 1))}, annualized`, metric: (o) => o.summary.nextMonthCpr, format: (v) => pct(v), delta: (b, s) => pp(s - b), series: (l) => l.map((m) => m.cpr ?? 0), seriesName: 'prepayment speed each month' };
const PREPAID: CardDef = { id: 'prepaid12', term: 'prepaid', trend: 'prepaid12', label: 'Prepaid principal, 12 months', technical: 'Projected prepaid principal', period: next12, metric: (o) => o.summary.prepaid12, format: dollars, delta: dollarDelta, series: (l) => l.map((m) => m.prepaidPrincipal), seriesName: 'prepaid principal each month' };
const WAL: CardDef = { id: 'wal', term: 'wal', trend: 'wal', label: 'Average life of principal', technical: 'Weighted-average life (WAL)', period: () => 'When principal comes back; not servicing duration', metric: (o) => o.summary.wal, format: (v) => years(v), delta: (b, s) => `${s - b >= 0 ? '+' : '−'}${Math.abs(s - b).toFixed(2)} years`, series: (l) => l.map((m) => m.endingUpb), seriesName: 'balance still outstanding at each month end' };
const PRINCIPAL12: CardDef = { id: 'principal12', term: 'prepaid', trend: 'prepaid12', label: 'Principal to the loan owner, 12 months', technical: 'Scheduled plus prepaid principal', period: next12, metric: (o) => o.summary.scheduled12 + o.summary.prepaid12, format: dollars, delta: dollarDelta, series: (l) => l.map((m) => m.scheduledPrincipal + m.prepaidPrincipal), seriesName: 'principal returned each month' };
const INTEREST12: CardDef = { id: 'ownerInterest12', trend: 'ownerInterest12', label: 'Interest to the loan owner, 12 months', technical: 'Note interest after the servicing fee', period: next12, metric: (o) => first12(o, (m) => m.ownerNetInterest), format: dollars, delta: dollarDelta, series: (l) => l.map((m) => m.ownerNetInterest), seriesName: 'interest to the loan owner each month' };

/** Cards for each perspective, lead card first. The unpaid balance is stated in the hero line instead. */
const SERVICER: CardDef[] = [NPV, NET12, CPR, PREPAID, WAL];
const OWNER: CardDef[] = [PRINCIPAL12, INTEREST12, WAL, CPR];
const SPARK_MONTHS = 36;

export function KpiCards() {
  const { state } = useStore();
  const perspective = usePerspective();
  const { actInput, ready, isBaseline, blockers, dirty, sameAsBaseline } = useComparison();
  const stale = dirty && !isBaseline;
  if (!ready) return <BlockedNotice what="Headline measures" blockers={blockers} />;
  const asOf = state.portfolio.meta.asOfMonth;
  const owner = perspective === 'owner';
  return (
    <section aria-labelledby="kpi-h" className="stack" data-testid="kpi-section" data-perspective={perspective} style={{ marginTop: 0 }}>
      <h2 id="kpi-h" className="sr-only">Headline measures: {actInput!.name}, {owner ? 'loan owner' : 'servicer'} perspective</h2>
      <div className="kpi-grid">
        {(owner ? OWNER : SERVICER).map((c, i) => (
          <Kpi key={c.id} def={c} asOf={asOf} isBaseline={isBaseline} same={sameAsBaseline} lead={i === 0} />
        ))}
      </div>
      <div style={{ fontSize: 13, marginTop: 8 }}>
        {stale && <p className="notice warn" style={{ margin: '0 0 6px' }}><strong>Previous run.</strong> These cards are from the last run of {actInput!.name}. Press Run to include your edits.</p>}
        {!isBaseline && (sameAsBaseline
          ? <p className="muted" data-testid="same-as-baseline">{actInput!.name} {stale ? 'was last run with' : 'has'} the same inputs as the baseline, so every difference is zero. Change an assumption and press Run to compare.</p>
          : <TrendKey owner={owner} />)}
        <p className="muted" style={{ margin: 0 }}>
          {isBaseline ? 'Showing the frozen baseline: the starting assumptions, kept fixed for comparison.' : 'Differences are versus the frozen baseline: the starting assumptions, kept fixed for comparison. Differences use unrounded values.'}
          {owner
            ? ' The loan owner view shows when principal and interest arrive. It does not calculate the investment’s value, yield or profit: those need a purchase price, funding cost, reinvestment rate and credit losses, which this simulator does not model.'
            : ' The servicer administers the loans, earns servicing fees and pays the cost of servicing. Principal repayment belongs to the loan owner. One organization may perform both roles.'}
        </p>
      </div>
    </section>
  );
}

function Kpi({ def, asOf, isBaseline, same, lead }: { def: CardDef; asOf: string; isBaseline: boolean; same: boolean; lead: boolean }) {
  const { baseOut, actOut, baseInput, actInput, dirty } = useComparison();
  const stale = dirty && !isBaseline;
  const [open, setOpen] = useState(false);
  const bv = def.metric(baseOut!), sv = def.metric(actOut!);
  const scen = def.series(actOut!.ledger.slice(0, SPARK_MONTHS));
  const base = isBaseline ? null : def.series(baseOut!.ledger.slice(0, SPARK_MONTHS));
  return (
    <article className={`kpi${lead ? ' lead' : ''}`} data-testid={`kpi-${def.id}`}>
      <div className="label-row">
        <span className="label">{def.label}</span>
        {def.term && <TermHelp id={def.term} />}
      </div>
      <span className="term-name">{def.technical}</span>
      <div className="value" data-testid={`kpi-${def.id}-value`}>{def.format(sv)}</div>
      <Sparkline className="spark" lines={base ? [{ values: base, dashed: true }, { values: scen }] : [{ values: scen }]}
        label={`Sparkline of ${def.seriesName} over the next ${Math.min(SPARK_MONTHS, actOut!.ledger.length)} months${base ? '; dashed line: baseline' : ''}.`} />
      {stale && <div className="period" data-testid="kpi-stale"><span className="badge dirty">Previous run</span></div>}
      {def.id === 'npv' && <div className="period">{actOut!.summary.servicingValueBps === null ? 'Not applicable' : `${actOut!.summary.servicingValueBps.toFixed(1)} basis points of balance`}</div>}
      <div className="period">{def.period(asOf)}</div>
      {!isBaseline && (
        <div className="delta">
          <span className="muted">Δ vs baseline</span>
          <span>{bv === null || sv === null ? 'Not applicable' : def.delta(bv, sv)}</span>
          {!same && <TrendArrow trend={trendOf(def.trend, bv, sv)} />}
        </div>
      )}
      <div className="why">
        <button type="button" className="link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Why?<span className="sr-only"> {def.label}</span>
        </button>
      </div>
      {open && (
        <div style={{ fontSize: 13 }}>
          {explainMetric(def.id, baseInput!, baseOut!, actInput!, actOut!).map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
    </article>
  );
}
