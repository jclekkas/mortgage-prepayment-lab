import { Component, useEffect, useRef, type ReactNode } from 'react';
import { BriefPage } from '../features/decision/BriefPage';
import { DecisionPage } from '../features/decision/DecisionPage';
import { GlossaryPage } from '../features/learn/GlossaryPage';
import { LearnPage } from '../features/learn/LearnPage';
import { MethodologyPage } from '../features/learn/MethodologyPage';
import { CohortsPage } from '../features/portfolio/CohortsPage';
import { OverviewPage } from '../features/portfolio/OverviewPage';
import { StartPage } from '../features/portfolio/StartPage';
import { LabPage } from '../features/scenarios/LabPage';
import { ValidationPage } from '../features/validation/ValidationPage';
import { MODEL_VERSION } from '../domain/version';
import { Header } from './Header';
import { useLocation } from './router';
import { StoreProvider, useStore } from './store';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <main>
          <div className="notice err" role="alert">
            <h1>Something went wrong displaying this page</h1>
            <p>{this.state.error.message}</p>
            <p>Your scenarios are kept on this device if storage is available. <a href="#/overview" onClick={() => this.setState({ error: null })}>Return to the overview</a>.</p>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function Routes() {
  const { route, sub } = useLocation();
  const { state } = useStore();
  const mainRef = useRef<HTMLElement>(null);
  // Move focus to the page heading on navigation so screen readers announce the new page.
  useEffect(() => {
    const h = mainRef.current?.querySelector('h1');
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: false });
    }
  }, [route, sub]);
  const page = (() => {
    switch (route) {
      case 'start': return <StartPage />;
      case 'overview': return <OverviewPage />;
      case 'lab': return <LabPage />;
      case 'cohorts': return <CohortsPage />;
      case 'decision': return <DecisionPage />;
      case 'validation': return <ValidationPage />;
      case 'learn': return <LearnPage sub={sub} />;
      case 'glossary': return <GlossaryPage />;
      case 'methodology': return <MethodologyPage />;
      case 'brief': return <BriefPage />;
    }
  })();
  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <p className="preview-note" role="note" data-testid="preview-note">
        Educational simulation with synthetic data and illustrative assumptions. Not investment advice.
      </p>
      {route !== 'start' && <Header route={route} />}
      <main id="main" ref={mainRef} tabIndex={-1}>
        <ErrorBoundary key={route}>{page}</ErrorBoundary>
      </main>
      <div className="sr-only" role="status" aria-live="polite" data-testid="announcer">{state.announcement}</div>
      <footer className="footer">
        Independent educational project, not affiliated with, sponsored or endorsed by FICO or any lender. Synthetic data only. Illustrative results are
        not market value, accounting fair value or investment advice. Model {MODEL_VERSION} · build <span data-testid="build-commit">{__BUILD_COMMIT__.slice(0, 7)}</span>.
      </footer>
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Routes />
    </StoreProvider>
  );
}
