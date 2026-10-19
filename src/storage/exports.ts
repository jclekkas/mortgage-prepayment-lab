import { describeFilter } from '../domain/segments';
import type { RunOutput } from '../domain/types';
import { toCsv } from './sanitize';

const COLUMNS: [string, (m: RunOutput['ledger'][number]) => number | string | null][] = [
  ['month_index', (m) => m.t],
  ['month', (m) => m.month],
  ['beginning_upb', (m) => m.beginningUpb],
  ['scheduled_principal', (m) => m.scheduledPrincipal],
  ['prepaid_principal', (m) => m.prepaidPrincipal],
  ['ending_upb', (m) => m.endingUpb],
  ['note_interest', (m) => m.noteInterest],
  ['owner_net_interest', (m) => m.ownerNetInterest],
  ['expected_beginning_loans', (m) => m.beginningLoans],
  ['expected_voluntary_payoffs', (m) => m.voluntaryPayoffs],
  // Cause columns are "not applicable" in fixed CPR and PSA modes, which do not identify causes.
  ['expected_refinance_payoffs', (m) => m.refiPayoffs],
  ['expected_turnover_payoffs', (m) => m.turnoverPayoffs],
  ['expected_unclassified_payoffs', (m) => m.unclassifiedPayoffs],
  ['refinance_prepaid_principal', (m) => m.refiPrepaidPrincipal],
  ['turnover_prepaid_principal', (m) => m.turnoverPrepaidPrincipal],
  ['unclassified_prepaid_principal', (m) => m.unclassifiedPrepaidPrincipal],
  ['expected_matured_loans', (m) => m.maturedLoans],
  ['smm', (m) => m.smm],
  ['cpr_annualized', (m) => m.cpr],
  ['gross_servicing_fee', (m) => m.grossFee],
  ['operating_cost', (m) => m.operatingCost],
  ['net_servicing_cash_flow', (m) => m.netServicing],
  ['discount_factor', (m) => m.discountFactor],
  ['pv_net_servicing', (m) => m.pvNetServicing],
  ['offer_rate', (m) => m.offerRate],
  ['expected_recaptured_loans', (m) => m.recapturedLoans],
  ['recapture_contribution', (m) => m.recaptureContribution],
];

/** Monthly cash-flow ledger as CSV. Null values export as "not applicable", never blank, NaN or Infinity. */
export function ledgerCsv(out: RunOutput, scenarioName: string): string {
  const header = ['scenario', 'run_key', 'model_version', 'valuation_month', 'population', ...COLUMNS.map((c) => c[0])];
  // Every row states the population the numbers were calculated for.
  const population = describeFilter(out.population.filter);
  const rows = out.ledger.map((m) => [scenarioName, out.runKey, out.modelVersion, out.valuationMonth, population, ...COLUMNS.map((c) => c[1](m))]);
  return toCsv(header, rows);
}

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scenario';
}
