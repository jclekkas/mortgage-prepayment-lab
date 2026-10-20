import { ResetWorkspace } from '../ui/ResetWorkspace';
import { LineIcon } from './Shell';
import { useState } from 'react';
import { href } from './router';
import { useStore } from './store';

export function HomePage() {
  const { state } = useStore();
  return <div className="stack welcome home-page">
    <header className="home-brand"><a href={href('home')} aria-label="Prepayment Lab Home"><LineIcon /><span>Prepayment Lab</span></a><span className="muted">Mortgage learning workspace</span></header>
    <div className="home-intro">
    <p className="kicker">Learn by changing one thing at a time</p>
    <h1 id="page-title">What happens when borrowers pay their mortgages off early?</h1>
    <p>Explore how early payoffs change fee income, costs and the timing of money coming back. This is a teaching tool with made-up loans, not a forecast of a real portfolio.</p>
    </div>
    {state.started && <section className="card"><h2>Your workspace is still here</h2><p>{state.portfolio.meta.name} · {state.slots.length} scenarios. Going Home does not reset your work.</p><a href={href('overview')}>Resume workspace →</a></section>}
    <div className="home-steps">
      <section className="card"><p className="kicker">1 · Learn</p><h2>New to mortgages?</h2><p>A short guided experiment explains who earns what, asks for your prediction, then shows a rate cut alongside an unchanged baseline.</p><a href={href(state.started ? 'guided' : 'start')}>Start the guided experience →</a></section>
      <section className="card"><p className="kicker">2 · Experiment</p><h2>Change an assumption</h2><p>Choose a scenario, edit one number, then press Run. The baseline stays fixed so you can see the difference.</p><a href={href(state.started ? 'lab' : 'start')}>Open the scenario lab →</a></section>
      <section className="card"><p className="kicker">3 · Explain and share</p><h2>Show someone what you learned</h2><p>Compare results, write your explanation and save a brief or a reproducible scenario file.</p><a href={href('share')}>Share and save →</a></section>
    </div>
    <details><summary>Where should I go next?</summary><ul>
      <li><a href={href('cohorts')}>Loan groups</a>: see which kinds of loans account for the results.</li>
      <li><a href={href('credit')}>Credit score refresh</a>: explore newer synthetic score information. It does not change prepayment calculations.</li>
      <li><a href={href('validation')}>Forecast check</a>: compare a prediction with sample outcomes; this does not validate the model for investing.</li>
      <li><a href={href('learn')}>Lessons</a>, <a href={href('glossary')}>Glossary</a> and <a href={href('methodology')}>Methodology</a>: learn the terms and inspect assumptions.</li>
    </ul></details>
    <div className="home-workspace-actions"><a href={href('start')}>Choose a different portfolio or change setup</a><ResetWorkspace /></div>
  </div>;
}

export function SharePage() {
  const [message, setMessage] = useState('');
  const link = `${window.location.origin}${window.location.pathname}#/home`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setMessage('Link copied. It opens the tool, not your scenarios.'); }
    catch { setMessage('Copy was unavailable. Select the link below and copy it manually.'); }
  };
  return <div className="stack welcome">
    <h2>Share the tool or share your analysis</h2>
    <p>Your workspace stays on this device. Sending a web link does not send your assumptions, notes, filters or results.</p>
    <section className="card"><h3>Invite someone to try the tool</h3><p>No sign-in is needed. They can start their own guided experiment using synthetic loans.</p>
      <label htmlFor="share-url">Link to the home page</label><input id="share-url" readOnly value={link} onFocus={(e) => e.target.select()} />
      <button type="button" onClick={copy}>Copy tool link</button><p role="status">{message}</p>
    </section>
    <section className="card"><h3>Share the results you calculated</h3><ol>
      <li>Run each edited scenario so its results match its assumptions.</li>
      <li>Open <a href={href('decision')}>Decision room</a> and add notes about what changed and what remains uncertain.</li>
      <li>Open <a href={href('decision', 'files')}>Files and brief</a>. Print the brief to a PDF for reading, or export the scenario file so a colleague can reproduce the calculation.</li>
      <li>Send the file yourself. To reproduce it, your colleague opens Files and brief, imports the file and checks the reproduction report.</li>
    </ol><p>Review notes before sending: the file includes your written notes and assumptions. Importing replaces the recipient’s workspace; they should export their own work first. No file is uploaded by this app.</p>
    <p>The brief and exports are blocked while results are stale. A reproducible calculation is not proof that its financial assumptions predict real outcomes.</p></section>
  </div>;
}
