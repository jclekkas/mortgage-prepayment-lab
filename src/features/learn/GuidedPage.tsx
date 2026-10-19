import { useEffect, useRef, useState } from 'react';
import { href, navigate } from '../../app/router';
import { newScenarioId, useStore } from '../../app/store';
import { explainComparison, servicingPvParts } from '../../domain/narrative';
import { pct, pp, usd } from '../../domain/format';
import { defaultScenario } from '../../domain/scenario';
import { trendOf, type TrendMetric } from '../../domain/trend';
import type { RunOutput, ScenarioInput } from '../../domain/types';
import { TrendArrow } from '../../ui/TrendArrow';
import { TrustNote } from '../../ui/TrustNote';
import { Notice } from '../../ui/misc';

type Answer = 'up' | 'down' | 'same';

interface Outcome {
  id: 'cpr' | 'net12' | 'npv';
  question: string;
  measure: string;
  plain: string;
  pick: (o: RunOutput) => number;
  format: (v: number) => string;
  diff: (b: number, s: number) => string;
  trend: TrendMetric;
  choices: [Answer, string][];
}

const OUTCOMES: Outcome[] = [
  {
    id: 'cpr', trend: 'cpr', question: 'Prepayment speed next month will be…', measure: 'Prepayment speed (conditional prepayment rate, CPR)',
    plain: 'The yearly pace at which borrowers pay their loans off early.',
    pick: (o) => o.summary.nextMonthCpr ?? 0, format: (v) => pct(v), diff: (b, s) => pp(s - b),
    choices: [['up', 'Faster'], ['down', 'Slower'], ['same', 'About the same']],
  },
  {
    id: 'net12', trend: 'net12', question: 'Net servicing income over the next 12 months will be…', measure: 'Net servicing income, next 12 months',
    plain: 'Servicing fees collected minus the cost of servicing the loans still active.',
    pick: (o) => o.summary.netServicing12, format: (v) => usd(v, { compact: true }), diff: (b, s) => usd(s - b, { compact: true, signed: true }),
    choices: [['up', 'Higher'], ['down', 'Lower'], ['same', 'About the same']],
  },
  {
    id: 'npv', trend: 'npv', question: 'The estimated value today of all future servicing income will be…', measure: 'Estimated value today of future servicing income (net present value, NPV)',
    plain: 'Every future month of fees minus costs, converted into today’s dollars at a 10% yearly discount rate and added up.',
    pick: (o) => o.summary.servicingNpv, format: (v) => usd(v, { compact: true }), diff: (b, s) => usd(s - b, { compact: true, signed: true }),
    choices: [['up', 'Higher'], ['down', 'Lower'], ['same', 'About the same']],
  },
];

/** Direction of a calculated change, with a small band counted as "about the same" (display only). */
function direction(o: Outcome, b: number, s: number): Answer {
  const d = s - b;
  const band = o.id === 'cpr' ? 0.0005 : Math.max(1, Math.abs(b) * 0.005);
  return Math.abs(d) < band ? 'same' : d > 0 ? 'up' : 'down';
}

/**
 * A short, skippable first experiment: who is who, the starting assumptions, a directional
 * prediction, then a 1 percentage point rate cut with baseline, scenario and difference side by side.
 * It runs its own calculation and never changes the learner's scenarios unless they choose to add it.
 */
export function GuidedPage() {
  const { client, state, dispatch } = useStore();
  const p = state.portfolio;
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Partial<Record<Outcome['id'], Answer>>>({});
  const [result, setResult] = useState<{ base: RunOutput; cut: RunOutput; baseIn: ScenarioInput; cutIn: ScenarioInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);

  const baseIn = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  const cutIn: ScenarioInput = { ...structuredClone(baseIn), scenarioId: 'guided-rate-cut', name: 'Rate cut: offer rate 1 percentage point lower' };
  cutIn.ratePath.shockBps = -100;
  const feeBps = p.loans[0]?.servicingFeeBps ?? 25;
  const cost = p.loans[0]?.annualCost ?? 100;
  const upb = p.loans.reduce((a, l) => a + l.currentBalance, 0);
  const avgRate = p.loans.reduce((a, l) => a + l.noteRate * l.currentBalance, 0) / (upb || 1);
  const above = p.loans.filter((l) => l.noteRate > baseIn.ratePath.offerRate + baseIn.behavioralParameters.frictionBps / 10_000 + 1e-9).length;
  const aboveAfter = p.loans.filter((l) => l.noteRate > baseIn.ratePath.offerRate - 0.01 + baseIn.behavioralParameters.frictionBps / 10_000 + 1e-9).length;

  const apply = async () => {
    setBusy(true);
    setErr(null);
    try {
      const run = (s: ScenarioInput) => client.request({ kind: 'run', scenario: s, filter: {} }).promise.then((r) => r.result as RunOutput);
      const [base, cut] = await Promise.all([run(baseIn), run(cutIn)]);
      if (!live.current) return;
      setResult({ base, cut, baseIn, cutIn });
      setStep(4);
    } catch (e) {
      if (live.current) setErr((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const addToLab = () => {
    const id = newScenarioId();
    dispatch({ type: 'addScenario', scenario: { ...structuredClone(cutIn), scenarioId: id, name: 'Guided: offer rate 1 point lower', baselineId: state.baselineId } as ScenarioInput });
    setAdded(true);
  };
  const allAnswered = OUTCOMES.every((o) => answers[o.id]);
  const steps = ['Who’s who', 'Starting assumptions', 'Your prediction', 'What happened'];

  return (
    <div className="stack guided" style={{ maxWidth: 860 }} data-testid="guided">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0 }} aria-live="polite">Guided first experiment · step {step} of 4: {steps[step - 1]}</p>
        <a href={href('overview')} data-testid="guided-skip">Skip to the dashboard</a>
      </div>

      {step === 1 && (
        <section className="card stack" aria-labelledby="g1">
          <h1 id="g1" ref={heading} tabIndex={-1}>Three parties, one mortgage</h1>
          <ul>
            <li><strong>The borrower</strong> took out the mortgage and makes a monthly payment of interest plus some principal.</li>
            <li><strong>The loan owner</strong> (an investor) owns the loan. All the principal and most of the interest are theirs.</li>
            <li><strong>The servicer</strong> collects the payments, keeps a small yearly fee (here {pct(feeBps / 10_000)} of the balance), pays its own cost of servicing each loan, and passes the rest to the loan owner. The servicer does not own the loan.</li>
          </ul>
          <p><strong>Why an early payoff matters to the servicer.</strong> When a borrower refinances or sells the house, the old loan is paid off in full and stops existing. The servicer’s fee on it stops, and so does its cost of servicing it. Whether that helps or hurts the servicer depends on whether that loan earned more in fees than it cost.</p>
          <div className="row"><button type="button" className="primary" onClick={() => setStep(2)} data-testid="guided-next">Next: the starting assumptions</button></div>
        </section>
      )}

      {step === 2 && (
        <section className="card stack" aria-labelledby="g2">
          <h1 id="g2" ref={heading} tabIndex={-1}>The starting assumptions (the baseline)</h1>
          <p>A synthetic book of {p.loans.length.toLocaleString()} home loans. Nothing here is real borrower or market data.</p>
          <div className="table-wrap">
            <table data-testid="guided-assumptions">
              <tbody>
                <tr><th scope="row">Balance still owed on all loans</th><td>{usd(upb, { compact: true })}</td></tr>
                <tr><th scope="row">Borrowers’ existing mortgage rates</th><td>{pct(Math.min(...p.loans.map((l) => l.noteRate)))} to {pct(Math.max(...p.loans.map((l) => l.noteRate)))}, average {pct(avgRate)}</td></tr>
                <tr><th scope="row">Mortgage rate available today (offer rate, synthetic)</th><td>{pct(baseIn.ratePath.offerRate)}</td></tr>
                <tr><th scope="row">Rate saving a borrower needs before refinancing is worth it (friction)</th><td>{(baseIn.behavioralParameters.frictionBps / 100).toFixed(2)} percentage point ({baseIn.behavioralParameters.frictionBps} basis points)</td></tr>
                <tr><th scope="row">Servicing fee</th><td>{pct(feeBps / 10_000)} of each loan’s balance a year</td></tr>
                <tr><th scope="row">Servicer’s cost</th><td>{usd(cost)} per active loan a year</td></tr>
                <tr><th scope="row">Discount rate for value today</th><td>{pct(baseIn.servicingParameters.discountRate, 0)} a year</td></tr>
              </tbody>
            </table>
          </div>
          <p>At these rates, {above.toLocaleString()} of the {p.loans.length.toLocaleString()} borrowers have an existing rate high enough that refinancing would save more than that friction. In this model some borrowers also pay off each year because they sell or move, regardless of rates.</p>
          <div className="row">
            <button type="button" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="primary" onClick={() => setStep(3)} data-testid="guided-next">Next: make a prediction</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card stack" aria-labelledby="g3">
          <h1 id="g3" ref={heading} tabIndex={-1}>Predict: the offer rate falls by 1 percentage point</h1>
          <p>The mortgage rate available today drops from {pct(baseIn.ratePath.offerRate)} to {pct(baseIn.ratePath.offerRate - 0.01)} (100 basis points) and everything else stays the same. After the cut, {aboveAfter.toLocaleString()} borrowers would save more than the friction by refinancing, up from {above.toLocaleString()}. Predict the direction of each result:</p>
          {OUTCOMES.map((o) => (
            <fieldset key={o.id} className="card" style={{ margin: 0 }}>
              <legend style={{ fontWeight: 600 }}>{o.question}</legend>
              <p className="muted" style={{ margin: '0 0 0.25rem', fontSize: '0.9rem' }}>{o.plain}</p>
              <div className="row">
                {o.choices.map(([v, label]) => (
                  <label key={v} className="row" style={{ gap: '0.3rem', fontWeight: 400 }}>
                    <input type="radio" name={`g-${o.id}`} value={v} checked={answers[o.id] === v} onChange={() => setAnswers((a) => ({ ...a, [o.id]: v }))} data-testid={`guess-${o.id}-${v}`} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {err && <Notice kind="err">The calculation failed: {err}</Notice>}
          <div className="row">
            <button type="button" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="primary" disabled={!allAnswered || busy} onClick={() => void apply()} data-testid="guided-apply">
              {busy ? 'Calculating…' : 'Apply the rate cut and calculate'}
            </button>
            {!allAnswered && <span className="muted" style={{ fontSize: '0.9rem' }}>Answer all three to continue.</span>}
          </div>
        </section>
      )}

      {step === 4 && result && (
        <GuidedResult result={result} answers={answers} onRestart={() => { setAnswers({}); setResult(null); setStep(3); }} onAdd={addToLab} added={added} canAdd={state.slots.length < 4} />
      )}
    </div>
  );
}

function GuidedResult({ result, answers, onRestart, onAdd, added, canAdd }: {
  result: { base: RunOutput; cut: RunOutput; baseIn: ScenarioInput; cutIn: ScenarioInput };
  answers: Partial<Record<Outcome['id'], Answer>>;
  onRestart: () => void; onAdd: () => void; added: boolean; canAdd: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const { base, cut, baseIn, cutIn } = result;
  const n = explainComparison(baseIn, base, cutIn, cut, 'servicing');
  const words: Record<Answer, string> = { up: 'up', down: 'down', same: 'about the same' };
  return (
    <section className="card stack" aria-labelledby="g4" data-testid="guided-result">
      <h1 id="g4" ref={heading} tabIndex={-1}>What the model calculated</h1>
      <div className="table-wrap">
        <table data-testid="guided-table" className="stack-table">
          <caption>Baseline versus the rate cut, all {base.population.loanCount.toLocaleString()} loans</caption>
          <thead><tr><th scope="col">Result</th><th scope="col">Baseline</th><th scope="col">After the rate cut</th><th scope="col">Difference</th><th scope="col">Your prediction</th></tr></thead>
          <tbody>
            {OUTCOMES.map((o) => {
              const b = o.pick(base), s = o.pick(cut);
              const actual = direction(o, b, s);
              const guess = answers[o.id]!;
              return (
                <tr key={o.id} data-testid={`guided-row-${o.id}`}>
                  <th scope="row">{o.measure}</th>
                  <td data-label="Baseline">{o.format(b)}</td>
                  <td data-label="After the rate cut">{o.format(s)}</td>
                  <td data-label="Difference">{o.diff(b, s)} <TrendArrow trend={trendOf(o.trend, b, s)} /></td>
                  <td data-label="Your prediction">{guess === actual ? `Matches (${words[guess]})` : `You said ${words[guess]}; it went ${words[actual]}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2>Why</h2>
      <p data-testid="guided-headline"><strong>{n.headline}</strong></p>
      <ul>{n.points.filter((x) => !/recapture|net present value/i.test(x)).map((x, i) => <li key={i}>{x}</li>)}</ul>
      <p data-testid="guided-takeaway">
        {(() => {
          const pb = servicingPvParts(base), ps = servicingPvParts(cut);
          const feesLost = pb.fees - ps.fees, costsSaved = pb.costs - ps.costs;
          const faster = cut.summary.prepaid12 > base.summary.prepaid12;
          if (!faster) return 'In this example prepayment barely changed, so neither income nor value moved much.';
          return `Only the offer rate changed, so value could move only through how long loans stay. Loans that paid off sooner stopped paying servicing fees (${usd(feesLost, { compact: true })} less in today’s dollars) and stopped costing money to service (${usd(costsSaved, { compact: true })} less). ${feesLost > costsSaved ? 'The fees given up were larger, so value fell.' : 'The costs saved were larger, so value rose.'}`;
        })()}{' '}
        That is a result of these assumptions, not a rule: with a much lower fee or a higher cost per loan, faster payoffs can raise servicing value. Try it in the Scenario lab.
      </p>
      <TrustNote />
      <div className="row">
        <button type="button" onClick={onRestart}>Predict again</button>
        {canAdd && !added && <button type="button" onClick={onAdd} data-testid="guided-add">Add this rate cut to my scenarios</button>}
        {added && <span className="badge ok" role="status">Added as a new scenario; your other scenarios were not changed.</span>}
        {!canAdd && <span className="muted">You already have four scenarios; delete one in the Scenario lab to add this one.</span>}
        <button type="button" className="primary" onClick={() => navigate('overview')} data-testid="guided-done">Go to the dashboard</button>
      </div>
    </section>
  );
}
