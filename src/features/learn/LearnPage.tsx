import { useEffect, useRef, useState } from 'react';
import { href } from '../../app/router';
import { useStore } from '../../app/store';
import { Notice } from '../../ui/misc';
import { LESSONS, type Lesson, type LessonOutcome } from './lessons';
import { TermsOnPage } from '../../ui/TermHelp';
import type { TermId } from '../../ui/terms';

const LEARN_TERMS: TermId[] = ['cpr', 'smm', 'psa', 'bp', 'upb', 'npv', 'pv', 'msr', 'incentive', 'friction', 'recapture'];

export function LearnPage({ sub }: { sub: string | null }) {
  const { state } = useStore();
  const lesson = LESSONS.find((l) => l.id === sub);
  // Keyed by lesson so each lesson starts with fresh answer and result state.
  if (lesson) return <LessonView key={lesson.id} lesson={lesson} />;
  const done = LESSONS.filter((l) => state.exercises[l.id]?.done).length;
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>Learn by predicting</h1>
      <TermsOnPage ids={LEARN_TERMS} />
      <p>Six short exercises. Each asks you to commit to a prediction before it shows the calculated answer. Progress is stored on this device. Completed: {done} of {LESSONS.length}.</p>
      <ol className="stack" style={{ paddingLeft: '1.2rem' }}>
        {LESSONS.map((l) => (
          <li key={l.id}>
            <a href={href('learn', l.id)} data-testid={`lesson-${l.id}`}>{l.title.replace(/^\d+\.\s*/, '')}</a>
            {state.exercises[l.id]?.done && <span className="badge ok" style={{ marginLeft: '0.5rem' }}>Completed</span>}
            <div className="muted" style={{ fontSize: '0.9rem' }}>{l.intro}</div>
          </li>
        ))}
      </ol>
      <p><a href={href('glossary')}>Glossary of terms</a></p>
    </div>
  );
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const { client, state, dispatch } = useStore();
  const ctx = { client, portfolio: state.portfolio };
  const options = typeof lesson.options === 'function' ? lesson.options(ctx) : lesson.options;
  const [choice, setChoice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<LessonOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idx = LESSONS.indexOf(lesson);
  const next = LESSONS[idx + 1];
  // A calculation that finishes after the learner has left this lesson must not publish its answer.
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const check = async () => {
    if (!choice) return;
    setBusy(true);
    setErr(null);
    try {
      const o = await lesson.compute(ctx);
      if (!live.current) return;
      setOutcome(o);
      dispatch({ type: 'exercise', id: lesson.id, record: { done: true, prediction: choice, correct: o.correctId === choice } });
      dispatch({ type: 'announce', text: o.correctId === choice ? 'Your prediction matches the calculation.' : 'Your prediction differs from the calculation. See the explanation.' });
    } catch (e) {
      if (live.current) setErr((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const correct = outcome && choice === outcome.correctId;
  return (
    <div className="stack" style={{ maxWidth: 820 }} data-testid={`lesson-view-${lesson.id}`}>
      <a href={href('learn')}>← All exercises</a>
      <h1>{lesson.title}</h1>
      <TermsOnPage ids={LEARN_TERMS} />
      <p>{lesson.intro}</p>
      <fieldset className="card" disabled={!!outcome}>
        <legend style={{ fontWeight: 700 }}>Predict first: {lesson.question}</legend>
        <div className="stack">
          {options.map((o) => (
            <label key={o.id} className="row" style={{ fontWeight: 400 }}>
              <input type="radio" name={`q-${lesson.id}`} value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
        <button type="button" className="primary" style={{ marginTop: '0.75rem' }} disabled={!choice || busy} onClick={() => void check()} data-testid="check-prediction">
          {busy ? 'Calculating…' : 'Lock in prediction and calculate'}
        </button>
      </fieldset>
      {err && <Notice kind="err">The calculation failed: {err}</Notice>}
      {outcome && (
        <section className="card stack" aria-live="polite" data-testid="lesson-result">
          <h2>{correct ? 'Your prediction matches the calculation' : 'The calculation says otherwise'}</h2>
          <p>
            <strong>Calculated answer:</strong> {options.find((o) => o.id === outcome.correctId)?.label}. {correct ? '' : `You predicted: ${options.find((o) => o.id === choice)?.label}.`}
          </p>
          <p data-testid="lesson-explanation"><strong>Why:</strong> {outcome.explanation}</p>
          {outcome.reveal}
          <div className="row">
            <button type="button" onClick={() => { setOutcome(null); setChoice(null); }}>Try again</button>
            {next ? <a className="button" href={href('learn', next.id)}>Next: {next.title.replace(/^\d+\.\s*/, '')}</a> : <a className="button" href={href('learn')}>Back to exercises</a>}
          </div>
        </section>
      )}
    </div>
  );
}
