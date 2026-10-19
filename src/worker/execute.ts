/**
 * Job execution shared by the Web Worker and the in-thread fallback. Long jobs yield
 * between chunks so a cancel message can be processed.
 */
import { accumulate, createAccumulator, EngineInputError, finalize, loanLedger, runScenario } from '../domain/engine';
import { hashValue } from '../domain/hash';
import { scenarioInputHash } from '../domain/scenario';
import { normalizeFilter } from '../domain/segments';
import { assembleGrid, assembleSensitivities, planGrid, planSensitivities, type GridCellOutcome } from '../domain/sensitivity';
import type { Portfolio, PopulationFilter, RunOutput, ScenarioInput } from '../domain/types';
import { runValidation } from '../domain/validation';
import type { Job } from './protocol';

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

const CHUNK = 250;
const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

export interface ExecHooks {
  isCancelled: () => boolean;
  progress: (done: number, total: number) => void;
}

const cache = new Map<string, RunOutput>();
const CACHE_MAX = 24;

function remember(key: string, out: RunOutput) {
  cache.delete(key);
  cache.set(key, out);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/**
 * Project one scenario in chunks of CHUNK loans, yielding between chunks and throwing
 * Cancelled as soon as a cancel has arrived. `onLoans` reports loans done out of total.
 */
async function runChunked(
  portfolio: Portfolio,
  scenario: ScenarioInput,
  filter: PopulationFilter,
  hooks: ExecHooks,
  onLoans: (done: number, total: number) => void,
): Promise<RunOutput> {
  const acc = createAccumulator(portfolio, scenario, filter);
  const total = acc.population.length;
  for (let start = 0; start < total; start += CHUNK) {
    accumulate(acc, start, start + CHUNK);
    onLoans(Math.min(start + CHUNK, total), total);
    await yieldNow();
    if (hooks.isCancelled()) throw new Cancelled();
  }
  return finalize(acc);
}

/** Progress for a job made of `runs` scenario runs, on a 0..PROGRESS_SCALE scale. */
const PROGRESS_SCALE = 1000;
function multiRunProgress(hooks: ExecHooks, runs: number, runIndex: number) {
  return (done: number, total: number) =>
    hooks.progress(Math.round(((runIndex + (total ? done / total : 1)) / runs) * PROGRESS_SCALE), PROGRESS_SCALE);
}

export async function execute(portfolio: Portfolio | null, job: Job, hooks: ExecHooks): Promise<{ result: unknown; cached: boolean }> {
  if (job.kind === 'validation') return { result: runValidation(), cached: false };
  if (job.kind === 'runOn') return { result: runScenario(job.portfolio, job.scenario), cached: false };
  if (!portfolio) throw new EngineInputError('No portfolio is loaded.');
  switch (job.kind) {
    case 'run': {
      const key = hashValue({ input: scenarioInputHash(job.scenario), filter: normalizeFilter(job.filter), portfolio: portfolio.meta.hash });
      const hit = cache.get(key);
      if (hit && hit.scenarioId === job.scenario.scenarioId) return { result: hit, cached: true };
      if (hit) return { result: { ...hit, scenarioId: job.scenario.scenarioId }, cached: true };
      const out = await runChunked(portfolio, job.scenario, job.filter, hooks, hooks.progress);
      remember(key, out);
      return { result: out, cached: false };
    }
    case 'loan':
      return { result: loanLedger(portfolio, job.scenario, job.loanId), cached: false };
    case 'sensitivity': {
      // Base run plus one run per planned factor; every run is chunked and cancellable.
      const plan = planSensitivities(portfolio, job.scenario);
      const runs = 1 + plan.filter((p) => p.scenario).length;
      let k = 0;
      const base = (await runChunked(portfolio, job.scenario, job.filter, hooks, multiRunProgress(hooks, runs, k++))).summary;
      const results = [];
      for (const item of plan) {
        results.push(item.scenario ? (await runChunked(portfolio, item.scenario, job.filter, hooks, multiRunProgress(hooks, runs, k++))).summary : null);
      }
      return { result: assembleSensitivities(plan, base, results), cached: false };
    }
    case 'grid': {
      const plan = planGrid(job.scenario);
      const outcomes: GridCellOutcome[] = [];
      for (let i = 0; i < plan.cells.length; i++) {
        try {
          outcomes.push({ summary: (await runChunked(portfolio, plan.cells[i].scenario, job.filter, hooks, multiRunProgress(hooks, plan.cells.length, i))).summary });
        } catch (e) {
          if (e instanceof Cancelled) throw e; // a cancel stops the whole grid, not just one cell
          outcomes.push({ error: (e as Error).message });
        }
      }
      return { result: assembleGrid(plan, outcomes), cached: false };
    }
  }
}
