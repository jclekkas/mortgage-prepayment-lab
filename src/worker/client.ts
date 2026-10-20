/**
 * Main-thread client for the engine worker. Each request gets a run id; callers keep
 * the latest id and ignore anything older, so a slow stale run can never overwrite a
 * newer one. Falls back to in-thread execution if workers are unavailable.
 */
import type { Portfolio } from '../domain/types';
import { Cancelled, execute } from './execute';
import type { FromWorker, Job, JobResultMap, ToWorker } from './protocol';

export class JobError extends Error {
  constructor(message: string, public readonly fields?: { field: string; message: string }[]) {
    super(message);
    this.name = 'JobError';
  }
}
export class JobCancelled extends Error {
  constructor() {
    super('Calculation cancelled');
    this.name = 'JobCancelled';
  }
}

interface Pending {
  resolve: (v: { result: unknown; cached: boolean }) => void;
  reject: (e: Error) => void;
  onProgress?: (done: number, total: number) => void;
}

export interface JobHandle<T> {
  id: number;
  promise: Promise<{ result: T; cached: boolean }>;
  cancel: () => void;
}

export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private portfolio: Portfolio | null = null;
  private localCancelled = new Set<number>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
      this.worker.onerror = (ev) => {
        ev.preventDefault();
        const err = new JobError(`The calculation engine stopped unexpectedly${ev.message ? `: ${ev.message}` : ''}.`);
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  get usesWorker(): boolean {
    return this.worker !== null;
  }

  setPortfolio(p: Portfolio): void {
    this.portfolio = p;
    this.send({ type: 'setPortfolio', portfolio: p });
  }

  request<K extends Job['kind']>(job: Extract<Job, { kind: K }>, onProgress?: (done: number, total: number) => void): JobHandle<JobResultMap[K]> {
    const id = this.nextId++;
    const promise = new Promise<{ result: unknown; cached: boolean }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
    }) as Promise<{ result: JobResultMap[K]; cached: boolean }>;
    if (this.worker) this.send({ type: 'job', id, job });
    else void this.runLocal(id, job);
    return { id, promise, cancel: () => this.cancel(id) };
  }

  cancel(id: number): void {
    if (!this.pending.has(id)) return;
    if (this.worker) this.send({ type: 'cancel', id });
    else this.localCancelled.add(id);
  }

  private send(m: ToWorker) {
    this.worker?.postMessage(m);
  }

  private onMessage(m: FromWorker) {
    const p = this.pending.get(m.id);
    if (!p) return;
    if (m.type === 'progress') {
      p.onProgress?.(m.done, m.total);
      return;
    }
    this.pending.delete(m.id);
    if (m.type === 'result') p.resolve({ result: m.result, cached: m.cached });
    else if (m.type === 'cancelled') p.reject(new JobCancelled());
    else p.reject(new JobError(m.message, m.fields));
  }

  private async runLocal(id: number, job: Job) {
    const p = this.pending.get(id)!;
    try {
      const r = await execute(this.portfolio, job, { isCancelled: () => this.localCancelled.has(id), progress: (d, t) => p.onProgress?.(d, t) });
      this.pending.delete(id);
      p.resolve(r);
    } catch (e) {
      this.pending.delete(id);
      p.reject(e instanceof Cancelled ? new JobCancelled() : new JobError((e as Error).message));
    } finally {
      this.localCancelled.delete(id);
    }
  }
}
