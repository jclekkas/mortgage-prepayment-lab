/**
 * Worker job execution: sensitivity and grid jobs must stop promptly on cancel (defect
 * D1) and give the same answers as the synchronous functions.
 */
import { describe, expect, it } from 'vitest';
import { generatePortfolio } from '../../src/data/generator';
import { loadPreset } from '../../src/data/presets';
import { oneFactorSensitivities, sensitivityGrid } from '../../src/domain/sensitivity';
import { Cancelled, execute, type ExecHooks } from '../../src/worker/execute';
import { scenarioFor } from '../helpers';

const mixed = loadPreset('mixed');

function hooksCancellingAfter(progressCalls: number): ExecHooks & { calls: () => number } {
  let n = 0;
  return { isCancelled: () => n >= progressCalls, progress: () => { n++; }, calls: () => n };
}

describe('cancellable worker jobs', () => {
  for (const kind of ['grid', 'sensitivity'] as const) {
    it(`${kind}: a cancel stops the job within one chunk instead of finishing it`, async () => {
      const big = generatePortfolio({ loanCount: 4000 }); // 16 chunks per run
      const hooks = hooksCancellingAfter(3);
      await expect(execute(big, { kind, scenario: scenarioFor(big), filter: {} }, hooks)).rejects.toBeInstanceOf(Cancelled);
      // Cancel was visible after the 3rd chunk and checked before the 4th started.
      expect(hooks.calls()).toBe(3);
    });
  }

  it('a cancel is not swallowed as a per-cell grid error', async () => {
    const hooks = hooksCancellingAfter(1);
    await expect(execute(mixed, { kind: 'grid', scenario: scenarioFor(mixed, { mode: 'fixedCpr' }), filter: {} }, hooks)).rejects.toBeInstanceOf(Cancelled);
  });

  it('progress is monotonic and finishes at 100%', async () => {
    const seen: number[] = [];
    await execute(mixed, { kind: 'sensitivity', scenario: scenarioFor(mixed), filter: {} }, { isCancelled: () => false, progress: (d, t) => seen.push(d / t) });
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('chunked results equal the synchronous functions exactly', async () => {
    const never: ExecHooks = { isCancelled: () => false, progress: () => {} };
    const s = scenarioFor(mixed);
    const filter = { coupon: ['5to6', 'ge7'] };
    const sens = (await execute(mixed, { kind: 'sensitivity', scenario: s, filter }, never)).result;
    expect(sens).toEqual(oneFactorSensitivities(mixed, s, filter));
    const grid = (await execute(mixed, { kind: 'grid', scenario: s, filter }, never)).result;
    expect(grid).toEqual(sensitivityGrid(mixed, s, filter));
  });
});
