/**
 * Version identifiers.
 *
 * Calculation-version policy for MODEL_VERSION (mpl-engine-MAJOR.MINOR.PATCH):
 * - MAJOR: the meaning of an assumption or input changes. Older scenario files cannot be
 *   reinterpreted and are refused with an explanation.
 * - MINOR: the same assumptions give materially different numbers (a formula, coefficient,
 *   default or numerical-boundary change). Older files and saved work keep their assumptions
 *   and notes, are recalculated explicitly with the current model, and are labeled as such;
 *   their saved results are never treated as reproductions.
 * - PATCH: no change to any calculated number (wording, layout, performance).
 * Every released MINOR or MAJOR change is listed in LEGACY_MODEL_VERSIONS (if older files can
 * be recalculated) and in docs/RELEASE_NOTES.md.
 */
export const MODEL_VERSION = 'mpl-engine-1.1.0';
export const SCHEMA_VERSION = 1;
/** 1.1.0 rounds generated balances and payments to cents so every browser builds identical loans. */
export const GENERATOR_VERSION = 'synthetic-gen-1.1.0';
export const SUPPORTED_MODEL_VERSIONS: readonly string[] = [MODEL_VERSION];
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [SCHEMA_VERSION];

/**
 * Older model versions whose assumptions mean the same thing today. Files and saved work from
 * them are recalculated with MODEL_VERSION; the note says what changed in the numbers.
 */
export const LEGACY_MODEL_VERSIONS: Readonly<Record<string, string>> = {
  'mpl-engine-1.0.0':
    'Model 1.1.0 is the first version number for the refinance-threshold correction (finding F1): loans exactly 50 basis points above the offer rate, such as 6.75% loans at the default 6.25% offer, were wrongly treated as having an incentive and accumulated burnout. That correction first shipped under the 1.0.0 label, so a 1.0.0 file may hold numbers from before or after it. Assumptions mean the same thing in both versions.',
};

/** The source build that produced this app (git commit, or "local"/"test"), recorded in exports. */
export const APP_BUILD: string = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown';
