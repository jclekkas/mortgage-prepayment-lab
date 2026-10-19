/**
 * Direction and, where the model establishes it, economic effect of a change versus the baseline.
 * Display only.
 *
 * Activity measures (prepayment speed, prepaid principal, balance, average life) get a direction
 * only: "faster/slower", "higher/lower", "longer/shorter". Whether faster prepayment helps or hurts
 * depends on the loans' margins, which the cash-flow and value measures already capture; with a
 * zero servicing fee, for example, faster payoff raises servicing value.
 *
 * Servicer cash-flow and value measures are judged by their own sign: an increase is an
 * improvement for the servicer over that measure's horizon. A rise from one loss to a smaller loss
 * is labeled "smaller loss", never as a profit.
 */
export type TrendMetric =
  | 'upb' | 'cpr' | 'cpr12' | 'prepaid12' | 'wal' | 'ownerInterest12'
  | 'net12' | 'npv' | 'npvBps' | 'recapturePv' | 'combined';
export type Direction = 'up' | 'down' | 'flat';
/** good/bad: improved/worsened for the servicer on this measure; flat: no or small change; neutral: direction only. */
export type Tone = 'good' | 'bad' | 'flat' | 'neutral';

export interface Trend {
  direction: Direction;
  tone: Tone;
  /** Short visible word next to the arrow. */
  word: string;
  /** Full sentence for screen readers. */
  label: string;
}

/** What each judged measure covers, for labels: perspective and time horizon. */
const VALUE_SCOPE: Partial<Record<TrendMetric, string>> = {
  net12: 'net servicing cash flow over the next 12 months',
  npv: 'lifetime servicing value in today’s dollars',
  npvBps: 'lifetime servicing value per dollar of balance',
  recapturePv: 'recapture contribution from new loans, in today’s dollars',
  combined: 'servicing value plus recapture contribution, in today’s dollars',
};

const DIRECTION_WORDS: Partial<Record<TrendMetric, [string, string]>> = {
  cpr: ['faster', 'slower'],
  cpr12: ['faster', 'slower'],
  wal: ['longer', 'shorter'],
};

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
      // Dollars: under $1, or under 0.5% of the baseline's size when it is known.
      return a < 1 || (base !== null && base !== 0 && a / Math.abs(base) < 0.005);
  }
}

/** A difference this close to zero (relative to the baseline, or absolute when it is unknown) is "no change". */
export const ZERO_TOLERANCE = 1e-9;

function isZero(delta: number, base: number | null): boolean {
  return Math.abs(delta) <= ZERO_TOLERANCE * Math.max(1, Math.abs(base ?? 0));
}

/** Word for a change in a judged servicer measure, honest about losses. Base may be unknown. */
function valueWord(delta: number, base: number | null): string {
  if (base === null) return delta > 0 ? 'higher' : 'lower';
  const scen = base + delta;
  if (delta > 0) {
    if (base < 0 && scen < 0) return 'smaller loss';
    if (base < 0) return 'loss to gain';
    return 'higher';
  }
  if (base > 0 && scen < 0) return 'gain to loss';
  if (base <= 0) return 'larger loss';
  return 'lower';
}

/** Trend from a difference. `base` is the baseline level when known. Returns null when the difference is not available. */
export function trendOfDelta(metric: TrendMetric, delta: number | null, base: number | null): Trend | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (isZero(delta, base)) return { direction: 'flat', tone: 'flat', word: 'no change', label: 'No change from the baseline.' };
  const direction: Direction = delta > 0 ? 'up' : 'down';
  if (isSmall(metric, delta, base)) {
    return { direction: 'flat', tone: 'flat', word: 'small change', label: `Small change (${direction}) from the baseline, below the arrow display threshold. The threshold is a display setting, not a judgment of economic importance.` };
  }
  const scope = VALUE_SCOPE[metric];
  if (!scope) {
    const [upWord, downWord] = DIRECTION_WORDS[metric] ?? ['higher', 'lower'];
    const word = direction === 'up' ? upWord : downWord;
    return { direction, tone: 'neutral', word, label: `${word[0].toUpperCase()}${word.slice(1)} than the baseline. Direction only: this measure is not good or bad by itself; its effect shows in the cash-flow and value measures.` };
  }
  const word = valueWord(delta, base);
  const improved = direction === 'up';
  const stillLoss = base !== null && base + delta < 0 && improved ? ' It is still a loss: an improvement is not a profit.' : '';
  return {
    direction,
    tone: improved ? 'good' : 'bad',
    word,
    label: `${improved ? 'Improved' : 'Worsened'} for the servicer (${word}) on ${scope}.${stillLoss}`,
  };
}

/** Trend from a baseline and a scenario value. */
export function trendOf(metric: TrendMetric, base: number | null, scen: number | null): Trend | null {
  if (base === null || scen === null) return null;
  return trendOfDelta(metric, scen - base, base);
}
