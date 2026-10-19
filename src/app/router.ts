import { useEffect, useState } from 'react';

export type Route =
  | 'start' | 'overview' | 'lab' | 'cohorts' | 'decision' | 'validation' | 'learn' | 'glossary' | 'methodology' | 'brief';

const ROUTES: Route[] = ['start', 'overview', 'lab', 'cohorts', 'decision', 'validation', 'learn', 'glossary', 'methodology', 'brief'];

export interface Location {
  route: Route;
  /** Sub-path after the route, e.g. lesson id for #/learn/one-dollar. */
  sub: string | null;
}

export function parseHash(hash: string): Location {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const route = (ROUTES as string[]).includes(parts[0]) ? (parts[0] as Route) : 'start';
  return { route, sub: parts[1] ?? null };
}

export function href(route: Route, sub?: string): string {
  return `#/${route}${sub ? `/${sub}` : ''}`;
}

export function navigate(route: Route, sub?: string): void {
  window.location.hash = href(route, sub);
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setLoc(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return loc;
}
