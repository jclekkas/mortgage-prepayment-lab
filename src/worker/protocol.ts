import type { LoanMonth } from '../domain/engine';
import type { GridResult, SensitivityRow } from '../domain/sensitivity';
import type { Portfolio, PopulationFilter, RunOutput, ScenarioInput } from '../domain/types';
import type { ValidationResult } from '../domain/validation';

export type Job =
  | { kind: 'run'; scenario: ScenarioInput; filter: PopulationFilter }
  | { kind: 'loan'; scenario: ScenarioInput; loanId: string }
  | { kind: 'sensitivity'; scenario: ScenarioInput; filter: PopulationFilter }
  | { kind: 'grid'; scenario: ScenarioInput; filter: PopulationFilter }
  | { kind: 'validation' }
  | { kind: 'runOn'; portfolio: Portfolio; scenario: ScenarioInput };

export interface JobResultMap {
  run: RunOutput;
  loan: LoanMonth[];
  sensitivity: SensitivityRow[];
  grid: GridResult;
  validation: ValidationResult;
  runOn: RunOutput;
}

export type ToWorker =
  | { type: 'setPortfolio'; portfolio: Portfolio }
  | { type: 'job'; id: number; job: Job }
  | { type: 'cancel'; id: number };

export type FromWorker =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'result'; id: number; result: unknown; cached: boolean }
  | { type: 'error'; id: number; message: string; fields?: { field: string; message: string }[] }
  | { type: 'cancelled'; id: number };
