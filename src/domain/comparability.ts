/**
 * Whether results may be compared, printed or exported together. A result is current
 * only if it was computed for the portfolio, valuation month and normalized population
 * filter now in effect. Every comparison surface (headline cards, charts, decision room,
 * brief, exports) goes through these functions, so none can mix populations.
 */
import { canonicalJson } from './hash';
import { describeFilter, normalizeFilter } from './segments';
import type { Portfolio, PopulationFilter, RunOutput } from './types';

export interface PopulationContext {
  portfolioHash: string;
  valuationMonth: string;
  /** Canonical JSON of the normalized filter. */
  filterKey: string;
  filter: PopulationFilter;
}

export function filterKey(filter: PopulationFilter): string {
  return canonicalJson(normalizeFilter(filter));
}

export function populationContext(portfolio: Portfolio, filter: PopulationFilter): PopulationContext {
  return { portfolioHash: portfolio.meta.hash, valuationMonth: portfolio.meta.asOfMonth, filterKey: filterKey(filter), filter: normalizeFilter(filter) };
}

/** null when the result is current; otherwise a plain reason it is not. */
export function stalenessReason(out: RunOutput | null, ctx: PopulationContext): string | null {
  if (!out) return 'No result has been calculated yet.';
  if (out.portfolioHash !== ctx.portfolioHash) return 'This result was calculated for a different portfolio.';
  if (out.valuationMonth !== ctx.valuationMonth) return `This result uses valuation month ${out.valuationMonth}, not ${ctx.valuationMonth}.`;
  if (filterKey(out.population.filter) !== ctx.filterKey) {
    return `This result was calculated for a different population (${describeFilter(out.population.filter)}), not the current one (${describeFilter(ctx.filter)}).`;
  }
  return null;
}

export function isCurrent(out: RunOutput | null, ctx: PopulationContext): out is RunOutput {
  return stalenessReason(out, ctx) === null;
}

export type RunPhase = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export interface ComparisonItem {
  id: string;
  label: string;
  output: RunOutput | null;
  phase: RunPhase;
}

export interface ItemAssessment extends ComparisonItem {
  current: boolean;
  /** Why the item is excluded, including whether a retained result is from a cancelled, failed or in-progress recalculation. */
  reason: string | null;
}

export interface ComparisonAssessment {
  /** True only when every item has a result for the current portfolio, valuation month and population. */
  comparable: boolean;
  items: ItemAssessment[];
  /** One line per excluded item, for display. */
  blockers: string[];
}

const PHASE_NOTE: Record<RunPhase, string> = {
  idle: '',
  running: 'Recalculating for the current population. ',
  done: '',
  error: 'The recalculation failed; the retained result is not used. ',
  cancelled: 'The recalculation was cancelled; the retained result is not used. ',
};

export function assessComparison(items: ComparisonItem[], ctx: PopulationContext): ComparisonAssessment {
  const assessed = items.map((it): ItemAssessment => {
    const stale = stalenessReason(it.output, ctx);
    // A result for the current population stays usable while a re-run for the same
    // population is in progress; input edits are labeled "Previous run" elsewhere.
    const current = stale === null;
    const reason = current ? null : `${PHASE_NOTE[it.phase]}${stale}`.trim();
    return { ...it, current, reason };
  });
  return {
    comparable: assessed.length > 0 && assessed.every((a) => a.current),
    items: assessed,
    blockers: assessed.filter((a) => !a.current).map((a) => `${a.label}: ${a.reason}`),
  };
}
