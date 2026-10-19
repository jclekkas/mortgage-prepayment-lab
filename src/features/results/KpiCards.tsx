import { useState } from 'react';
import { addMonths, formatMonth } from '../../domain/calendar';
import { pct, pp, signedPct, usd, years } from '../../domain/format';
import { explainMetric, type MetricId } from '../../domain/narrative';
import type { RunOutput } from '../../domain/types';
import { useStore } from '../../app/store';
import { useComparison } from './useComparison';
import { BlockedNotice } from './BlockedNotice';
import { LabelWithHelp } from '../../ui/TermHelp';
import type { TermId } from '../../ui/terms';
import { trendOf, type TrendMetric } from '../../domain/trend';
import { TrendArrow, TrendKey } from '../../ui/TrendArrow';
import { PerspectiveSwitch, usePerspective } from './Perspective';

interface CardDef {
  id: MetricId;
  label: string;
  period: (asOf: string) => string;
  /** The number the card shows, read from a run; null when not applicable. */
  metric: (o: RunOutput) => number | null;
  format: (v: number | null) => string;
  /** How the difference is written. */
  delta: (b: number, s: number) => string;
  term?: TermId;
  trend: TrendMetric;
}

const pctChange = (b: number, s: number) => (b === 0 ? '' : ` (${signedPct((s - b) / Math.abs(b))})`);
const dollars = (v: number | null) => usd(v, { compact: true });
const dollarDelta = (b: number, s: number) => `${usd(s - b, { compact: true, signed: true })}${pctChange(b, s)}`;
const next12 = (a: string) => `${formatMonth(addMonths(a, 1))} to ${formatMonth(addMonths(a, 12))}`;

/** Sum of a ledger field over the first 12 projected months (display aggregation only). */
const first12 = (o: RunOutput, f: (m: RunOutput['ledger'][number]) => number) => o.ledger.slice(0, 12).reduce((a, m) => a + f(m), 0);

const UPB: CardDef = { id: 'upb', term: 'upb', trend: 'upb', label: 'Current unpaid principal balance (UPB)', period: (a) => `As of ${formatMonth(a)}`, metric: (o) => o.summary.currentUpb, format: dollars, delta: (b, s) => usd(s - b, { compact: true, signed: true }) };
const CPR: CardDef = { id: 'cpr', term: 'cpr', trend: 'cpr', label: 'Next-month conditional prepayment rate (CPR)', period: (a) => `${formatMonth(addMonths(a, 1))}, annualized`, metric: (o) => o.summary.nextMonthCpr, format: (v) => pct(v), delta: (b, s) => pp(s - b) };
const PREPAID: CardDef = { id: 'prepaid12', term: 'prepaid', trend: 'prepaid12', label: 'Projected 12-month prepaid principal', period: next12, metric: (o) => o.summary.prepaid12, format: dollars, delta: dollarDelta };
const NET12: CardDef = { id: 'net12', term: 'netServicing', trend: 'net12', label: 'Projected 12-month net servicing cash flow', period: next12, metric: (o) => o.summary.netServicing12, format: dollars, delta: dollarDelta };
const NPV: CardDef = { id: 'npv', term: 'npv', trend: 'npv', label: 'Illustrative lifetime servicing net present value (NPV)', period: () => 'All remaining months, in today’s dollars', metric: (o) => o.summary.servicingNpv, format: dollars, delta: dollarDelta };
const WAL: CardDef = { id: 'wal', term: 'wal', trend: 'wal', label: 'Loan principal weighted-average life (WAL)', period: () => 'When principal comes back; not servicing duration', metric: (o) => o.summary.wal, format: (v) => years(v), delta: (b, s) => `${s - b >= 0 ? '+' : '−'}${Math.abs(s - b).toFixed(2)} years` };
const PRINCIPAL12: CardDef = { id: 'principal12', term: 'prepaid', trend: 'prepaid12', label: 'Principal returned to the loan owner, next 12 months', period: next12, metric: (o) => o.summary.scheduled12 + o.summary.prepaid12, format: dollars, delta: dollarDelta };
const INTEREST12: CardDef = { id: 'ownerInterest12', trend: 'ownerInterest12', label: 'Note interest to the loan owner after the servicing fee, next 12 months', period: next12, metric: (o) => first12(o, (m) => m.ownerNetInterest), format: dollars, delta: dollarDelta };

/** Cards for each perspective. The servicer view adds average life as a secondary card. */
const SERVICER: CardDef[] = [UPB, CPR, PREPAID, NET12, NPV];
const OWNER: CardDef[] = [UPB, CPR, PRINCIPAL12, INTEREST12, WAL];

export function KpiCards() {
  const { state } = useStore();
  const perspective = usePerspective();
  const { actInput, ready, isBaseline, blockers, dirty, sameAsBaseline } = useComparison();
  const stale = dirty && !isBaseline;
  if (!ready) return <BlockedNotice what="Headline measures" blockers={blockers} />;
  const asOf = state.portfolio.meta.asOfMonth;
  const owner = perspective === 'owner';
  return (
    <section aria-labelledby="kpi-h" className="stack" data-testid="kpi-section" data-perspective={perspective}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="kpi-h" style={{ margin: 0 }}>
          Headline measures: {actInput!.name}, {owner ? 'loan owner' : 'servicer'} perspective
          {stale && <span className="badge dirty" style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}>Previous run</span>}
        </h2>
        <PerspectiveSwitch />
      </div>
      <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
        {isBaseline ? 'Showing the frozen baseline: the starting assumptions, kept fixed for comparison.' : 'Differences are versus the frozen baseline: the starting assumptions, kept fixed for comparison. Differences use unrounded values.'}
        {owner
          ? ' The loan owner view shows when principal and interest arrive. It does not calculate the investment’s value, yield or profit: those need a purchase price, funding cost, reinvestment rate and credit losses, which this simulator does not model.'
          : ' The servicer administers the loans, earns servicing fees and pays the cost of servicing. Principal repayment belongs to the loan owner. One organization may perform both roles.'}
      </p>
      {!isBaseline && (sameAsBaseline
        ? <p className="muted" style={{ fontSize: '0.85rem' }} data-testid="same-as-baseline">{actInput!.name} {stale ? 'was last run with' : 'has'} the same inputs as the baseline, so every difference is zero. Change an assumption and press Run to compare.</p>
        : <TrendKey />)}
      <div className="grid-cards">
        {(owner ? OWNER : SERVICER).map((c) => (
          <Kpi key={c.id} def={c} asOf={asOf} isBaseline={isBaseline} same={sameAsBaseline} />
        ))}
      </div>
      {!owner && (
        <div className="grid-cards">
          <Kpi def={WAL} asOf={asOf} isBaseline={isBaseline} same={sameAsBaseline} secondary />
        </div>
      )}
    </section>
  );
}

function Kpi({ def, asOf, isBaseline, secondary, same }: { def: CardDef; asOf: string; isBaseline: boolean; secondary?: boolean; same: boolean }) {
  const { baseOut, actOut, baseInput, actInput, dirty } = useComparison();
  const stale = dirty && !isBaseline;
  const [open, setOpen] = useState(false);
  const bv = def.metric(baseOut!), sv = def.metric(actOut!);
  return (
    <article className="card kpi" data-testid={`kpi-${def.id}`} style={secondary ? { background: 'var(--surface-2)' } : undefined}>
      <div className="label"><LabelWithHelp label={def.label} term={def.term} /></div>
      <div className="value" data-testid={`kpi-${def.id}-value`}>{def.format(sv)}</div>
      {stale && <div className="period" data-testid="kpi-stale"><span className="badge dirty">Previous run</span></div>}
      {def.id === 'npv' && <div className="period">{actOut!.summary.servicingValueBps === null ? 'Not applicable' : `${actOut!.summary.servicingValueBps.toFixed(1)} basis points of current balance`}</div>}
      <div className="period">{def.period(asOf)}</div>
      {!isBaseline && (
        <div className="delta">
          vs baseline: {bv === null || sv === null ? 'Not applicable' : def.delta(bv, sv)} {!same && <TrendArrow trend={trendOf(def.trend, bv, sv)} />}
        </div>
      )}
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Why did this change?
      </button>
      {open && (
        <div style={{ fontSize: '0.88rem' }}>
          {explainMetric(def.id, baseInput!, baseOut!, actInput!, actOut!).map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
    </article>
  );
}
