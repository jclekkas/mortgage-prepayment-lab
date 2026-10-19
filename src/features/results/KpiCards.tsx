import { useState } from 'react';
import { addMonths, formatMonth } from '../../domain/calendar';
import { pct, pp, signedPct, usd, years } from '../../domain/format';
import { explainMetric, type MetricId } from '../../domain/narrative';
import type { SummaryMetrics } from '../../domain/types';
import { useStore } from '../../app/store';
import { useComparison } from './useComparison';

interface CardDef {
  id: MetricId;
  label: string;
  period: (asOf: string) => string;
  value: (s: SummaryMetrics) => string;
  delta: (b: SummaryMetrics, s: SummaryMetrics) => string;
}

const pctChange = (b: number, s: number) => (b === 0 ? '' : ` (${signedPct((s - b) / Math.abs(b))})`);

const CARDS: CardDef[] = [
  { id: 'upb', label: 'Current unpaid principal balance (UPB)', period: (a) => `As of ${formatMonth(a)}`, value: (s) => usd(s.currentUpb, { compact: true }), delta: (b, s) => usd(s.currentUpb - b.currentUpb, { compact: true, signed: true }) },
  { id: 'cpr', label: 'Next-month annualized prepayment speed (CPR)', period: (a) => `${formatMonth(addMonths(a, 1))}, annualized`, value: (s) => pct(s.nextMonthCpr), delta: (b, s) => (s.nextMonthCpr === null || b.nextMonthCpr === null ? 'Not applicable' : pp(s.nextMonthCpr - b.nextMonthCpr)) },
  { id: 'prepaid12', label: 'Projected 12-month prepaid principal', period: (a) => `${formatMonth(addMonths(a, 1))} to ${formatMonth(addMonths(a, 12))}`, value: (s) => usd(s.prepaid12, { compact: true }), delta: (b, s) => `${usd(s.prepaid12 - b.prepaid12, { compact: true, signed: true })}${pctChange(b.prepaid12, s.prepaid12)}` },
  { id: 'net12', label: 'Projected 12-month net servicing cash flow', period: (a) => `${formatMonth(addMonths(a, 1))} to ${formatMonth(addMonths(a, 12))}`, value: (s) => usd(s.netServicing12, { compact: true }), delta: (b, s) => `${usd(s.netServicing12 - b.netServicing12, { compact: true, signed: true })}${pctChange(b.netServicing12, s.netServicing12)}` },
  { id: 'npv', label: 'Illustrative lifetime servicing NPV', period: () => 'All remaining months, discounted', value: (s) => `${usd(s.servicingNpv, { compact: true })}`, delta: (b, s) => `${usd(s.servicingNpv - b.servicingNpv, { compact: true, signed: true })}${pctChange(b.servicingNpv, s.servicingNpv)}` },
];

const WAL: CardDef = { id: 'wal', label: 'Loan principal weighted-average life', period: () => 'Loan owner view; not servicing duration', value: (s) => years(s.wal), delta: (b, s) => (s.wal === null || b.wal === null ? 'Not applicable' : `${s.wal - b.wal >= 0 ? '+' : '−'}${Math.abs(s.wal - b.wal).toFixed(2)} years`) };

export function KpiCards() {
  const { state } = useStore();
  const { actInput, ready, isBaseline } = useComparison();
  if (!ready) return <p className="muted">Calculating headline measures…</p>;
  const asOf = state.portfolio.meta.asOfMonth;
  const cards = state.goal === 'investor' ? [...CARDS.slice(0, 3), WAL, ...CARDS.slice(3)] : CARDS;
  return (
    <section aria-labelledby="kpi-h" className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="kpi-h" style={{ margin: 0 }}>Headline measures: {actInput!.name}</h2>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {isBaseline ? 'Showing the frozen baseline.' : `Differences are versus the frozen baseline.`}
        </span>
      </div>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        A faster prepayment speed is not automatically good or bad. For the servicer, payoffs end fee income. For the loan owner, principal comes back sooner and must be reinvested. Changes are shown without good or bad colors for that reason.
      </p>
      <div className="grid-cards">
        {cards.map((c) => (
          <Kpi key={c.id} def={c} asOf={asOf} isBaseline={isBaseline} />
        ))}
      </div>
      {state.goal !== 'investor' && (
        <div className="grid-cards">
          <Kpi def={WAL} asOf={asOf} isBaseline={isBaseline} secondary />
        </div>
      )}
    </section>
  );
}

function Kpi({ def, asOf, isBaseline, secondary }: { def: CardDef; asOf: string; isBaseline: boolean; secondary?: boolean }) {
  const { baseOut, actOut, baseInput, actInput } = useComparison();
  const [open, setOpen] = useState(false);
  const b = baseOut!.summary, s = actOut!.summary;
  return (
    <article className="card kpi" data-testid={`kpi-${def.id}`} style={secondary ? { background: 'var(--surface-2)' } : undefined}>
      <div className="label">{def.label}</div>
      <div className="value" data-testid={`kpi-${def.id}-value`}>{def.value(s)}</div>
      {def.id === 'npv' && <div className="period">{s.servicingValueBps === null ? 'Not applicable' : `${s.servicingValueBps.toFixed(1)} bps of current UPB`}</div>}
      <div className="period">{def.period(asOf)}</div>
      {!isBaseline && <div className="delta">vs baseline: {def.delta(b, s)}</div>}
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
