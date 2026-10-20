/**
 * Measured engine timing (PRD section 9). Prints p50/p95; asserts generous ceilings so
 * a CI runner slower than the reference laptop does not flake, while catching a
 * pathological regression. Record measured numbers in docs/PERFORMANCE.md.
 */
import { describe, expect, it } from 'vitest';
import { generatePortfolio } from '../../src/data/generator';
import { runScenario } from '../../src/domain/engine';
import { scenarioFor } from '../helpers';

function time(fn: () => void, runs: number): { p50: number; p95: number } {
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  return { p50: t[Math.floor(runs * 0.5)], p95: t[Math.min(runs - 1, Math.ceil(runs * 0.95) - 1)] };
}

describe('engine performance', () => {
  // 1,000 loans: generator default. Remaining terms up to 357 months.
  it('1,000 loans, full maturity, behavioral mode', () => {
    const p = generatePortfolio({ loanCount: 1000 });
    const s = scenarioFor(p, { ratePath: { offerRate: 0.0625, shockBps: -100, shape: 'ramp12', customPath: [] } });
    runScenario(p, s); // warm-up
    const r = time(() => runScenario(p, s), 20);
    console.log(`[perf] 1k loans behavioral p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.p95).toBeLessThan(1000);
  });
  it('10,000 loans, full maturity, behavioral mode', () => {
    const p = generatePortfolio({ loanCount: 10_000 });
    const s = scenarioFor(p);
    runScenario(p, s);
    const r = time(() => runScenario(p, s), 5);
    console.log(`[perf] 10k loans behavioral p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms`);
    expect(r.p95).toBeLessThan(5000);
  });
});
