import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
const Context = createContext({ errors: {} as Record<string, string>, setIssue: (_id: string, _issue: string | null) => {} });
/** Visible unfinished fields are separate from the last valid calculation inputs. */
export function FieldStatusProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const setIssue = useCallback((id: string, issue: string | null) => setErrors((old) => {
    if ((old[id] ?? null) === issue) return old;
    const next = { ...old };
    if (issue) next[id] = issue; else delete next[id];
    return next;
  }), []);
  return <Context.Provider value={{ errors, setIssue }}>{children}</Context.Provider>;
}
export const useFieldStatus = () => useContext(Context);
