/// <reference lib="webworker" />
import { EngineInputError } from '../domain/engine';
import type { Portfolio } from '../domain/types';
import { Cancelled, execute } from './execute';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let portfolio: Portfolio | null = null;
const cancelled = new Set<number>();
const post = (m: FromWorker) => self.postMessage(m);

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'setPortfolio') {
    portfolio = msg.portfolio;
    return;
  }
  if (msg.type === 'cancel') {
    cancelled.add(msg.id);
    return;
  }
  const { id, job } = msg;
  try {
    const { result, cached } = await execute(portfolio, job, {
      isCancelled: () => cancelled.has(id),
      progress: (done, total) => post({ type: 'progress', id, done, total }),
    });
    if (cancelled.has(id)) post({ type: 'cancelled', id });
    else post({ type: 'result', id, result, cached });
  } catch (e) {
    if (e instanceof Cancelled) post({ type: 'cancelled', id });
    else post({ type: 'error', id, message: (e as Error).message, fields: e instanceof EngineInputError ? e.fields : undefined });
  } finally {
    cancelled.delete(id);
  }
};
