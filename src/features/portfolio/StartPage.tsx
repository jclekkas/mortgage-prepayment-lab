import { useState } from 'react';
import { navigate } from '../../app/router';
import { useStore, type Role } from '../../app/store';
import { PRESETS, loadPreset } from '../../data/presets';
import type { Lens } from '../../domain/narrative';

const GOALS: { id: Lens; title: string; body: string }[] = [
  { id: 'servicing', title: 'Protect servicing cash flow', body: 'See how payoffs end servicing fees, which segments are exposed, and what you can influence.' },
  { id: 'investor', title: 'Compare investment cash flows', body: 'Follow principal and note interest to the loan owner, and how faster payoff changes timing.' },
  { id: 'learn', title: 'Learn prepayment math', body: 'Guided exercises on CPR, SMM, PSA, refinance incentive and recapture.' },
];

const ROLES: { id: Role; title: string; body: string }[] = [
  { id: 'gm', title: 'General manager', body: 'Headline measures, comparisons and a decision narrative.' },
  { id: 'director', title: 'Director', body: 'Segments, cost and recapture levers, sensitivities.' },
  { id: 'analyst', title: 'Analyst', body: 'Monthly ledger, formulas and validation detail open by default.' },
];

export function StartPage() {
  const { state, dispatch } = useStore();
  const [goal, setGoal] = useState<Lens>(state.goal);
  const [role, setRole] = useState<Role>(state.role);
  const [preset, setPreset] = useState(state.portfolio.meta.presetId && PRESETS.some((p) => p.id === state.portfolio.meta.presetId) ? state.portfolio.meta.presetId : 'mixed');
  const go = () => {
    dispatch({ type: 'start', goal, role, portfolio: loadPreset(preset) });
    navigate(goal === 'learn' ? 'learn' : 'overview');
  };
  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <div>
        <h1>What would you like to understand?</h1>
        <p className="muted">
          An educational simulator of how borrower prepayments change a mortgage servicing portfolio. Every loan is synthetic.
          Results are illustrative, not market values, accounting marks or a FICO model.
        </p>
      </div>
      <section aria-labelledby="goal-h">
        <h2 id="goal-h">Your goal</h2>
        <div className="choice-grid">
          {GOALS.map((g) => (
            <button key={g.id} type="button" className="choice" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>
              <strong>{g.title}</strong>
              <span className="muted">{g.body}</span>
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="role-h">
        <h2 id="role-h">Your role</h2>
        <p className="muted">Role changes how much detail is shown first. It never changes formulas or what you can open.</p>
        <div className="choice-grid">
          {ROLES.map((r) => (
            <button key={r.id} type="button" className="choice" aria-pressed={role === r.id} onClick={() => setRole(r.id)}>
              <strong>{r.title}</strong>
              <span className="muted">{r.body}</span>
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="pf-h">
        <h2 id="pf-h">Synthetic portfolio</h2>
        <div className="choice-grid">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="choice" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)} data-testid={`preset-${p.id}`}>
              <strong>{p.name}</strong>
              <span className="muted">{p.description} 1,000 loans, seed 42.</span>
            </button>
          ))}
        </div>
      </section>
      <div className="row">
        <button type="button" className="primary" onClick={go} data-testid="start">
          Start
        </button>
        {state.started && <span className="muted">Starting again with a different portfolio replaces your current scenarios.</span>}
      </div>
    </div>
  );
}
