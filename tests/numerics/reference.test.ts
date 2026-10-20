import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/domain/engine';
import { close, loadReference } from '../helpers';

const NAMES = ['one-loan-fixed', 'one-loan-behavioral', 'multi-behavioral', 'multi-custom-path', 'multi-psa', 'edge-zero-rate'];
const LEDGER_KEYS: [string, string][] = [
  ['beg', 'beginningUpb'],
  ['sched', 'scheduledPrincipal'],
  ['prep', 'prepaidPrincipal'],
  ['end', 'endingUpb'],
  ['interest', 'noteInterest'],
  ['count', 'beginningLoans'],
  ['volN', 'voluntaryPayoffs'],
  ['refiN', 'refiPayoffs'], // null in fixed CPR and PSA modes: cause not identified
  ['unclN', 'unclassifiedPayoffs'],
  ['fee', 'grossFee'],
  ['cost', 'operatingCost'],
  ['net', 'netServicing'],
  ['smm', 'smm'],
  ['cpr', 'cpr'],
];

describe('engine reconciles to the independent Python reference model', () => {
  for (const name of NAMES) {
    it(name, () => {
      const { fixture, portfolio, scenario } = loadReference(name);
      const out = runScenario(portfolio, scenario);
      expect(out.ledger.length).toBe(fixture.horizon);
      for (const ref of fixture.ledgerMonths) {
        const row = out.ledger[(ref.t as number) - 1] as unknown as Record<string, number | null>;
        for (const [pk, tk] of LEDGER_KEYS) {
          const e = ref[pk];
          const a = row[tk];
          if (e === null) expect(a, `${name} t=${ref.t} ${tk}`).toBeNull();
          else expect(close(a as number, e, 1e-9, 1e-7), `${name} t=${ref.t} ${tk}: ${a} vs ${e}`).toBe(true);
        }
      }
      for (const [k, e] of Object.entries(fixture.summary)) {
        const a = (out.summary as unknown as Record<string, number | null>)[k];
        if (e === null) expect(a, `${name} summary ${k}`).toBeNull();
        else expect(close(a as number, e, 1e-9, 1e-6), `${name} summary ${k}: ${a} vs ${e}`).toBe(true);
      }
    });
  }
});
