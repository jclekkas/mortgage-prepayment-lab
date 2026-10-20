/**
 * Save / import of scenario files. Assumptions are never reinterpreted: a file from an
 * unsupported schema or model version is rejected with a reason. A file from a listed older
 * model version (LEGACY_MODEL_VERSIONS, same assumption meanings) keeps its assumptions and
 * notes and is recalculated with the current model; the result says so, and its saved results
 * are compared as "before versus after the model change", never as a reproduction.
 */
import { portfolioHash } from '../data/generator';
import { PRESETS, loadPreset } from '../data/presets';
import { populationContext, stalenessReason } from '../domain/comparability';
import { IMPORT_LIMITS } from '../domain/config';
import { levelPayment } from '../domain/math';
import { scenarioInputHash, validateScenario } from '../domain/scenario';
import type { Loan, Portfolio, PopulationFilter, RunOutput, ScenarioInput } from '../domain/types';
import { APP_BUILD, LEGACY_MODEL_VERSIONS, MODEL_VERSION, SCHEMA_VERSION, SUPPORTED_MODEL_VERSIONS, SUPPORTED_SCHEMA_VERSIONS } from '../domain/version';
import { cleanText } from './sanitize';
import { CREDIT_DATA_LABEL, CREDIT_FIXTURE_VERSION, creditFixture, isValidApplied, snapshotsFor, type CreditSelection } from '../domain/credit';
import { scenarioFileSchema, type ScenarioFile } from './schema';

export interface DecisionNote {
  whatChanged: string;
  evidence: string;
  investigateNext: string;
}

export interface Workspace {
  portfolio: Portfolio;
  baselineId: string;
  scenarios: ScenarioInput[];
  filter: PopulationFilter;
  notes: Record<string, DecisionNote>;
  /** Synthetic credit-score selection; absent in files from before the credit workspace. */
  credit?: CreditSelection;
}

/** Raised when an export would label a result with a population it was not calculated for. */
export class PopulationMismatchError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Not exported: ${problems.length} result(s) do not match the current portfolio, valuation month and population.`);
    this.name = 'PopulationMismatchError';
  }
}

export function buildScenarioFile(ws: Workspace, results: RunOutput[], exportedAt = new Date().toISOString()): ScenarioFile {
  const ctx = populationContext(ws.portfolio, ws.filter);
  const problems = results.flatMap((r) => {
    const why = stalenessReason(r, ctx);
    return why ? [`${r.scenarioId}: ${why}`] : [];
  });
  if (problems.length) throw new PopulationMismatchError(problems);
  // Each saved result must sit next to the assumptions that produced it, never edited ones.
  for (const r of results) {
    const sc = ws.scenarios.find((x) => x.scenarioId === r.scenarioId);
    if (!sc || scenarioInputHash(sc) !== r.inputHash) {
      throw new Error(`The result for ${r.scenarioId} was calculated from different assumptions than the ones being saved. Run the scenario again, then export.`);
    }
  }
  const isPreset = PRESETS.some((p) => p.id === ws.portfolio.meta.presetId) && loadPreset(ws.portfolio.meta.presetId).meta.hash === ws.portfolio.meta.hash;
  return {
    fileType: 'mortgage-prepayment-lab/scenarios',
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    appBuild: APP_BUILD,
    exportedAt,
    portfolio: isPreset
      ? { kind: 'preset', presetId: ws.portfolio.meta.presetId, hash: ws.portfolio.meta.hash }
      : { kind: 'embedded', meta: ws.portfolio.meta, loans: ws.portfolio.loans },
    baselineId: ws.baselineId,
    scenarios: ws.scenarios,
    filter: ws.filter,
    notes: ws.notes,
    results: results.map((r) => ({
      scenarioId: r.scenarioId,
      inputHash: r.inputHash,
      runKey: r.runKey,
      summary: r.summary as unknown as Record<string, number | null>,
    })),
    ...(ws.credit ? { credit: creditBlock(ws.portfolio, ws.credit) } : {}),
  };
}

/** Records which synthetic snapshots were in use, with fingerprints, so an import can prove it reproduces them. */
export function creditBlock(portfolio: Portfolio, sel: CreditSelection): NonNullable<ScenarioFile['credit']> {
  const f = creditFixture(portfolio);
  return {
    fixtureVersion: f.fixtureVersion,
    dataLabel: CREDIT_DATA_LABEL,
    analysisDate: f.analysisDate,
    usedByPrepaymentResults: false,
    appliedSnapshots: snapshotsFor(f, sel.appliedSnapshotIds).map((x) => ({ id: x.id, kind: x.kind, label: x.label, observedLabel: x.observedLabel, observations: x.observations.length, fingerprint: x.fingerprint, provenance: x.provenance })),
    breakEven: { ...sel.breakEven },
  };
}

/** Restores the credit selection from a file, or explains why the default earlier information is used instead. */
function readCredit(portfolio: Portfolio, block: ScenarioFile['credit']): { credit: CreditSelection | undefined; note: string | null } {
  if (!block) return { credit: undefined, note: null };
  const f = creditFixture(portfolio);
  const ids = block.appliedSnapshots.map((x) => x.id);
  const fallback = 'The workspace uses the earlier synthetic score information instead; scenarios and results are unaffected.';
  if (block.fixtureVersion !== CREDIT_FIXTURE_VERSION) return { credit: undefined, note: `The file’s synthetic score data is version ${block.fixtureVersion}; this build has ${CREDIT_FIXTURE_VERSION}. ${fallback}` };
  if (!isValidApplied(f, ids)) return { credit: undefined, note: `The file refers to score snapshots this portfolio does not have (${ids.join(', ')}). ${fallback}` };
  const snaps = snapshotsFor(f, ids);
  if (snaps.some((x, i) => x.fingerprint !== block.appliedSnapshots[i].fingerprint)) return { credit: undefined, note: `The file’s score snapshots do not match the fixture this build generates (fingerprint differs). ${fallback}` };
  return { credit: { appliedSnapshotIds: ids, breakEven: { ...block.breakEven } }, note: null };
}

export class ImportError extends Error {
  constructor(message: string, public readonly details: string[] = []) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Contract checks a schema cannot express: P0 supports performing, fully amortizing fixed-rate loans only. */
export function loanProblems(l: Loan): string[] {
  const p: string[] = [];
  if (l.ageMonths + l.remainingTerm !== l.originalTerm) p.push(`${l.id}: age plus remaining term must equal original term (no modifications or term changes in this release).`);
  if (l.currentBalance > l.originalBalance + 0.01) p.push(`${l.id}: current balance exceeds original balance (negative amortization is not supported).`);
  const expected = levelPayment(l.originalBalance, l.noteRate, l.originalTerm);
  if (Math.abs(expected - l.contractualPayment) > Math.max(0.01, expected * 1e-6)) {
    p.push(`${l.id}: contractual payment ${l.contractualPayment.toFixed(2)} is not the level payment ${expected.toFixed(2)} for its balance, rate and term (interest-only, balloon or adjustable loans are not supported).`);
  }
  const r = l.noteRate / 12;
  // The scheduled payment must amortize the current balance over the remaining term.
  const needed = levelPayment(l.currentBalance, l.noteRate, l.remainingTerm);
  if (Math.abs(needed - l.contractualPayment) > Math.max(1, l.contractualPayment * 0.005)) {
    p.push(`${l.id}: current balance is inconsistent with the contractual schedule (partial curtailments and delinquency are not supported in this release).`);
  }
  if (l.currentBalance * r > l.contractualPayment) p.push(`${l.id}: payment does not cover interest.`);
  return p;
}

export interface ImportResult {
  workspace: Workspace;
  savedResults: ScenarioFile['results'];
  /** Set when the file came from an older, compatible model version and is being recalculated. */
  legacy: { fromVersion: string; note: string } | null;
  /** Set when the file's credit-score selection could not be restored and the default was used. */
  creditNote: string | null;
}

export async function readFileText(file: File): Promise<string> {
  if (file.size > IMPORT_LIMITS.maxBytes) throw new ImportError(`The file is ${(file.size / 1048576).toFixed(1)} megabytes; the limit is 10 megabytes.`);
  return file.text();
}

export function parseScenarioFile(text: string): ImportResult {
  if (text.length > IMPORT_LIMITS.maxBytes) throw new ImportError('The file is larger than the 10 megabyte limit.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JavaScript Object Notation (JSON), so it is not a scenario file from this app.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ImportError('The file is not a scenario file.');
  const obj = raw as Record<string, unknown>;
  if (obj.fileType !== 'mortgage-prepayment-lab/scenarios') throw new ImportError('This is not a Mortgage Prepayment Lab scenario file.');
  if (typeof obj.schemaVersion !== 'number' || !SUPPORTED_SCHEMA_VERSIONS.includes(obj.schemaVersion)) {
    throw new ImportError(
      typeof obj.schemaVersion === 'number' && obj.schemaVersion > SCHEMA_VERSION
        ? `This file uses schema version ${obj.schemaVersion}, made by a newer version of the lab. This version supports schema ${SCHEMA_VERSION}. Nothing was imported or changed.`
        : 'The file’s schema version is not supported. Nothing was imported.',
    );
  }
  const legacyNote = typeof obj.modelVersion === 'string' ? LEGACY_MODEL_VERSIONS[obj.modelVersion] : undefined;
  if (typeof obj.modelVersion !== 'string' || (!SUPPORTED_MODEL_VERSIONS.includes(obj.modelVersion) && !legacyNote)) {
    throw new ImportError(`The file was produced with model version "${String(obj.modelVersion)}". This lab runs ${MODEL_VERSION} and does not know how that version’s assumptions map to this one, so nothing was imported or changed.`);
  }
  const legacy = legacyNote ? { fromVersion: obj.modelVersion as string, note: legacyNote } : null;
  const parsed = scenarioFileSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ImportError('The file does not match the scenario format.', details);
  }
  const f = parsed.data;

  let portfolio: Portfolio;
  let presetRebuiltFrom: string | null = null;
  if (f.portfolio.kind === 'preset') {
    const preset = PRESETS.find((p) => p.id === (f.portfolio as { presetId: string }).presetId);
    if (!preset) throw new ImportError(`Unknown synthetic preset "${f.portfolio.presetId}".`);
    portfolio = loadPreset(preset.id);
    if (portfolio.meta.hash !== f.portfolio.hash) {
      // Same preset, different fingerprint: an earlier generator, or a browser engine whose last digits differed.
      // The preset is rebuilt by this version; nothing is reinterpreted silently.
      presetRebuiltFrom = f.portfolio.hash;
    }
  } else {
    const embedded = f.portfolio;
    const loans = embedded.loans as Loan[];
    const problems = loans.flatMap(loanProblems);
    if (problems.length) throw new ImportError(`${problems.length} loan record(s) use features this release does not support.`, problems.slice(0, 12));
    const ids = new Set(loans.map((l) => l.id));
    if (ids.size !== loans.length) throw new ImportError('Loan identifiers must be unique.');
    if (loans.some((l) => l.asOfMonth !== embedded.meta.asOfMonth)) {
      throw new ImportError('Every loan must have the portfolio as-of month.');
    }
    const meta = embedded.meta;
    const h = portfolioHash(loans, meta.asOfMonth, meta.seed, meta.generatorVersion);
    if (h !== meta.hash) throw new ImportError('The portfolio hash does not match its loans. The file may have been edited; it was not imported.');
    portfolio = { meta: { ...meta, name: cleanText(meta.name, 120), description: cleanText(meta.description, 500) }, loans };
  }

  // Scenarios from a compatible older model keep every assumption and are re-labeled for recalculation with this model;
  // scenarios on a rebuilt preset point to the rebuilt portfolio.
  const scenarios = f.scenarios.map((s) => ({
    ...s,
    name: cleanText(s.name, 120),
    modelVersion: legacyNote && s.modelVersion === obj.modelVersion ? MODEL_VERSION : s.modelVersion,
    portfolioHash: presetRebuiltFrom && s.portfolioHash === presetRebuiltFrom ? portfolio.meta.hash : s.portfolioHash,
  })) as ScenarioInput[];
  const recalcNotes = [
    ...(legacy ? [legacy.note] : []),
    ...(presetRebuiltFrom ? [`The file’s synthetic portfolio fingerprint (${presetRebuiltFrom.slice(0, 12)}…) differs from this version’s ${portfolio.meta.name} (${portfolio.meta.hash.slice(0, 12)}…). Earlier builds produced last-digit differences in loan amounts between browsers; this version rounds amounts to cents so every browser builds the same loans. The preset was rebuilt here, so saved numbers can differ slightly and are not checked as a reproduction.`] : []),
  ];
  const ids = new Set(scenarios.map((s) => s.scenarioId));
  if (ids.size !== scenarios.length) throw new ImportError('Scenario identifiers must be unique.');
  if (!ids.has(f.baselineId)) throw new ImportError('The baseline scenario is missing from the file.');
  for (const s of scenarios) {
    if (s.modelVersion !== MODEL_VERSION) throw new ImportError(`Scenario "${s.name}" uses model version ${s.modelVersion}.`);
    if (s.portfolioHash !== portfolio.meta.hash) throw new ImportError(`Scenario "${s.name}" was built for a different portfolio.`);
    if (s.valuationMonth !== portfolio.meta.asOfMonth) throw new ImportError(`Scenario "${s.name}" has a different valuation month from the portfolio.`);
    const errs = validateScenario(s);
    if (errs.length) throw new ImportError(`Scenario "${s.name}" has inputs outside supported bounds.`, errs.map((e) => e.message));
  }
  const notes: Record<string, DecisionNote> = {};
  for (const [k, n] of Object.entries(f.notes)) {
    if (!ids.has(k)) continue;
    notes[k] = { whatChanged: cleanText(n.whatChanged, 4000), evidence: cleanText(n.evidence, 4000), investigateNext: cleanText(n.investigateNext, 4000) };
  }
  const credit = readCredit(portfolio, f.credit);
  return {
    workspace: { portfolio, baselineId: f.baselineId, scenarios, filter: f.filter as PopulationFilter, notes, ...(credit.credit ? { credit: credit.credit } : {}) },
    creditNote: credit.note,
    savedResults: f.results,
    legacy: recalcNotes.length ? { fromVersion: obj.modelVersion as string, note: recalcNotes.join(' ') } : null,
  };
}
