/**
 * Direction and impact of a change versus the baseline, for the arrows next to deltas.
 * Display only. Direction is up, down or flat; impact is judged from the servicer's view,
 * because a faster prepayment speed is not good or bad in itself (PRD section 4).
 */
import type { Lens } from './narrative';

export type TrendMetric = 'upb' | 'cpr' | 'cpr12' | 'prepaid12' | 'net12' | 'npv' | 'npvBps' | 'recapturePv' | 'combined' | 'wal';
export type Direction = 'up' | 'down' | 'flat';
/** good/bad for the servicer; flat = little or no change; neutral = not good or bad in itself. */
export type Tone = 'good' | 'bad' | 'flat' | 'neutral';

export interface Trend {
  direction: Direction;
  tone: Tone;
  /** Short visible word next to the arrow; empty for neutral. */
  word: string;
  /** Full sentence for screen readers. */
  label: string;
}

/** +1: a rise helps the servicer; -1: a rise hurts it; 0: neither, in itself. */
function polarity(metric: TrendMetric, lens: Lens): -1 | 0 | 1 {
  switch (metric) {
    case 'cpr':
    case 'cpr12':
    case 'prepaid12':
      // Payoffs end fee income for the servicer. For a loan owner they change timing, not value by themselves.
      return lens === 'investor' ? 0 : -1;
    case 'net12':
    case 'npv':
    case 'npvBps':
    case 'recapturePv':
    case 'combined':
      return 1;
    case 'upb':
    case 'wal':
      return 0;
  }
}

/** Changes smaller than this count as "little or no change". */
function isFlat(metric: TrendMetric, delta: number, base: number | null): boolean {
  const a = Math.abs(delta);
  switch (metric) {
    case 'cpr':
    case 'cpr12':
      return a < 0.0005; // 0.05 percentage points
    case 'npvBps':
      return a < 0.5; // half a basis point
    case 'wal':
      return a < 0.05; // about two and a half weeks
    default:
      // Dollars: under $1, or under 0.5% of the baseline when it is known.
      return a < 1 || (base !== null && base !== 0 && a / Math.abs(base) < 0.005);
  }
}

/** Trend from a difference. Returns null when the difference is not available. */
export function trendOfDelta(metric: TrendMetric, delta: number | null, base: number | null, lens: Lens): Trend | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (isFlat(metric, delta, base)) return { direction: 'flat', tone: 'flat', word: 'flat', label: 'Little or no change from the baseline.' };
  const direction: Direction = delta > 0 ? 'up' : 'down';
  const p = polarity(metric, lens);
  const dir = direction === 'up' ? 'Up' : 'Down';
  if (p === 0) {
    const why = lens === 'investor' && (metric === 'cpr' || metric === 'cpr12' || metric === 'prepaid12')
      ? 'for the loan owner this changes timing, not value by itself'
      : 'not better or worse in itself';
    return { direction, tone: 'neutral', word: '', label: `${dir}; ${why}.` };
  }
  const good = (direction === 'up') === (p === 1);
  return { direction, tone: good ? 'good' : 'bad', word: good ? 'better' : 'worse', label: `${dir}, ${good ? 'better' : 'worse'} for the servicer.` };
}

/** Trend from a baseline and a scenario value. */
export function trendOf(metric: TrendMetric, base: number | null, scen: number | null, lens: Lens): Trend | null {
  if (base === null || scen === null) return null;
  return trendOfDelta(metric, scen - base, base, lens);
}
