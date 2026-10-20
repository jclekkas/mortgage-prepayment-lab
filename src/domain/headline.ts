/**
 * The short hero headline: a fixed template over calculated summaries. It states a direction and
 * a size, never a cause; the explanation underneath carries the reasoning.
 */
import { pct, signedPct, usd, years } from './format';
import { trendOf } from './trend';
import type { SummaryMetrics } from './types';

/** Next-month speed within 0.05 percentage points reads "about the same" (display threshold). */
function speedWord(b: number | null, s: number | null): string {
  if (b === null || s === null) return 'not comparable';
  if (s > b + 0.0005) return 'faster';
  if (s < b - 0.0005) return 'slower';
  return 'about the same';
}

export function shortHeadline(owner: boolean, name: string, b: SummaryMetrics, s: SummaryMetrics): string {
  const speed = speedWord(b.nextMonthCpr, s.nextMonthCpr);
  if (owner) {
    const timing = b.wal === null || s.wal === null ? 'on a timing that cannot be compared'
      : Math.abs(s.wal - b.wal) < 1e-9 ? 'on the same timing'
      : s.wal < b.wal ? 'sooner' : 'later';
    return `${name}: principal comes back ${timing}, average life ${years(b.wal)} → ${years(s.wal)}. Prepayment is ${speed}.`;
  }
  const tr = trendOf('npv', b.servicingNpv, s.servicingNpv);
  const d = s.servicingNpv - b.servicingNpv;
  const pc = b.servicingNpv !== 0 ? ` (${signedPct(d / Math.abs(b.servicingNpv))})` : '';
  return `${name}: lifetime servicing value ${tr ? tr.word : 'changes'}, ${usd(d, { compact: true, signed: true })}${pc}. Prepayment is ${speed} (${pct(b.nextMonthCpr)} → ${pct(s.nextMonthCpr)}).`;
}
