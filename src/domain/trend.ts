/**
 * Direction and impact of a change versus the baseline, for the arrows next to deltas.
 * Display only. Direction is up, down or flat; impact is judged from the servicer's view,
 * because a faster prepayment speed is not good or bad in itself (PRD section 4). Where the
 * model does not establish an effect, the tag says "not assessed".
 */
import type { Lens } from './narrative';

export type TrendMetric = 'upb' | 'cpr' | 'cpr12' | 'prepaid12' | 'net12' | 'npv' | 'npvBps' | 'recapturePv' | 'combined' | 'wal';
export type Direction = 'up' | 'down' | 'flat';
/** good/bad for the servicer; flat = no change or a small change below the display threshold; neutral = effect not assessed. */
export type Tone = 'good' | 'bad' | 'flat' | 'neutral';

export interface Trend {
  direction: Direction;
  tone: Tone;
  /** Short visible word next to the arrow. */
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
      // Payoffs end fee income for the servicer. For a loan owner they change cash-flow timing, which can
      // affect investment value; this simulator does not determine whether that is favorable, so it is not assessed.
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

/**
 * Display thresholds: nonzero changes smaller than these show as "small change" instead of an
 * arrow. They keep the dashboard readable; they are not economic materiality thresholds.
 */
function isSmall(metric: TrendMetric, delta: number, base: number | null): boolean {
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

/** A difference this close to zero (relative to the baseline, or absolute when it is unknown) is "no change". */
export const ZERO_TOLERANCE = 1e-9;

function isZero(delta: number, base: number | null): boolean {
  return Math.abs(delta) <= ZERO_TOLERANCE * Math.max(1, Math.abs(base ?? 0));
}

/** Trend from a difference. Returns null when the difference is not available. */
export function trendOfDelta(metric: TrendMetric, delta: number | null, base: number | null, lens: Lens): Trend | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (isZero(delta, base)) return { direction: 'flat', tone: 'flat', word: 'no change', label: 'No change from the baseline.' };
  const direction: Direction = delta > 0 ? 'up' : 'down';
  if (isSmall(metric, delta, base)) {
    return { direction: 'flat', tone: 'flat', word: 'small change', label: `Small change (${direction}) from the baseline, below the arrow display threshold. The threshold is a display setting, not a judgment of economic importance.` };
  }
  const p = polarity(metric, lens);
  const dir = direction === 'up' ? 'Up' : 'Down';
  if (p === 0) {
    const why = lens === 'investor' && (metric === 'cpr' || metric === 'cpr12' || metric === 'prepaid12')
      ? 'faster or slower repayment changes when the loan owner receives cash and can affect investment value; this simulator does not determine whether that is favorable for the owner'
      : 'this measure is not rated better or worse';
    return { direction, tone: 'neutral', word: 'not assessed', label: `${dir}; ${why}.` };
  }
  const good = (direction === 'up') === (p === 1);
  return { direction, tone: good ? 'good' : 'bad', word: good ? 'better' : 'worse', label: `${dir}, ${good ? 'better' : 'worse'} for the servicer.` };
}

/** Trend from a baseline and a scenario value. */
export function trendOf(metric: TrendMetric, base: number | null, scen: number | null, lens: Lens): Trend | null {
  if (base === null || scen === null) return null;
  return trendOfDelta(metric, scen - base, base, lens);
}
