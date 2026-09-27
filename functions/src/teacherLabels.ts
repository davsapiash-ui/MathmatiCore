/**
 * The route names the teacher reads, for the reports the server writes.
 *
 * The source of truth is react-ts-version/src/core/routeLabels.ts (every
 * staff screen reads it). The functions build cannot import from the
 * frontend, so this is a copy, and `__tests__/teacherLabels.test.ts` fails
 * the moment the two differ (owner, 27.9.2026: one wording everywhere).
 * Labels only: the stored values 'green_path' and 'remediation_path' do not
 * change.
 */
export const ROUTE_NAME_HE = {
  green_path: "המסלול הירוק",
  remediation_path: "מסלול צמצום פערי קדם",
} as const;

/**
 * The three error categories of PRD Module 18, as the teacher reads them. The
 * source of truth is ERROR_CATEGORY_HE in the same frontend file, and the same
 * test keeps this copy equal to it. The stored keys ('calculation',
 * 'procedural', 'conceptual') do not change; only what the reports print.
 */
export const ERROR_CATEGORY_HE = {
  calculation: "טעות חישוב",
  procedural: "טעות בשלבי הפתרון",
  conceptual: "טעות בהבנת ערך המקום",
} as const;

/** The Hebrew name of a stored error category, or null for a key outside the three. */
export function errorCategoryHe(key: string): string | null {
  return Object.prototype.hasOwnProperty.call(ERROR_CATEGORY_HE, key)
    ? ERROR_CATEGORY_HE[key as keyof typeof ERROR_CATEGORY_HE]
    : null;
}
