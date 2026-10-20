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

/** Key for the tags. The loan-owner view shows direction only, so its key has no better/worse colors. */
export function TrendKey({ owner }: { owner?: boolean }) {
  if (owner) {
    return (
      <p className="trend-key muted">
        Shape shows direction (<span className="trend trend-neutral"><span aria-hidden="true">▲</span> higher</span>, <span className="trend trend-neutral"><span aria-hidden="true">▼</span> shorter</span>).
        These measures describe when cash arrives; they are not good or bad by themselves.{' '}
        <span className="trend trend-flat"><span aria-hidden="true">►</span> small change</span> is nonzero but below a display threshold; <span className="trend trend-flat"><span aria-hidden="true">►</span> no change</span> is zero.
      </p>
    );
  }
  return (
    <p className="trend-key muted">
      Shape shows direction. Prepayment speed, prepaid principal, balance and average life get a direction word only{' '}
      (<span className="trend trend-neutral"><span aria-hidden="true">▲</span> faster</span>); they are not good or bad by themselves. Servicer cash-flow and value measures
      say whether they improved (<span className="trend trend-good"><span aria-hidden="true">▲</span> higher</span>, <span className="trend trend-good"><span aria-hidden="true">▲</span> smaller loss</span>) or
      worsened (<span className="trend trend-bad"><span aria-hidden="true">▼</span> lower</span>) for the servicer; a smaller loss is still a loss.{' '}
      <span className="trend trend-flat"><span aria-hidden="true">►</span> small change</span> is nonzero but below a display threshold, not a judgment of importance;{' '}
      <span className="trend trend-flat"><span aria-hidden="true">►</span> no change</span> is zero.
    </p>
  );
}
