import type { Trend } from '../domain/trend';

const GLYPH = { up: '▲', down: '▼', flat: '►' } as const;

/**
 * A small arrow for a change versus the baseline. Shape shows direction; color shows the
 * effect for the servicer (green better, red worse, yellow flat, grey neither). A short
 * visible word and a screen-reader sentence carry the same meaning, so color is never the only cue.
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

/** One-line key for the arrows, worded for the chosen lens. */
export function TrendKey({ investor }: { investor: boolean }) {
  return (
    <p className="trend-key muted">
      Arrows show direction versus the baseline; color shows the effect for the servicer:{' '}
      <span className="trend trend-good"><span aria-hidden="true">▲</span> better</span>{' '}
      <span className="trend trend-bad"><span aria-hidden="true">▼</span> worse</span>{' '}
      <span className="trend trend-flat"><span aria-hidden="true">►</span> flat</span>{' '}
      <span className="trend trend-neutral"><span aria-hidden="true">▲</span> neither</span>.
      {investor
        ? ' For a loan owner, faster prepayment changes timing, not value, so it shows as neither.'
        : ' Faster prepayment counts as worse: payoffs end fee income.'}
    </p>
  );
}
