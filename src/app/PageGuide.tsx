import { href, type Route } from './router';
const GUIDES: Partial<Record<Route, { text: string; next: Route; label: string }>> = {
  overview: { text: 'Start here: read the baseline, predict what a change will do, then try one experiment below. Those experiment buttons run immediately.', next: 'guided', label: 'Walk me through it' },
  lab: { text: '1. Pick a scenario. 2. Change one assumption. 3. Press Run above. 4. Compare with the frozen baseline. Clearing a field does not mean zero; enter 0 explicitly. Escape restores the last valid value. Unfinished text is discarded when you leave this page.', next: 'decision', label: 'Next: compare and explain' },
  cohorts: { text: 'Compare groups of loans to see where the differences come from. Filters change the population across the workspace; clear them to return to the whole book.', next: 'decision', label: 'Next: compare scenarios' },
  credit: { text: 'Start with Simulate score refresh below, inspect the information changes, then apply or discard them. The Run button above runs mortgage scenarios; it does not refresh scores.', next: 'share', label: 'How to save this workspace' },
  decision: { text: 'Compare the scenarios, write what you learned in Decision notes, then use Files and brief to save or share. Unrun edits must be resolved before exporting.', next: 'share', label: 'Sharing instructions' },
  validation: { text: 'Use this workspace to practice checking a forecast against sample outcomes. This exercise does not establish real-world accuracy.', next: 'methodology', label: 'Understand the model limits' },
  learn: { text: 'Choose one lesson at a time. Predict first, run the exercise, and explain the result in your own words.', next: 'lab', label: 'Try your own scenario' },
  glossary: { text: 'Look up an unfamiliar term, then return to your experiment. The question-mark buttons beside labels explain terms without leaving a page.', next: 'lab', label: 'Back to the scenario lab' },
  methodology: { text: 'Use this reference to inspect the calculation rules and limitations. Tested arithmetic and realistic-looking charts do not establish predictive accuracy.', next: 'home', label: 'Choose your next step' },
};
export function PageGuide({ route }: { route: Route }) {
  const guide = GUIDES[route];
  if (!guide) return null;
  return <aside className="page-guide no-print" aria-label="How to use this page"><p>{guide.text}</p><a href={href(guide.next)}>{guide.label} →</a></aside>;
}
