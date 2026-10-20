import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { portfolioHash } from '../src/data/generator';
import { defaultScenario } from '../src/domain/scenario';
import type { Loan, Portfolio, ScenarioInput } from '../src/domain/types';
import { GENERATOR_VERSION, SCHEMA_VERSION } from '../src/domain/version';

export function makePortfolio(loans: Loan[], asOfMonth = '2026-09'): Portfolio {
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      generatorVersion: GENERATOR_VERSION,
      seed: 0,
      synthetic: true,
      createdDate: '2026-10-18',
      hash: portfolioHash(loans, asOfMonth, 0, GENERATOR_VERSION),
      presetId: 'test',
      name: 'Test book',
      description: 'Test fixture',
      asOfMonth,
    },
    loans,
  };
}

export function scenarioFor(p: Portfolio, over: Partial<ScenarioInput> = {}): ScenarioInput {
  return { ...defaultScenario(p.meta.hash, p.meta.asOfMonth), ...over };
}

/** A loan built from first principles (independent of the generator). */
export function simpleLoan(over: Partial<Loan> & { id: string }): Loan {
  const orig = over.originalBalance ?? 300_000;
  const rate = over.noteRate ?? 0.065;
  const term = over.originalTerm ?? 360;
  const age = over.ageMonths ?? 0;
  const r = rate / 12;
  const pay = r === 0 ? orig / term : (orig * r) / (1 - (1 + r) ** -term);
  let b = orig;
  for (let k = 0; k < age; k++) b -= Math.min(b, Math.max(0, pay - b * r));
  return {
    asOfMonth: '2026-09',
    originalBalance: orig,
    currentBalance: b,
    noteRate: rate,
    originalTerm: term,
    ageMonths: age,
    remainingTerm: term - age,
    contractualPayment: pay,
    servicingFeeBps: 25,
    annualCost: 100,
    state: 'TX',
    refiPropensity: 1,
    cohort: 'test',
    ...over,
  };
}

interface PyScenario {
  mode: ScenarioInput['mode'];
  valuationMonth: string;
  ratePath: ScenarioInput['ratePath'];
  behavioral: ScenarioInput['behavioralParameters'];
  fixedCpr: number;
  psaPercent: number;
  feeOverrideBps: number | null;
  costPerLoan: number | null;
  discountRate: number;
  recapture: ScenarioInput['recaptureParameters'];
}

export interface ReferenceFixture {
  provenance: string;
  loans: Loan[];
  scenario: PyScenario;
  ledgerMonths: Record<string, number | null>[];
  horizon: number;
  summary: Record<string, number | null>;
}

export function loadReference(name: string): { fixture: ReferenceFixture; portfolio: Portfolio; scenario: ScenarioInput } {
  const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', `reference-${name}.json`), 'utf8')) as ReferenceFixture;
  const portfolio = makePortfolio(fixture.loans);
  const py = fixture.scenario;
  const scenario = scenarioFor(portfolio, {
    mode: py.mode,
    ratePath: py.ratePath,
    behavioralParameters: py.behavioral,
    prepaymentParameters: { fixedCpr: py.fixedCpr, psaPercent: py.psaPercent },
    servicingParameters: { feeOverrideBps: py.feeOverrideBps, costPerLoan: py.costPerLoan, discountRate: py.discountRate },
    recaptureParameters: py.recapture,
  });
  return { fixture, portfolio, scenario };
}

/** Relative-or-absolute closeness. */
export function close(actual: number, expected: number, rel = 1e-9, abs = 1e-6): boolean {
  return Math.abs(actual - expected) <= Math.max(abs, rel * Math.abs(expected));
}
