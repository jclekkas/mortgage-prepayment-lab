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
      Arrows show the direction of each change versus the baseline. Their color shows the effect for the servicer:{' '}
      <span className="trend trend-good"><span aria-hidden="true">▲</span> green</span> better,{' '}
      <span className="trend trend-bad"><span aria-hidden="true">▼</span> red</span> worse,{' '}
      <span className="trend trend-flat"><span aria-hidden="true">►</span> yellow</span> little or no change,{' '}
      <span className="trend trend-neutral"><span aria-hidden="true">▲</span> grey</span> neither in itself.
      {investor
        ? ' In the loan owner view, faster prepayment is grey: it changes when principal comes back, not its value by itself.'
        : ' Faster prepayment is red for the servicer because payoffs end fee income.'}
    </p>
  );
}
