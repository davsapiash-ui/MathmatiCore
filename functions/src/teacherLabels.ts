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
