/**
 * Deterministic synthetic portfolio generator. Balances are derived from the
 * contractual schedule (original balance, rate and age), never drawn independently,
 * so payment, balance and remaining term are always mutually consistent.
 * No names, addresses, SSNs or real account identifiers are generated.
 */
import { addMonths } from '../domain/calendar';
import { hashValue } from '../domain/hash';
import { balanceAfter, levelPayment } from '../domain/math';
import type { Loan, Portfolio } from '../domain/types';
import { GENERATOR_VERSION, SCHEMA_VERSION } from '../domain/version';
import { intBetween, mulberry32, normal, uniform } from './prng';

export interface CohortSpec {
  key: string;
  label: string;
  rate: [number, number];
  age: [number, number];
}

export const COHORTS: CohortSpec[] = [
  { key: 'low-seasoned', label: 'Low coupon, seasoned', rate: [0.0275, 0.0375], age: [48, 72] },
  { key: 'mid-midlife', label: 'Middle coupon, mid-life', rate: [0.045, 0.055], age: [24, 42] },
  { key: 'high-recent', label: 'High coupon, recent', rate: [0.0675, 0.0775], age: [3, 15] },
];

const STATES: [string, number][] = [
  ['CA', 0.16], ['TX', 0.11], ['FL', 0.1], ['NY', 0.07], ['IL', 0.05], ['PA', 0.05], ['OH', 0.05],
  ['GA', 0.05], ['NC', 0.05], ['WA', 0.05], ['AZ', 0.05], ['CO', 0.05], ['MI', 0.04], ['NJ', 0.04], ['VA', 0.08],
];

export interface GeneratorConfig {
  seed: number;
  loanCount: number;
  /** Share of loans in each cohort, in COHORTS order. Normalized; default equal thirds. */
  cohortWeights: [number, number, number];
  asOfMonth: string;
  servicingFeeBps: number;
  annualCost: number;
  /** Median original balance in dollars. */
  medianOriginalBalance: number;
  /** Lognormal spread of original balances (sigma). 0 makes every balance the median. */
  balanceSigma: number;
  presetId: string;
  name: string;
  description: string;
  createdDate: string;
}

export const DEFAULT_GENERATOR: GeneratorConfig = {
  seed: 42,
  loanCount: 1000,
  cohortWeights: [1, 1, 1],
  asOfMonth: '2026-09',
  servicingFeeBps: 25,
  annualCost: 100,
  medianOriginalBalance: 330_000,
  balanceSigma: 0.35,
  presetId: 'custom',
  name: 'Synthetic book',
  description: 'Synthetic portfolio',
  createdDate: '2026-10-18',
};

function pickState(rand: () => number): string {
  const x = rand();
  let acc = 0;
  for (const [s, p] of STATES) {
    acc += p;
    if (x < acc) return s;
  }
  return STATES[STATES.length - 1][0];
}

/** Largest-remainder allocation so cohort counts always sum to loanCount. */
function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

const toCents = (v: number) => Math.round(v * 100) / 100;

export function portfolioHash(loans: readonly Loan[], asOfMonth: string, seed: number, generatorVersion: string): string {
  return hashValue({ loans, asOfMonth, seed, generatorVersion });
}

export function generatePortfolio(partial: Partial<GeneratorConfig> = {}): Portfolio {
  const cfg = { ...DEFAULT_GENERATOR, ...partial };
  const rand = mulberry32(cfg.seed);
  const counts = allocate(cfg.loanCount, cfg.cohortWeights);
  const loans: Loan[] = [];
  let seq = 0;
  COHORTS.forEach((spec, ci) => {
    for (let j = 0; j < counts[ci]; j++) {
      seq++;
      // Note rates on a 1/8 point grid, as originated.
      const rate = Math.round(uniform(rand, spec.rate[0], spec.rate[1]) * 800) / 800;
      const age = intBetween(rand, spec.age[0], spec.age[1]);
      const draw = normal(rand); // always drawn so the sequence does not depend on sigma
      const z = cfg.balanceSigma > 0 ? draw : 0;
      const orig = Math.min(1_200_000, Math.max(60_000, Math.round((cfg.medianOriginalBalance * Math.exp(cfg.balanceSigma * z)) / 1000) * 1000));
      const term = 360;
      // Amounts are rounded to cents, as real loan records are. Unrounded, Math.pow's last digit differs
      // between JavaScript engines, so different browsers built different loans and fingerprints.
      const payment = toCents(levelPayment(orig, rate, term));
      const current = toCents(balanceAfter(orig, rate, payment, age));
      loans.push({
        id: `SYN-${String(cfg.seed).padStart(4, '0')}-${String(seq).padStart(5, '0')}`,
        asOfMonth: cfg.asOfMonth,
        originalBalance: orig,
        currentBalance: current,
        noteRate: rate,
        originalTerm: term,
        ageMonths: age,
        remainingTerm: term - age,
        contractualPayment: payment,
        servicingFeeBps: cfg.servicingFeeBps,
        annualCost: cfg.annualCost,
        state: pickState(rand),
        refiPropensity: Math.round(uniform(rand, 0.5, 1.5) * 1000) / 1000,
        cohort: spec.key,
      });
    }
  });
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      generatorVersion: GENERATOR_VERSION,
      seed: cfg.seed,
      synthetic: true,
      createdDate: cfg.createdDate,
      hash: portfolioHash(loans, cfg.asOfMonth, cfg.seed, GENERATOR_VERSION),
      presetId: cfg.presetId,
      name: cfg.name,
      description: cfg.description,
      asOfMonth: cfg.asOfMonth,
    },
    loans,
  };
}

/** Origination month of a loan, for display. */
export function originationMonth(loan: Loan): string {
  return addMonths(loan.asOfMonth, -loan.ageMonths);
}
