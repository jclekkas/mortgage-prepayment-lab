import { useEffect, useState } from 'react';
import { useStore } from '../../app/store';
import { BOUNDS, CHART_HORIZONS, type ChartHorizon } from '../../domain/config';
import { defaultScenario } from '../../domain/scenario';
import type { ModelMode, RatePathShape, ScenarioInput } from '../../domain/types';
import { NumberControl } from '../../ui/NumberControl';
import { TermHelp } from '../../ui/TermHelp';
import type { TermId } from '../../ui/terms';

export function Controls() {
  const { state, dispatch, active } = useStore();
  const d = active.draft;
  const frozen = d.scenarioId === state.baselineId;
  const defaults = defaultScenario(d.portfolioHash, d.valuationMonth);
  const contractFee = state.portfolio.loans[0]?.servicingFeeBps ?? 25;
  const loanCost = state.portfolio.loans[0]?.annualCost ?? 100;
  const uniformFee = state.portfolio.loans.every((l) => l.servicingFeeBps === contractFee);
  const uniformCost = state.portfolio.loans.every((l) => l.annualCost === loanCost);
  const edit = (fn: (n: ScenarioInput) => void) => {
    const n = structuredClone(d);
    fn(n);
    dispatch({ type: 'edit', id: d.scenarioId, next: n });
  };
  const frozenReason = frozen ? 'The baseline is frozen. Duplicate it or pick a scenario to change assumptions.' : null;
  const behavioral = d.mode === 'behavioral';
  const notBehavioral = behavioral ? null : 'Only used in behavioral mode. In fixed CPR and PSA modes, rates do not drive prepayment.';
  const why = (r: string | null) => frozenReason ?? r;

  return (
    <div className="controls" data-testid="controls">
      {frozen && <p className="notice info">{frozenReason}</p>}
      <fieldset>
        <legend>Market conditions</legend>
        <NumberControl testId="ctl-offer" label="Mortgage offer rate" value={d.ratePath.offerRate} min={BOUNDS.offerRate.min} max={BOUNDS.offerRate.max} step={0.05} scale={100} unit="%" defaultValue={defaults.ratePath.offerRate} digits={3}
          onChange={(v) => edit((n) => { n.ratePath.offerRate = v; })} source="Market assumption" disabledReason={why(notBehavioral)}
          help="Synthetic starting level of the rate borrowers could refinance into. Not today’s market rate." />
        <NumberControl testId="ctl-shock" label="Rate shock" term="bp" value={d.ratePath.shockBps} min={BOUNDS.shockBps.min} max={BOUNDS.shockBps.max} step={5} unit="basis points" defaultValue={0} digits={0}
          onChange={(v) => edit((n) => { n.ratePath.shockBps = v; })} source="Market assumption" disabledReason={why(notBehavioral)}
          help="In basis points: 100 basis points equal 1 percentage point, so −100 moves rates 1 point lower. Added to the offer rate path. A resulting rate outside 1% to 15% is rejected." />
        <div className="control">
          <div className="control-head"><span id="shape-l" style={{ fontWeight: 500 }}>Shock timing</span><span className="source">Market assumption</span></div>
          <div role="radiogroup" aria-labelledby="shape-l" className="chips" style={{ marginTop: '0.25rem' }}>
            {(['immediate', 'ramp12', 'custom'] as RatePathShape[]).map((sh) => (
              <label key={sh} className="row" style={{ gap: '0.25rem', fontWeight: 400 }}>
                <input type="radio" name="shape" value={sh} checked={d.ratePath.shape === sh} disabled={!!why(notBehavioral)} onChange={() => edit((n) => { n.ratePath.shape = sh; if (sh === 'custom' && n.ratePath.customPath.length === 0) n.ratePath.customPath = [n.ratePath.offerRate]; })} />
                {sh === 'immediate' ? 'Immediate' : sh === 'ramp12' ? '12-month ramp' : 'Custom monthly path'}
              </label>
            ))}
          </div>
          {d.ratePath.shape === 'custom' && <CustomPath value={d.ratePath.customPath} disabled={!!why(notBehavioral)} onChange={(p) => edit((n) => { n.ratePath.customPath = p; })} />}
          <p className="help">Immediate applies the full shock from month 1. The ramp phases it in evenly over 12 months.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Borrower behavior</legend>
        <NumberControl testId="ctl-turnover" label="Turnover multiplier" term="turnover" value={d.behavioralParameters.turnoverMultiplier} min={0} max={2} step={0.05} unit="×" defaultValue={1}
          onChange={(v) => edit((n) => { n.behavioralParameters.turnoverMultiplier = v; })} source="Behavior assumption" disabledReason={why(notBehavioral)}
          help="Scales background full payoffs from moves and home sales." />
        <NumberControl testId="ctl-refi" label="Refinance response multiplier" term="incentive" value={d.behavioralParameters.refiMultiplier} min={0} max={2} step={0.05} unit="×" defaultValue={1}
          onChange={(v) => edit((n) => { n.behavioralParameters.refiMultiplier = v; })} source="Behavior assumption" disabledReason={why(notBehavioral)}
          help="Scales how strongly borrowers respond to an incentive. It does not change who has an incentive." />
        <NumberControl testId="ctl-friction" label="Refinance friction" term="friction" value={d.behavioralParameters.frictionBps} min={0} max={200} step={5} unit="basis points" defaultValue={50} digits={0}
          onChange={(v) => edit((n) => { n.behavioralParameters.frictionBps = v; })} source="Teaching assumption" disabledReason={why(notBehavioral)}
          help="Assumed allowance for refinancing cost and hassle, subtracted from the rate gap; 50 basis points is half a percentage point. Reduces the effective incentive." />
        <Toggle label="Burnout" term="burnout" checked={d.behavioralParameters.burnout} disabledReason={why(notBehavioral)} source="Behavior assumption"
          help="Borrowers who have ignored past refinance chances respond less. Starts from zero history in these synthetic loans."
          onChange={(v) => edit((n) => { n.behavioralParameters.burnout = v; })} />
        <Toggle label="Seasonal turnover" checked={d.behavioralParameters.seasonality === 'seasonal'} disabledReason={why(notBehavioral)} source="Teaching assumption"
          help="Disclosed preset: more moves in summer, fewer in winter, averaging exactly 1 over a year."
          onChange={(v) => edit((n) => { n.behavioralParameters.seasonality = v ? 'seasonal' : 'flat'; })} />
      </fieldset>

      <fieldset>
        <legend>Modeling assumptions</legend>
        <div className="control">
          <div className="control-head"><span id="mode-l" style={{ fontWeight: 500 }}>Model mode</span><span className="source">Modeling assumption</span></div>
          <div role="radiogroup" aria-labelledby="mode-l" className="stack" style={{ marginTop: '0.25rem' }}>
            {([
              ['behavioral', 'Behavioral (rates, age, turnover, burnout)', null],
              ['fixedCpr', 'Fixed conditional prepayment rate (CPR): same speed every month', 'cpr'],
              ['psa', 'Public Securities Association (PSA) benchmark: speed rises with loan age', 'psa'],
            ] as [ModelMode, string, TermId | null][]).map(([m, label, term]) => (
              <div key={m}>
                <label className="row" style={{ gap: '0.35rem', fontWeight: 400, marginTop: 0, display: 'inline-flex' }}>
                  <input type="radio" name="mode" value={m} checked={d.mode === m} disabled={!!frozenReason} onChange={() => edit((n) => { n.mode = m; })} data-testid={`mode-${m}`} />
                  {label}
                </label>
                {term && <TermHelp id={term} />}
              </div>
            ))}
          </div>
          <p className="help">Only the selected mode drives prepayment.</p>
        </div>
        <NumberControl testId="ctl-cpr" label="Fixed annual CPR" term="cpr" value={d.prepaymentParameters.fixedCpr} min={0} max={0.6} step={0.5} scale={100} unit="%" defaultValue={0.08}
          onChange={(v) => edit((n) => { n.prepaymentParameters.fixedCpr = v; })} source="Modeling assumption" disabledReason={why(d.mode === 'fixedCpr' ? null : 'Only used in fixed CPR mode.')}
          help="Applied to every loan every month, regardless of rates." />
        <NumberControl testId="ctl-psa" label="PSA multiplier" term="psa" value={d.prepaymentParameters.psaPercent} min={0} max={500} step={5} unit="% of PSA" defaultValue={100} digits={0}
          onChange={(v) => edit((n) => { n.prepaymentParameters.psaPercent = v; })} source="Convention" disabledReason={why(d.mode === 'psa' ? null : 'Only used in PSA mode.')}
          help="Applied to each loan’s own age: 100% PSA rises from a 0.2% to a 6% prepayment rate by month 30, then stays flat." />
        <NumberControl testId="ctl-discount" label="Annual effective discount rate" term="discount" value={d.servicingParameters.discountRate} min={0} max={0.3} step={0.25} scale={100} unit="%" defaultValue={0.1}
          onChange={(v) => edit((n) => { n.servicingParameters.discountRate = v; })} source="Modeling assumption" disabledReason={frozenReason}
          help="Independent of the mortgage-rate path in this model." />
        <div className="control">
          <div className="control-head"><label htmlFor="horizon">Chart horizon</label><span className="source">Display</span></div>
          <select id="horizon" value={d.chartHorizon} onChange={(e) => dispatch({ type: 'setHorizon', id: d.scenarioId, horizon: Number(e.target.value) as ChartHorizon })}>
            {CHART_HORIZONS.map((h) => <option key={h} value={h}>{h} months</option>)}
          </select>
          <p className="help">Changes the chart window only. Valuation always runs to each loan’s maturity.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Business decisions</legend>
        <Toggle label={`Use a hypothetical servicing fee instead of the contract${uniformFee ? ` (${contractFee} basis points)` : ''}`} checked={d.servicingParameters.feeOverrideBps !== null} disabledReason={frozenReason} source="Contract term"
          help="For a hypothetical acquisition on different terms. Labeled as a contract change assumption in results."
          onChange={(v) => edit((n) => { n.servicingParameters.feeOverrideBps = v ? contractFee : null; })} />
        {d.servicingParameters.feeOverrideBps !== null && (
          <NumberControl testId="ctl-fee" label="Annual servicing fee (hypothetical)" term="servicingFee" value={d.servicingParameters.feeOverrideBps} min={0} max={100} step={1} unit="basis points" defaultValue={contractFee} digits={1}
            onChange={(v) => edit((n) => { n.servicingParameters.feeOverrideBps = v; })} source="Contract term" disabledReason={frozenReason}
            help="Annual fee as basis points of each loan’s balance, accrued monthly." />
        )}
        <Toggle label={`Override cost per active loan${uniformCost ? ` (loan data: $${loanCost})` : ''}`} checked={d.servicingParameters.costPerLoan !== null} disabledReason={frozenReason} source="Business decision"
          help="Costs scale with the expected number of surviving loans, not with balance."
          onChange={(v) => edit((n) => { n.servicingParameters.costPerLoan = v ? loanCost : null; })} />
        {d.servicingParameters.costPerLoan !== null && (
          <NumberControl testId="ctl-cost" label="Annual cost per active loan" value={d.servicingParameters.costPerLoan} min={0} max={1000} step={5} unit="$" defaultValue={loanCost} digits={0}
            onChange={(v) => edit((n) => { n.servicingParameters.costPerLoan = v; })} source="Business decision" disabledReason={frozenReason}
            help="All-in annual servicing cost for each loan that is still active." />
        )}
        <NumberControl testId="ctl-recapture" label="Refinance recapture share" term="recapture" value={d.recaptureParameters.share} min={0} max={1} step={1} scale={100} unit="%" defaultValue={0.2} digits={0}
          onChange={(v) => edit((n) => { n.recaptureParameters.share = v; })} source="Business decision"
          disabledReason={why(behavioral ? null : 'Recapture needs behavioral mode, where refinance payoffs are separated from moves.')}
          help="Share of refinancing borrowers who take their new loan from you. Applies to refinance payoffs only." />
        <NumberControl testId="ctl-contrib" label="Net contribution per recaptured loan" value={d.recaptureParameters.contributionPerLoan} min={-10000} max={10000} step={50} unit="$" defaultValue={1500} digits={0}
          onChange={(v) => edit((n) => { n.recaptureParameters.contributionPerLoan = v; })} source="Business decision"
          disabledReason={why(behavioral ? null : 'Recapture needs behavioral mode.')}
          help="Origination contribution only; excludes the value of the new loan’s servicing." />
        <NumberControl testId="ctl-campaign" label="Incremental campaign cost" value={d.recaptureParameters.campaignCost} min={0} max={1_000_000} step={5000} unit="$" defaultValue={0} digits={0}
          onChange={(v) => edit((n) => { n.recaptureParameters.campaignCost = v; })} source="Business decision"
          disabledReason={why(behavioral ? null : 'Recapture needs behavioral mode.')}
          help="Spent once at the start and deducted once from the recapture contribution." />
      </fieldset>
    </div>
  );
}

function Toggle(p: { label: string; checked: boolean; onChange: (v: boolean) => void; help: string; source: string; disabledReason: string | null; term?: TermId }) {
  return (
    <div className={`control${p.disabledReason ? ' disabled' : ''}`}>
      <div className="control-head">
        <label className="row" style={{ gap: '0.4rem' }}>
          <input type="checkbox" checked={p.checked} disabled={!!p.disabledReason} onChange={(e) => p.onChange(e.target.checked)} />
          {p.label}
        </label>
        {p.term && <TermHelp id={p.term} />}
        <span className="source">{p.source}</span>
      </div>
      <p className="help">{p.disabledReason ? <strong>Disabled: {p.disabledReason} </strong> : null}{p.help}</p>
    </div>
  );
}

function CustomPath({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled: boolean }) {
  const fmt = (v: number[]) => v.map((r) => Number((r * 100).toFixed(4))).join(', ');
  const [text, setText] = useState(fmt(value));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setText(fmt(value)), [value]);
  const apply = () => {
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    const nums = parts.map(Number);
    if (parts.length === 0) return setErr('Enter at least one monthly rate.');
    if (parts.length > 600) return setErr('At most 600 months.');
    if (nums.some((n) => !Number.isFinite(n) || n < 1 || n > 15)) return setErr('Each monthly rate must be a number from 1 to 15 (percent).');
    setErr(null);
    onChange(nums.map((n) => n / 100));
  };
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <label htmlFor="custom-path">Monthly offer rates, % (month 1 first; the last value continues)</label>
      <textarea id="custom-path" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={apply} aria-invalid={!!err} rows={3} />
      <button type="button" onClick={apply} disabled={disabled}>Apply path</button>
      {err && <p className="help" role="alert" style={{ color: 'var(--err-ink)' }}>{err}</p>}
    </div>
  );
}
