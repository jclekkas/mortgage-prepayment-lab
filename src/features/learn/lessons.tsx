import type { ReactNode } from 'react';
import { lessonBooks } from '../../data/presets';
import type { LoanMonth } from '../../domain/engine';
import { pct, usd, usdExact } from '../../domain/format';
import { cprToSmm } from '../../domain/math';
import { defaultScenario } from '../../domain/scenario';
import { segmentKey, segmentOptions } from '../../domain/segments';
import type { Portfolio, RunOutput, ScenarioInput } from '../../domain/types';
import type { EngineClient } from '../../worker/client';

export interface LessonContext {
  client: EngineClient;
  portfolio: Portfolio;
}

export interface LessonOutcome {
  correctId: string;
  reveal: ReactNode;
  /** The reasoning behind the calculated answer, shown after every prediction, right or wrong. */
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  intro: string;
  question: string;
  options: { id: string; label: string }[] | ((ctx: LessonContext) => { id: string; label: string }[]);
  compute: (ctx: LessonContext) => Promise<LessonOutcome>;
}

const base = (p: Portfolio): ScenarioInput => defaultScenario(p.meta.hash, p.meta.asOfMonth);
const run = async (ctx: LessonContext, scenario: ScenarioInput): Promise<RunOutput> => (await ctx.client.request({ kind: 'run', scenario, filter: {} }).promise).result;
const runOn = async (ctx: LessonContext, portfolio: Portfolio, scenario: ScenarioInput): Promise<RunOutput> => (await ctx.client.request({ kind: 'runOn', portfolio, scenario }).promise).result;

export const LESSONS: Lesson[] = [
  {
    id: 'one-dollar',
    title: '1. Follow one dollar',
    intro: 'Three parties: the borrower makes the monthly payment; the loan owner (an investor) is owed the principal and interest; the servicer collects the payment, keeps a small annual fee, and passes the rest to the loan owner. The servicer does not own the loan.',
    question: 'If this borrower pays the loan off early, who receives the remaining principal?',
    options: [
      { id: 'owner', label: 'The loan owner (investor)' },
      { id: 'servicer', label: 'The servicer' },
      { id: 'split', label: 'Split between servicer and owner' },
    ],
    compute: async (ctx) => {
      const loan = ctx.portfolio.loans[0];
      const scenario = { ...base(ctx.portfolio), mode: 'fixedCpr' as const, prepaymentParameters: { fixedCpr: 0.06, psaPercent: 100 } };
      const rows: LoanMonth[] = (await ctx.client.request({ kind: 'loan', scenario, loanId: loan.id }).promise).result;
      const m = rows[0];
      return {
        correctId: 'owner',
        explanation: 'Servicing rights are a contract to collect payments for a fee. The servicer never owns the principal: scheduled and prepaid principal both pass through to the loan owner. What the servicer loses on a payoff is its future fee on that loan, because the loan no longer exists.',
        reveal: (
          <>
          <div className="table-wrap">
            <table>
              <caption>One synthetic loan, month 1, at a 6% yearly prepayment rate. Amounts are expected values (explained below).</caption>
              <tbody>
                <tr><th scope="row">Contractual payment</th><td>{usdExact(m.contractualPayment)}</td></tr>
                <tr><th scope="row">Interest (note rate {pct(loan.noteRate, 3)})</th><td>{usdExact(m.interest)}</td></tr>
                <tr><th scope="row">Scheduled principal → loan owner</th><td>{usdExact(m.scheduledPrincipal)}</td></tr>
                <tr><th scope="row">Expected prepaid principal → loan owner</th><td>{usdExact(m.prepaidPrincipal)}</td></tr>
                <tr><th scope="row">Servicing fee → servicer ({loan.servicingFeeBps} basis points a year)</th><td>{usdExact(m.grossFee)}</td></tr>
                <tr><th scope="row">Interest net of fee → loan owner</th><td>{usdExact(m.interest - m.grossFee)}</td></tr>
              </tbody>
            </table>
          </div>
          <p><strong>What “expected” means.</strong> The model does not know which borrowers will pay off. It multiplies each possible outcome by its probability. At a 6% yearly prepayment rate there is about a 0.5% chance this borrower pays off in full this month, so the expected prepaid principal is about 0.5% of the balance left after the scheduled payment. The real borrower either pays off the whole balance or pays nothing extra: the expected amount is an average across many similar borrowers, not a payment anyone actually makes. The same is why portfolio screens show fractional loan counts.</p>
          </>
        ),
      };
    },
  },
  {
    id: 'speedometer',
    title: '2. Read the speedometer',
    intro: 'The conditional prepayment rate (CPR) is a yearly speed. The model works monthly with the single monthly mortality (SMM): the share of the remaining balance, after the scheduled payment, that pays off early during the month. Monthly rates compound: each month applies to the balance left after earlier months, so twelve months at 0.50% remove slightly less than 6% of the starting balance.',
    question: 'At 6% CPR, what is the monthly SMM?',
    options: [
      { id: 'half', label: 'Exactly 0.50% (6% ÷ 12)' },
      { id: 'geo', label: 'About 0.514%' },
      { id: 'low', label: 'About 0.487%' },
    ],
    compute: async (ctx) => {
      const scenario = { ...base(ctx.portfolio), mode: 'fixedCpr' as const, prepaymentParameters: { fixedCpr: 0.06, psaPercent: 100 } };
      const out = await run(ctx, scenario);
      const smm = cprToSmm(0.06);
      const m = out.ledger[0];
      return {
        // The option closest to the calculated SMM is the correct one.
        correctId: (Object.entries({ half: 0.06 / 12, geo: 0.005143, low: 0.004868 }) as [string, number][]).reduce((a, x) => (Math.abs(x[1] - smm) < Math.abs(a[1] - smm) ? x : a))[0],
        explanation: 'Speeds compound. Surviving twelve months at monthly rate SMM leaves (1 − SMM)^12 of the balance, so SMM = 1 − (1 − CPR)^(1/12). Dividing by 12 ignores that each month applies to a smaller survivor balance.',
        reveal: (
          <>
            <p className="formula">SMM = 1 − (1 − 0.06)^(1/12) = {pct(smm, 5)}</p>
            <p>The engine’s month-1 portfolio ledger agrees: prepaid {usd(m.prepaidPrincipal, { compact: true })} ÷ eligible balance {usd(m.beginningUpb - m.scheduledPrincipal, { compact: true })} = {pct(m.smm, 5)}.</p>
            <p>CPR is a conditional annualized rate. It is not the share of today’s book that will be gone in a year, because scheduled principal also shrinks the book.</p>
          </>
        ),
      };
    },
  },
  {
    id: 'rates-fall',
    title: '3. Rates fall',
    intro: 'In the behavioral model a borrower’s refinance incentive is their existing mortgage rate (note rate) minus the offer rate available today, less a 50 basis point friction for cost and hassle. The default offer rate is 6.25%, so before the cut only borrowers above 6.75% have a positive incentive; after a 1 percentage point cut, borrowers above 5.75% do. A rate cut raises every borrower’s incentive by the same amount. What differs is the modeled response: the refinance probability follows an S-shaped curve, rising fastest around zero incentive.',
    question: 'If rates fall 100 basis points (1 percentage point), which group of borrowers, by existing mortgage rate, shows the largest increase in 12-month prepaid principal?',
    options: (ctx) => {
      const present = new Set(ctx.portfolio.loans.map((l) => segmentKey(l, 'coupon')));
      return segmentOptions('coupon', ctx.portfolio.loans).filter((o) => present.has(o.key)).map((o) => ({ id: o.key, label: o.label }));
    },
    compute: async (ctx) => {
      const b = base(ctx.portfolio);
      const [o0, o1] = await Promise.all([run(ctx, b), run(ctx, { ...b, scenarioId: 'lesson-shock', ratePath: { ...b.ratePath, shockBps: -100 } })]);
      const deltas = o1.cohorts.coupon.map((r) => ({ key: r.key, label: r.label, d: r.prepaid12 - (o0.cohorts.coupon.find((x) => x.key === r.key)?.prepaid12 ?? 0), share: r.prepaid12Share }));
      const best = deltas.reduce((a, x) => (x.d > a.d ? x : a), deltas[0]);
      return {
        correctId: best.key,
        explanation: 'Every group’s incentive rose by the same 100 basis points. The modeled response is not equal: the S-shaped curve is steepest around zero effective incentive, so groups that move from slightly negative to positive incentive gain the most probability, while groups far below the offer rate stay unlikely to refinance and groups already deep in the money were already responding. The dollar change also depends on how much balance sits in each group, and on loan age (new loans respond less) and burnout in this model. Those are teaching assumptions, not calibrated behavior.',
        reveal: (
          <div className="table-wrap">
            <table>
              <caption>12-month prepaid principal change, rates 100 basis points lower versus default assumptions</caption>
              <thead><tr><th scope="col">Borrower’s existing mortgage rate</th><th scope="col">Change</th></tr></thead>
              <tbody>{deltas.map((x) => <tr key={x.key}><th scope="row">{x.label}</th><td>{usd(x.d, { compact: true, signed: true })}</td></tr>)}</tbody>
            </table>
          </div>
        ),
      };
    },
  },
  {
    id: 'same-speed',
    title: '4. Same speed, different cost',
    intro: 'Two books have the same loan ages, rates and prepayment speed (an 8% conditional prepayment rate, CPR), the same servicing fee of 25 basis points (0.25%) of the balance a year, and the same $100 annual cost per loan. One has $150,000 loans, the other $600,000 loans.',
    question: 'Which book has the higher servicing value per dollar of unpaid principal balance (UPB)?',
    options: [
      { id: 'small', label: 'The small-loan book' },
      { id: 'large', label: 'The large-loan book' },
      { id: 'same', label: 'They are the same: same speed, same fee rate' },
    ],
    compute: async (ctx) => {
      const { small, large } = lessonBooks();
      const sc = (p: Portfolio) => ({ ...base(p), mode: 'fixedCpr' as const });
      const [os, ol] = await Promise.all([runOn(ctx, small, sc(small)), runOn(ctx, large, sc(large))]);
      const vs = os.summary.servicingValueBps!, vl = ol.summary.servicingValueBps!;
      return {
        correctId: Math.abs(vs - vl) < 0.05 ? 'same' : vl > vs ? 'large' : 'small',
        explanation: 'Fee income scales with balance but cost scales with the number of loans. A $150,000 loan earns $375 a year at 25 basis points and costs $100; a $600,000 loan earns $1,500 for the same $100. Per dollar of balance, small loans keep much less margin.',
        reveal: (
          <div className="table-wrap">
            <table>
              <caption>Both books at 8% CPR, a 25 basis point fee and $100 per loan</caption>
              <thead><tr><th scope="col">Book</th><th scope="col">Balance</th><th scope="col">Servicing net present value (NPV)</th><th scope="col">Basis points of balance</th></tr></thead>
              <tbody>
                <tr><th scope="row">Small loans</th><td>{usd(os.summary.currentUpb, { compact: true })}</td><td>{usd(os.summary.servicingNpv, { compact: true })}</td><td>{vs.toFixed(1)}</td></tr>
                <tr><th scope="row">Large loans</th><td>{usd(ol.summary.currentUpb, { compact: true })}</td><td>{usd(ol.summary.servicingNpv, { compact: true })}</td><td>{vl.toFixed(1)}</td></tr>
              </tbody>
            </table>
          </div>
        ),
      };
    },
  },
  {
    id: 'keep-customer',
    title: '5. Keep the customer',
    intro: 'Recapture means a borrower who refinances takes the new loan from you. The old loan is still paid off and its servicing fee still stops; the new loan earns a one-time origination contribution, counted separately.',
    question: 'If the recapture share triples from 20% to 60%, what happens to the original book’s servicing net present value (NPV), its future fees less costs in today’s dollars?',
    options: [
      { id: 'up', label: 'It rises, because fewer loans are lost' },
      { id: 'same', label: 'It does not change' },
      { id: 'down', label: 'It falls' },
    ],
    compute: async (ctx) => {
      const b = base(ctx.portfolio);
      const [o20, o60] = await Promise.all([run(ctx, b), run(ctx, { ...b, scenarioId: 'lesson-recap', recaptureParameters: { ...b.recaptureParameters, share: 0.6 } })]);
      const d = o60.summary.servicingNpv - o20.summary.servicingNpv;
      return {
        correctId: Math.abs(d) < 0.01 ? 'same' : d > 0 ? 'up' : 'down',
        explanation: 'The original loan still pays off in full and its servicing fee still stops. Recapture creates a separate new loan with its own origination contribution, shown as a separate number. This release does not add the new loan’s servicing value.',
        reveal: (
          <div className="table-wrap">
            <table>
              <caption>Default assumptions, recapture 20% versus 60%</caption>
              <thead><tr><th scope="col">Measure</th><th scope="col">20%</th><th scope="col">60%</th></tr></thead>
              <tbody>
                <tr><th scope="row">Original-book servicing NPV</th><td>{usd(o20.summary.servicingNpv, { compact: true })}</td><td>{usd(o60.summary.servicingNpv, { compact: true })}</td></tr>
                <tr><th scope="row">Recapture contribution in today’s dollars</th><td>{usd(o20.summary.recapturePv, { compact: true })}</td><td>{usd(o60.summary.recapturePv, { compact: true })}</td></tr>
                <tr><th scope="row">12-month prepaid principal</th><td>{usd(o20.summary.prepaid12, { compact: true })}</td><td>{usd(o60.summary.prepaid12, { compact: true })}</td></tr>
              </tbody>
            </table>
          </div>
        ),
      };
    },
  },
  {
    id: 'challenge-forecast',
    title: '6. Challenge the forecast',
    intro: 'A forecast was frozen 24 months ago assuming the offer rate would stay at 6.75%. In the synthetic history that followed, offer rates drifted down to about 6% within a year. Lower rates mean more refinancing in this model.',
    question: 'Over those 24 months, did the frozen forecast predict too many or too few payoff dollars?',
    options: [
      { id: 'many', label: 'Too many: actual payoffs were lower' },
      { id: 'few', label: 'Too few: actual payoffs were higher' },
      { id: 'right', label: 'About right (within 5%)' },
    ],
    compute: async (ctx) => {
      const v = (await ctx.client.request({ kind: 'validation' }).promise).result;
      const f = v.scores.find((s) => s.id === 'frozen')!;
      const ar = v.scores.find((s) => s.id === 'actualRates')!;
      const actual = v.months.reduce((a, m) => a + m.actualPrepaid, 0);
      const share = f.prepaidError / actual;
      const worst = v.cohorts.reduce((a, c) => (Math.abs(c.bias) > Math.abs(a.bias) ? c : a), v.cohorts[0]);
      return {
        correctId: Math.abs(share) <= 0.05 ? 'right' : share > 0 ? 'many' : 'few',
        explanation: 'Compare cumulative forecast prepaid dollars with the synthetic actual. Then check how much of the miss disappears when the same model is re-run on the rates that actually occurred: what remains is a behavior miss.',
        reveal: (
          <>
            <p>Frozen forecast minus actual: {usd(f.prepaidError, { compact: true, signed: true })} ({(share * 100).toFixed(1)}% of actual). Re-run with actual rates: {usd(ar.prepaidError, { compact: true, signed: true })}.</p>
            <p>The largest dollar bias is in the {worst.label} band ({usd(worst.bias, { compact: true, signed: true })}). Write a hypothesis in the validation lab. A better fit to one synthetic history is evidence, not proof.</p>
          </>
        ),
      };
    },
  },
];
