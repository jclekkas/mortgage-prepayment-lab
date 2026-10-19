/**
 * Deterministic explanation templates populated from calculated results. If the
 * results contradict the usual pattern, the text names the actual driver instead of
 * forcing the template.
 */
import { avgOffer12, diffInputs, type InputChange } from './diff';
import { pct, pp, usd, years } from './format';
import type { CohortRow, RunOutput, ScenarioInput } from './types';

export type Lens = 'servicing' | 'investor' | 'learn';

export interface Narrative {
  headline: string;
  points: string[];
  changes: InputChange[];
}

const EPS_USD = 0.5;

function largestCohortChange(base: CohortRow[], scen: CohortRow[]): { row: CohortRow; delta: number } | null {
  let best: { row: CohortRow; delta: number } | null = null;
  for (const r of scen) {
    const b = base.find((x) => x.key === r.key);
    if (!b) continue;
    const d = r.prepaid12 - b.prepaid12;
    if (!best || Math.abs(d) > Math.abs(best.delta)) best = { row: r, delta: d };
  }
  return best && Math.abs(best.delta) > EPS_USD ? best : null;
}

function listChanges(changes: InputChange[]): string {
  return changes.map((c) => `${c.label.toLowerCase()} (${c.from} → ${c.to})`).join('; ');
}

export function explainComparison(
  baseInput: ScenarioInput,
  base: RunOutput,
  scenInput: ScenarioInput,
  scen: RunOutput,
  lens: Lens,
): Narrative {
  const changes = diffInputs(baseInput, scenInput);
  const b = base.summary, s = scen.summary;
  const points: string[] = [];
  if (base.runKey === scen.runKey || changes.length === 0) {
    return {
      headline: 'This scenario has the same model inputs as the baseline, so every result matches.',
      points: ['Change one assumption and run again to see what it does.'],
      changes,
    };
  }
  if (s.loanCount === 0) {
    return { headline: 'No loans are in the selected population, so there is nothing to compare.', points: [], changes };
  }

  const dPrep = s.prepaid12 - b.prepaid12;
  const dCpr = s.nextMonthCpr !== null && b.nextMonthCpr !== null ? s.nextMonthCpr - b.nextMonthCpr : null;
  const dNpv = s.servicingNpv - b.servicingNpv;
  const faster = dPrep > EPS_USD;
  const slower = dPrep < -EPS_USD;
  const rateA = avgOffer12(baseInput), rateB = avgOffer12(scenInput);
  const lowerRates = rateA !== null && rateB !== null && rateB < rateA - 1e-9;
  const higherRates = rateA !== null && rateB !== null && rateB > rateA + 1e-9;
  const nonRate = changes.filter((c) => c.group !== 'market');
  const onlyRates = nonRate.length === 0;

  let headline: string;
  if (changes.some((c) => c.id === 'mode')) {
    headline = `The scenario switches the model from ${changes.find((c) => c.id === 'mode')!.from} to ${changes.find((c) => c.id === 'mode')!.to}. Differences come from the modeling convention, not from a market event.`;
  } else if (lowerRates && faster && onlyRates) {
    headline = `Under your lower-rate assumption, borrowers’ refinance incentive (their note rate minus the offer rate, less friction) rises, so the model projects more refinance payoffs: 12-month prepaid principal rises by ${usd(dPrep, { compact: true })}.`;
  } else if (higherRates && slower && onlyRates) {
    headline = `Under your higher-rate assumption, borrowers’ refinance incentive falls, so the model projects fewer refinance payoffs: 12-month prepaid principal falls by ${usd(-dPrep, { compact: true })}.`;
  } else if (lowerRates && !faster) {
    headline = `Rates are lower in this scenario, yet 12-month prepaid principal did not rise (${usd(dPrep, { compact: true, signed: true })}). The other changes outweigh the rate effect: ${listChanges(nonRate) || 'see the input list'}.`;
  } else if (faster) {
    headline = `Projected 12-month prepaid principal rises by ${usd(dPrep, { compact: true })}, driven by: ${listChanges(changes)}.`;
  } else if (slower) {
    headline = `Projected 12-month prepaid principal falls by ${usd(-dPrep, { compact: true })}, driven by: ${listChanges(changes)}.`;
  } else {
    headline = `Prepayment is essentially unchanged; the difference comes from: ${listChanges(changes)}.`;
  }

  if (dCpr !== null && Math.abs(dCpr) > 1e-6) points.push(`Next-month conditional prepayment rate (CPR) moves from ${pct(b.nextMonthCpr)} to ${pct(s.nextMonthCpr)} (${pp(dCpr)}).`);

  const cohort = largestCohortChange(base.cohorts.coupon, scen.cohorts.coupon);
  if (cohort && (faster || slower)) {
    points.push(`The largest change in 12-month prepaid principal is among borrowers whose existing mortgage rate is ${cohort.row.label} (${usd(cohort.delta, { compact: true, signed: true })}).`);
  }

  if (lens !== 'investor') {
    const servicingDrivers = changes.filter((c) => ['fee', 'cost', 'discount'].includes(c.id));
    if (Math.abs(dNpv) > EPS_USD) {
      const change = `Illustrative lifetime servicing net present value (NPV, in today’s dollars) changes by ${usd(dNpv, { compact: true, signed: true })}, from ${usd(b.servicingNpv, { compact: true })} to ${usd(s.servicingNpv, { compact: true })}.`;
      if (servicingDrivers.length) {
        // Fee, cost or discount changed too: the comparison cannot separate their effect from the payoff effect.
        points.push(`${change} The servicing inputs you changed (${listChanges(servicingDrivers)}) and any change in how long loans stay both contribute; this comparison does not split them.`);
      } else if (faster || slower) {
        // With fee, cost and discount unchanged, value changes in this model only through how long loans stay.
        const fewerMonths = faster;
        const feesWin = (dNpv < 0) === fewerMonths;
        points.push(`${change} With the servicing fee, cost and discount rate unchanged, the only channel in this model is how long loans stay. ${fewerMonths ? 'Faster payoffs end both the servicing fees and the servicing costs of the loans that leave' : 'Slower payoffs keep both the servicing fees and the servicing costs of loans that stay'}; here the ${feesWin ? 'fees' : 'costs'} involved outweigh the ${feesWin ? 'costs' : 'fees'}.`);
      } else {
        points.push(change);
      }
      if (s.servicingNpv < 0) {
        points.push(`Lifetime servicing value is still negative (${usd(s.servicingNpv, { compact: true })}) under these assumptions: servicing this book costs more than it earns. A smaller loss is not a profit.`);
      }
    }
    if (s.recapturePv !== null && b.recapturePv !== null && Math.abs(s.recapturePv - b.recapturePv) > EPS_USD) {
      points.push(`The separate recapture contribution changes by ${usd(s.recapturePv - b.recapturePv, { compact: true, signed: true })}. It is new origination income; it does not keep the original loans or their servicing fees alive.`);
    }
  }
  if (lens === 'investor' || lens === 'learn') {
    if (b.wal !== null && s.wal !== null && Math.abs(s.wal - b.wal) > 1e-4) {
      points.push(`For the loan owner, principal weighted-average life moves from ${years(b.wal)} to ${years(s.wal)}. ${s.wal < b.wal ? 'Principal comes back sooner. That changes cash-flow timing and can affect the investment’s value; this simulator does not determine whether it is favorable for the owner.' : 'Principal comes back later; the owner earns the note rate for longer.'}`);
    }
  }
  if (base.population.isFiltered) points.push('Both runs use the same filtered population.');
  return { headline, points, changes };
}

export type MetricId = 'upb' | 'cpr' | 'prepaid12' | 'net12' | 'npv' | 'wal' | 'principal12' | 'ownerInterest12';

/** Short "why did this change?" explanation for one headline card. */
export function explainMetric(metric: MetricId, baseInput: ScenarioInput, base: RunOutput, scenInput: ScenarioInput, scen: RunOutput): string[] {
  const changes = diffInputs(baseInput, scenInput);
  const b = base.summary, s = scen.summary;
  if (changes.length === 0) return ['Nothing differs from the baseline inputs, so this number is the same.'];
  const lines: string[] = [];
  const list = listChanges(changes);
  switch (metric) {
    case 'upb':
      lines.push('Current unpaid principal balance is today’s book; no assumption changes it. It differs only if the population filter differs.');
      break;
    case 'cpr':
      lines.push(`Month-1 speed is ${pct(s.nextMonthCpr)} versus ${pct(b.nextMonthCpr)}. It is prepaid principal divided by balance eligible to prepay, annualized.`);
      if (scenInput.mode === 'behavioral') lines.push('In behavioral mode it responds to the offer rate, friction, refinance response, turnover and burnout.');
      else lines.push('In this mode, rates do not affect speed; only the speed assumption does.');
      break;
    case 'prepaid12':
      lines.push(`Twelve-month prepaid principal is summed from the monthly ledger: ${usd(s.prepaid12)} versus ${usd(b.prepaid12)}. It is not CPR times today’s balance.`);
      break;
    case 'net12':
      lines.push(`Twelve-month net servicing cash flow is fees on surviving balances minus cost per surviving loan: ${usd(s.netServicing12)} versus ${usd(b.netServicing12)}.`);
      break;
    case 'npv':
      lines.push(`Illustrative servicing NPV discounts every remaining month of net servicing cash flow: ${usd(s.servicingNpv)} versus ${usd(b.servicingNpv)}.`);
      lines.push('Faster payoff shortens both the fee stream and the cost stream of the loans that leave; whether value rises or falls depends on whether those loans earn more in fees than they cost. A higher discount rate shrinks distant months; a higher cost per loan lowers every month.');
      break;
    case 'wal':
      lines.push(`Weighted-average life of principal is ${years(s.wal)} versus ${years(b.wal)}. It measures when the loan owner gets principal back, not servicing duration.`);
      break;
    case 'principal12': {
      const bp = b.scheduled12 + b.prepaid12, sp = s.scheduled12 + s.prepaid12;
      lines.push(`Principal returned to the loan owner over the next 12 months, scheduled plus prepaid: ${usd(sp)} versus ${usd(bp)}. It is a timing measure: it says when cash arrives, not whether the investment gains or loses value.`);
      break;
    }
    case 'ownerInterest12':
      lines.push('Note interest the loan owner receives after the servicing fee, summed over the next 12 projected months. When loans pay off sooner, the owner receives less interest but gets principal back earlier to reinvest; this simulator does not model reinvestment or the price paid for the loans.');
      break;
  }
  lines.push(`Inputs that differ from the baseline: ${list}.`);
  return lines;
}
