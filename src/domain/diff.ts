import { pct, usd } from './format';
import { MODE_LABELS, effectiveInput, offerRatePath } from './scenario';
import type { ScenarioInput } from './types';

export type DriverGroup = 'market' | 'behavior' | 'business' | 'model';

export interface InputChange {
  id: string;
  group: DriverGroup;
  label: string;
  from: string;
  to: string;
}

const yesNo = (b: boolean) => (b ? 'on' : 'off');

/** Human-readable list of model-relevant input differences between two scenarios. */
export function diffInputs(a: ScenarioInput, b: ScenarioInput): InputChange[] {
  const out: InputChange[] = [];
  const push = (id: string, group: DriverGroup, label: string, from: string, to: string) => {
    if (from !== to) out.push({ id, group, label, from, to });
  };
  push('mode', 'model', 'Model mode', MODE_LABELS[a.mode], MODE_LABELS[b.mode]);
  const ea = effectiveInput(a) as Record<string, unknown>;
  const eb = effectiveInput(b) as Record<string, unknown>;
  if (a.mode === 'behavioral' && b.mode === 'behavioral') {
    const ra = a.ratePath, rb = b.ratePath;
    push('offerRate', 'market', 'Mortgage offer rate level', pct(ra.offerRate), pct(rb.offerRate));
    push('shockBps', 'market', 'Rate shock', `${ra.shockBps} bps`, `${rb.shockBps} bps`);
    push('shape', 'market', 'Rate path shape', ra.shape, rb.shape);
    if (ra.shape === 'custom' && rb.shape === 'custom' && JSON.stringify(ra.customPath) !== JSON.stringify(rb.customPath)) {
      out.push({ id: 'customPath', group: 'market', label: 'Custom rate path', from: `${ra.customPath.length} months`, to: `${rb.customPath.length} months (edited)` });
    }
    const ba = a.behavioralParameters, bb = b.behavioralParameters;
    push('turnover', 'behavior', 'Turnover multiplier', ba.turnoverMultiplier.toFixed(2), bb.turnoverMultiplier.toFixed(2));
    push('refi', 'behavior', 'Refinance response multiplier', ba.refiMultiplier.toFixed(2), bb.refiMultiplier.toFixed(2));
    push('friction', 'behavior', 'Refinance friction', `${ba.frictionBps} bps`, `${bb.frictionBps} bps`);
    push('burnout', 'behavior', 'Burnout', yesNo(ba.burnout), yesNo(bb.burnout));
    push('seasonality', 'behavior', 'Turnover seasonality', ba.seasonality, bb.seasonality);
    const ca = a.recaptureParameters, cb = b.recaptureParameters;
    push('recaptureShare', 'business', 'Refinance recapture share', pct(ca.share, 0), pct(cb.share, 0));
    push('contribution', 'business', 'Net contribution per recaptured loan', usd(ca.contributionPerLoan), usd(cb.contributionPerLoan));
    push('campaign', 'business', 'Incremental campaign cost', usd(ca.campaignCost), usd(cb.campaignCost));
  }
  if (a.mode === 'fixedCpr' && b.mode === 'fixedCpr') push('fixedCpr', 'model', 'Fixed annual CPR', pct(ea.fixedCpr as number), pct(eb.fixedCpr as number));
  if (a.mode === 'psa' && b.mode === 'psa') push('psa', 'model', 'PSA multiplier', `${ea.psaPercent}%`, `${eb.psaPercent}%`);
  const sa = a.servicingParameters, sb = b.servicingParameters;
  push('fee', 'business', 'Annual servicing fee', sa.feeOverrideBps === null ? 'contractual' : `${sa.feeOverrideBps} bps (hypothetical)`, sb.feeOverrideBps === null ? 'contractual' : `${sb.feeOverrideBps} bps (hypothetical)`);
  push('cost', 'business', 'Annual cost per active loan', sa.costPerLoan === null ? 'loan data' : usd(sa.costPerLoan), sb.costPerLoan === null ? 'loan data' : usd(sb.costPerLoan));
  push('discount', 'model', 'Annual discount rate', pct(sa.discountRate), pct(sb.discountRate));
  return out;
}

/** Average offer rate over the first 12 months, or null outside behavioral mode. */
export function avgOffer12(s: ScenarioInput): number | null {
  if (s.mode !== 'behavioral') return null;
  const p = offerRatePath(s.ratePath, 12);
  return p.reduce((a, b) => a + b, 0) / 12;
}
