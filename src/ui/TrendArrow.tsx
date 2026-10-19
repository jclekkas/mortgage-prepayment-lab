import type { Trend } from '../domain/trend';

const GLYPH = { up: '▲', down: '▼', flat: '►' } as const;

/**
 * A small arrow for a change versus the baseline. Shape shows direction. Color is used only for
 * servicer cash-flow and value measures (green improved, red worsened); activity measures are grey
 * (direction only); yellow is a small or no change. A short visible word and a screen-reader
 * sentence carry the same meaning, so color is never the only cue.
 */
export function TrendArrow({ trend }: { trend: Trend | null }) {
  if (!trend) return null;
  return (
    <span className={`trend trend-${trend.tone}`} data-testid="trend" data-direction={trend.direction} data-tone={trend.tone}>
      <span aria-hidden="true">
        {GLYPH[trend.direction]}
        {trend.word && ` ${trend.word}`}
      </span>
      <span className="sr-only">{trend.label}</span>
    </span>
  );
}

/** Key for the arrows. */
export function TrendKey() {
  return (
    <p className="trend-key muted">
      Arrows show the direction of each change versus the baseline. Prepayment speed, prepaid principal, balance and average life show direction only{' '}
      (<span className="trend trend-neutral"><span aria-hidden="true">▲</span> faster</span>, <span className="trend trend-neutral"><span aria-hidden="true">▼</span> lower</span>):
      they are not good or bad by themselves. Servicer cash-flow and value measures are judged on their own numbers:{' '}
      <span className="trend trend-good"><span aria-hidden="true">▲</span> higher</span> or <span className="trend trend-good"><span aria-hidden="true">▲</span> smaller loss</span> improved,{' '}
      <span className="trend trend-bad"><span aria-hidden="true">▼</span> lower</span> worsened. A smaller loss is still a loss.{' '}
      <span className="trend trend-flat"><span aria-hidden="true">►</span> small change</span> means nonzero but below a display threshold set for readability, not economic importance;{' '}
      <span className="trend trend-flat"><span aria-hidden="true">►</span> no change</span> means zero.
    </p>
  );
}
