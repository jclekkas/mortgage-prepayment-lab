import type { ChartHorizon } from './config';

/** One synthetic, performing, fixed-rate, fully amortizing, first-lien loan. */
export interface Loan {
  id: string;
  /** 'YYYY-MM' month the record describes (end of month, after that month's payment). */
  asOfMonth: string;
  originalBalance: number;
  currentBalance: number;
  /** Annual note rate, decimal (0.065 = 6.5%). */
  noteRate: number;
  originalTerm: number;
  ageMonths: number;
  remainingTerm: number;
  /** Monthly principal and interest, fixed at origination. */
  contractualPayment: number;
  servicingFeeBps: number;
  /** Annual servicing cost for this loan while active, dollars. */
  annualCost: number;
  /** Two-letter US state code. */
  state: string;
  /** Synthetic refinance propensity, 0.5 to 1.5. */
  refiPropensity: number;
  /** Generator cohort label (for reference only; segments use observable fields). */
  cohort: string;
}

export interface PortfolioMeta {
  schemaVersion: number;
  generatorVersion: string;
  seed: number;
  synthetic: true;
  createdDate: string;
  hash: string;
  presetId: string;
  name: string;
  description: string;
  asOfMonth: string;
}

export interface Portfolio {
  meta: PortfolioMeta;
  loans: Loan[];
}

export type ModelMode = 'behavioral' | 'fixedCpr' | 'psa';
export type RatePathShape = 'immediate' | 'ramp12' | 'custom';

export interface RatePath {
  /** Starting mortgage offer rate level, annual decimal. */
  offerRate: number;
  /** Shock in basis points applied on top of the level. */
  shockBps: number;
  shape: RatePathShape;
  /** For 'custom': monthly offer rate levels (annual decimals) for months 1..n; last value persists. Shock is added. */
  customPath: number[];
}

export interface BehavioralParameters {
  turnoverMultiplier: number;
  refiMultiplier: number;
  frictionBps: number;
  burnout: boolean;
  seasonality: 'flat' | 'seasonal';
}

export interface PrepaymentParameters {
  fixedCpr: number;
  psaPercent: number;
}

export interface ServicingParameters {
  /** null = use each loan's contractual fee. A number = hypothetical acquisition fee. */
  feeOverrideBps: number | null;
  /** null = use each loan's annual cost. A number = cost per active loan for every loan. */
  costPerLoan: number | null;
  /** Annual effective discount rate, decimal. */
  discountRate: number;
}

export interface RecaptureParameters {
  share: number;
  contributionPerLoan: number;
  campaignCost: number;
}

export interface ScenarioInput {
  schemaVersion: number;
  modelVersion: string;
  portfolioHash: string;
  baselineId: string | null;
  scenarioId: string;
  name: string;
  valuationMonth: string;
  mode: ModelMode;
  ratePath: RatePath;
  behavioralParameters: BehavioralParameters;
  prepaymentParameters: PrepaymentParameters;
  servicingParameters: ServicingParameters;
  recaptureParameters: RecaptureParameters;
  seed: number;
  chartHorizon: ChartHorizon;
}

export type SegmentDimension = 'coupon' | 'age' | 'remainingTerm' | 'balance' | 'state' | 'propensity';

/** Empty arrays (or missing keys) mean "no restriction" for that dimension. */
export type PopulationFilter = Partial<Record<SegmentDimension, string[]>>;

export interface LedgerMonth {
  /** Projection month, 1-based. */
  t: number;
  month: string;
  beginningUpb: number;
  scheduledPrincipal: number;
  prepaidPrincipal: number;
  endingUpb: number;
  /** Note interest paid by borrowers (gross of servicing fee). */
  noteInterest: number;
  beginningLoans: number;
  /** Expected full voluntary payoffs (loan count), all causes. Maturities are separate. */
  voluntaryPayoffs: number;
  /**
   * Cause split of voluntary payoffs. Only behavioral mode identifies causes; in fixed CPR
   * and PSA modes these are null ("not applicable") and every payoff is unclassified.
   */
  refiPayoffs: number | null;
  turnoverPayoffs: number | null;
  refiPrepaidPrincipal: number | null;
  turnoverPrepaidPrincipal: number | null;
  /** Voluntary payoffs with no identified cause: all of them in fixed CPR and PSA modes, 0 in behavioral mode. */
  unclassifiedPayoffs: number;
  unclassifiedPrepaidPrincipal: number;
  maturedLoans: number;
  /** null when eligible balance is zero. */
  smm: number | null;
  cpr: number | null;
  grossFee: number;
  operatingCost: number;
  netServicing: number;
  discountFactor: number;
  pvNetServicing: number;
  /** Behavioral mode only; null otherwise. */
  offerRate: number | null;
  recapturedLoans: number | null;
  recaptureContribution: number | null;
  /** Owner view: note interest net of servicing fee. */
  ownerNetInterest: number;
}

export interface SummaryMetrics {
  loanCount: number;
  currentUpb: number;
  nextMonthCpr: number | null;
  cpr12: number | null;
  prepaid12: number;
  scheduled12: number;
  netServicing12: number;
  grossFee12: number;
  operatingCost12: number;
  servicingNpv: number;
  servicingValueBps: number | null;
  /** Principal weighted-average life in years, full maturity. null when UPB is zero. */
  wal: number | null;
  lifetimePrepaid: number;
  lifetimeScheduled: number;
  lifetimeNetServicing: number;
  /** Behavioral mode only. */
  recapturedLoans: number | null;
  recapturePv: number | null;
  /** Original-book servicing NPV + recapture contribution PV. Not a fair value. */
  combinedContribution: number | null;
  negativeMarginMonths: number;
  projectionMonths: number;
}

export interface CohortRow {
  dimension: SegmentDimension;
  key: string;
  label: string;
  loanCount: number;
  beginningUpb: number;
  nextMonthCpr: number | null;
  cpr12: number | null;
  scheduled12: number;
  prepaid12: number;
  /** prepaid12 / beginningUpb; null when UPB zero. */
  prepaid12Share: number | null;
  netServicing12: number;
  servicingNpv: number;
  servicingValueBps: number | null;
}

export interface RunWarning {
  code: string;
  message: string;
}

export interface PopulationInfo {
  filter: PopulationFilter;
  loanCount: number;
  totalLoans: number;
  upb: number;
  totalUpb: number;
  isFiltered: boolean;
}

export interface RunOutput {
  /** Hash of the model-relevant scenario inputs. */
  inputHash: string;
  /** Hash of inputHash plus the normalized population filter: identifies this exact run. */
  runKey: string;
  modelVersion: string;
  portfolioHash: string;
  /** 'YYYY-MM' valuation month the run used; must match the portfolio as-of month. */
  valuationMonth: string;
  scenarioId: string;
  mode: ModelMode;
  population: PopulationInfo;
  ledger: LedgerMonth[];
  cohorts: Record<SegmentDimension, CohortRow[]>;
  summary: SummaryMetrics;
  warnings: RunWarning[];
  durationMs: number;
}
