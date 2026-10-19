/**
 * Reproduction check for imported scenario files: re-run results are compared with the
 * results saved in the file, metric by metric.
 *
 * Tolerance: a number matches when |actual - saved| <= max(ABS_TOL, REL_TOL x max(|actual|, |saved|)).
 * The engine is deterministic, so identical inputs reproduce bit-for-bit on one platform;
 * the tolerance only absorbs floating-point differences across JavaScript engines. A null
 * ("not applicable") matches only null. Run keys and input hashes must match exactly.
 */
import type { RunOutput } from '../domain/types';

export const REPRO_REL_TOL = 1e-9;
export const REPRO_ABS_TOL = 1e-6;

export interface SavedResult {
  scenarioId: string;
  inputHash: string;
  runKey: string;
  summary: Record<string, number | null>;
}

export interface MetricDifference {
  metric: string;
  saved: number | null | 'missing';
  actual: number | null | 'missing';
}

export interface ScenarioVerification {
  scenarioId: string;
  ok: boolean;
  /** Identity problems (missing run, run key or input hash mismatch). */
  problems: string[];
  differences: MetricDifference[];
}

export interface ReproductionReport {
  matched: number;
  total: number;
  scenarios: ScenarioVerification[];
}

export function numbersMatch(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= Math.max(REPRO_ABS_TOL, REPRO_REL_TOL * Math.max(Math.abs(a), Math.abs(b)));
}

export function compareSummaries(saved: Record<string, number | null>, actual: Record<string, number | null>): MetricDifference[] {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(saved)])].sort();
  const diffs: MetricDifference[] = [];
  for (const k of keys) {
    const inSaved = Object.prototype.hasOwnProperty.call(saved, k);
    const inActual = Object.prototype.hasOwnProperty.call(actual, k);
    const s = inSaved ? saved[k] : 'missing';
    const a = inActual ? actual[k] : 'missing';
    if (s === 'missing' || a === 'missing') diffs.push({ metric: k, saved: s, actual: a });
    else if (s === null || a === null) {
      if (s !== a) diffs.push({ metric: k, saved: s, actual: a });
    } else if (!numbersMatch(a, s)) diffs.push({ metric: k, saved: s, actual: a });
  }
  return diffs;
}

export function verifyReproduction(saved: SavedResult[], outputs: RunOutput[]): ReproductionReport {
  const scenarios = saved.map((r): ScenarioVerification => {
    const out = outputs.find((o) => o.scenarioId === r.scenarioId);
    if (!out) return { scenarioId: r.scenarioId, ok: false, problems: ['No re-run result for this scenario.'], differences: [] };
    const problems: string[] = [];
    if (out.inputHash !== r.inputHash) problems.push('Input hash differs: the assumptions are not the ones saved.');
    if (out.runKey !== r.runKey) problems.push('Run key differs: the assumptions or population are not the ones saved.');
    const differences = compareSummaries(r.summary, out.summary as unknown as Record<string, number | null>);
    return { scenarioId: r.scenarioId, ok: problems.length === 0 && differences.length === 0, problems, differences };
  });
  return { matched: scenarios.filter((s) => s.ok).length, total: scenarios.length, scenarios };
}
