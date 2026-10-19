/**
 * Strict import schemas. Unexpected fields are rejected, numbers must be finite, and
 * bounds come from the same BOUNDS table the engine uses.
 */
import { z } from 'zod';
import { BOUNDS, CHART_HORIZONS, IMPORT_LIMITS } from '../domain/config';
import { DIMENSIONS } from '../domain/segments';
import { SUPPORTED_SCHEMA_VERSIONS } from '../domain/version';

const fin = () => z.number().refine(Number.isFinite, 'must be a finite number');
const ranged = (b: { min: number; max: number }) => fin().min(b.min).max(b.max);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');
const hash = z.string().regex(/^[0-9a-f]{64}$/, 'must be a 64-character hex hash');
const safeName = z.string().min(1).max(120);
const schemaVersion = z.number().int().refine((v) => SUPPORTED_SCHEMA_VERSIONS.includes(v), 'unsupported schema version');

export const ratePathSchema = z.strictObject({
  offerRate: ranged(BOUNDS.offerRate),
  shockBps: ranged(BOUNDS.shockBps),
  shape: z.enum(['immediate', 'ramp12', 'custom']),
  customPath: z.array(ranged(BOUNDS.offerRate)).max(600),
});

export const scenarioSchema = z.strictObject({
  schemaVersion,
  modelVersion: z.string().max(64),
  portfolioHash: hash,
  baselineId: z.string().max(64).nullable(),
  scenarioId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: safeName,
  valuationMonth: month,
  mode: z.enum(['behavioral', 'fixedCpr', 'psa']),
  ratePath: ratePathSchema,
  behavioralParameters: z.strictObject({
    turnoverMultiplier: ranged(BOUNDS.turnoverMultiplier),
    refiMultiplier: ranged(BOUNDS.refiMultiplier),
    frictionBps: ranged(BOUNDS.frictionBps),
    burnout: z.boolean(),
    seasonality: z.enum(['flat', 'seasonal']),
  }),
  prepaymentParameters: z.strictObject({
    fixedCpr: ranged(BOUNDS.fixedCpr),
    psaPercent: ranged(BOUNDS.psaPercent),
  }),
  servicingParameters: z.strictObject({
    feeOverrideBps: ranged(BOUNDS.feeBps).nullable(),
    costPerLoan: ranged(BOUNDS.costPerLoan).nullable(),
    discountRate: ranged(BOUNDS.discountRate),
  }),
  recaptureParameters: z.strictObject({
    share: ranged(BOUNDS.recaptureShare),
    contributionPerLoan: ranged(BOUNDS.contributionPerLoan),
    campaignCost: ranged(BOUNDS.campaignCost),
  }),
  seed: z.number().int().min(0).max(2 ** 32 - 1),
  chartHorizon: z.union(CHART_HORIZONS.map((h) => z.literal(h)) as [z.ZodLiteral<12>, z.ZodLiteral<36>, z.ZodLiteral<60>]),
});

export const loanSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'must be letters, digits, dash or underscore'),
  asOfMonth: month,
  originalBalance: fin().positive().max(5_000_000),
  currentBalance: fin().positive().max(5_000_000),
  noteRate: fin().min(0).max(0.2),
  originalTerm: z.number().int().min(1).max(480),
  ageMonths: z.number().int().min(0).max(479),
  remainingTerm: z.number().int().min(1).max(480),
  contractualPayment: fin().positive(),
  servicingFeeBps: ranged(BOUNDS.feeBps),
  annualCost: ranged(BOUNDS.costPerLoan),
  state: z.string().regex(/^[A-Z]{2}$/, 'must be a two-letter state code'),
  refiPropensity: fin().min(0.5).max(1.5),
  cohort: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
});

export const portfolioMetaSchema = z.strictObject({
  schemaVersion,
  generatorVersion: z.string().max(64),
  seed: z.number().int().min(0),
  synthetic: z.literal(true, { message: 'Only synthetic portfolios can be imported in this release.' }),
  createdDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hash,
  presetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: safeName,
  description: z.string().max(500),
  asOfMonth: month,
});

const filterSchema = z.strictObject(
  Object.fromEntries(DIMENSIONS.map((d) => [d, z.array(z.string().regex(/^[A-Za-z0-9_-]{1,20}$/)).max(60).optional()])) as Record<
    (typeof DIMENSIONS)[number],
    z.ZodOptional<z.ZodArray<z.ZodString>>
  >,
);

const noteSchema = z.strictObject({
  whatChanged: z.string().max(4000),
  evidence: z.string().max(4000),
  investigateNext: z.string().max(4000),
});

const summaryNumber = fin().nullable();
export const savedResultSchema = z.strictObject({
  scenarioId: z.string().max(64),
  inputHash: hash,
  runKey: hash,
  summary: z.record(z.string(), summaryNumber),
});

export const scenarioFileSchema = z.strictObject({
  fileType: z.literal('mortgage-prepayment-lab/scenarios'),
  schemaVersion,
  modelVersion: z.string().max(64),
  exportedAt: z.string().max(40),
  portfolio: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('preset'), presetId: z.string().max(64), hash }),
    z.strictObject({ kind: z.literal('embedded'), meta: portfolioMetaSchema, loans: z.array(loanSchema).min(1).max(IMPORT_LIMITS.maxLoans) }),
  ]),
  baselineId: z.string().max(64),
  scenarios: z.array(scenarioSchema).min(1).max(4),
  filter: filterSchema,
  notes: z.record(z.string(), noteSchema),
  results: z.array(savedResultSchema).max(4),
});

export type ScenarioFile = z.infer<typeof scenarioFileSchema>;
