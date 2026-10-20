import { useState, type ReactNode } from 'react';
import { href, navigate } from '../../app/router';
import { useStore, type Role } from '../../app/store';
import { PRESETS, loadPreset } from '../../data/presets';
import type { Lens } from '../../domain/narrative';

const GOALS: { id: Lens; title: string; body: string }[] = [
  { id: 'servicing', title: 'Protect servicing cash flow', body: 'See how payoffs end servicing fees, which segments are exposed, and what you can influence.' },
  { id: 'investor', title: 'Compare investment cash flows', body: 'Follow principal and note interest to the loan owner, and how faster payoff changes timing.' },
  { id: 'learn', title: 'Learn prepayment math', body: 'Guided exercises on prepayment speed (conditional prepayment rate and single monthly mortality), the Public Securities Association benchmark, refinance incentive and recapture.' },
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
  const go = (guided: boolean) => {
    dispatch({ type: 'start', goal, role, portfolio: loadPreset(preset) });
    navigate(guided ? 'guided' : goal === 'learn' ? 'learn' : 'overview');
  };
  const section = (n: string, id: string, title: string, note: string, children: ReactNode) => (
    <section aria-labelledby={id}>
      <h2 id={id} style={{ fontSize: 24, display: 'flex', gap: 12, alignItems: 'baseline' }}><span style={{ color: 'var(--accent)', fontWeight: 400, fontSize: 30 }} aria-hidden="true">{n}</span>{title}</h2>
      <p className="muted" style={{ fontSize: 14 }}>{note}</p>
      {children}
    </section>
  );
  return (
    <div className="start-grid">
      <div className="start-left">
        <a href={href('home')}>← Home — keep my workspace</a>
        <p className="rail-brand" style={{ margin: 0 }}>Mortgage Prepayment &amp; Servicing Lab</p>
        <h1 className="start-title">What would you like to understand?</h1>
        <p style={{ fontSize: 17 }}>
          An educational simulator of how borrower prepayments change a mortgage servicing portfolio. Every loan is synthetic.
          Results are illustrative, not market values, accounting marks or a FICO model.
        </p>
        <div className="trust-cells" aria-label="How far to trust these numbers">
          <div><p className="kicker">Checked</p>Arithmetic tested against hand-worked examples and an independent re-implementation.</div>
          <div><p className="kicker">Illustrative</p>Synthetic loans; borrower-behavior settings are teaching values, not calibrated.</div>
          <div><p className="kicker">Not established</p>Not tested against real loan outcomes or reviewed by a mortgage modeling professional.</div>
        </div>
        {state.started && (
          <p className="notice warn" data-testid="restart-warning">
            You already have a workspace ({state.portfolio.meta.name}, {state.slots.length} scenario{state.slots.length === 1 ? '' : 's'}). Choosing a different portfolio replaces those scenarios and notes. Keeping the same portfolio preserves them. To keep them, export them first from the Decision room, or choose Resume workspace below. Nothing changes until you press a Start button.
          </p>
        )}
        <div className="stack" style={{ display: 'grid', justifyItems: 'start', gap: 10 }}>
          {state.started && <a href={href('overview')}>Resume workspace — keep my scenarios</a>}
          <button type="button" className="primary" onClick={() => go(true)} data-testid="start-guided" style={{ fontSize: 16, padding: '10px 18px' }}>
            Start with a 3-minute guided experiment
          </button>
          <button type="button" onClick={() => go(false)} data-testid="start" style={{ fontSize: 16, padding: '10px 18px', marginTop: 0 }}>
            Skip the guide and open the dashboard
          </button>
        </div>
      </div>
      <div className="stack">
        {section('01', 'goal-h', 'Your goal', 'Sets the starting perspective: servicer or loan owner. You can switch at any time.',
          <div className="choice-grid">
            {GOALS.map((g) => (
              <button key={g.id} type="button" className="choice" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>
                <strong>{g.title}</strong>
                <span className="muted">{g.body}</span>
              </button>
            ))}
          </div>)}
        {section('02', 'role-h', 'Your role', 'Changes how much detail opens first. It never changes formulas or what you can open.',
          <div className="choice-grid">
            {ROLES.map((r) => (
              <button key={r.id} type="button" className="choice" aria-pressed={role === r.id} onClick={() => setRole(r.id)}>
                <strong>{r.title}</strong>
                <span className="muted">{r.body}</span>
              </button>
            ))}
          </div>)}
        {section('03', 'pf-h', 'Synthetic portfolio', 'Each book is 1,000 generated loans. No real borrower or market data.',
          <div className="choice-grid">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className="choice" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)} data-testid={`preset-${p.id}`}>
                <strong>{p.name}</strong>
                <span className="muted">{p.description} 1,000 synthetic loans.</span>
              </button>
            ))}
          </div>)}
      </div>
    </div>
  );
}
