/**
 * Job execution shared by the Web Worker and the in-thread fallback. Long jobs yield
 * between chunks so a cancel message can be processed.
 */
import { accumulate, createAccumulator, EngineInputError, finalize, loanLedger, runScenario } from '../domain/engine';
import { hashValue } from '../domain/hash';
import { scenarioInputHash } from '../domain/scenario';
import { normalizeFilter } from '../domain/segments';
import { oneFactorSensitivities, sensitivityGrid } from '../domain/sensitivity';
import type { Portfolio, RunOutput } from '../domain/types';
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
      const acc = createAccumulator(portfolio, job.scenario, job.filter);
      const total = acc.population.length;
      for (let start = 0; start < total; start += CHUNK) {
        accumulate(acc, start, start + CHUNK);
        hooks.progress(Math.min(start + CHUNK, total), total);
        if (start + CHUNK < total) {
          await yieldNow();
          if (hooks.isCancelled()) throw new Cancelled();
        }
      }
      const out = finalize(acc);
      remember(key, out);
      return { result: out, cached: false };
    }
    case 'loan':
      return { result: loanLedger(portfolio, job.scenario, job.loanId), cached: false };
    case 'sensitivity':
      return { result: oneFactorSensitivities(portfolio, job.scenario, job.filter), cached: false };
    case 'grid': {
      // The grid runs cell by cell; yield between cells for cancellation.
      const res = sensitivityGrid(portfolio, job.scenario, job.filter, (d, t) => hooks.progress(d, t));
      return { result: res, cached: false };
    }
  }
}
