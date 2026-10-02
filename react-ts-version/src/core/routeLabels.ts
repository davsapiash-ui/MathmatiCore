/**
 * What the teacher reads for the two learning routes, the gate between
 * meetings 2 and 3, a learner's open coaching card and the three error
 * categories — one wording on every staff screen (owner, 27.9.2026; register
 * ט: "שם אחד לכל רכיב").
 *
 * Labels only. The stored values — 'green_path', 'remediation_path',
 * 'calculation', 'procedural', 'conceptual' — and every database field stay
 * as they are; only what is written on the screen changes. The server's
 * reports carry a copy of the route names (functions/src/teacherLabels.ts),
 * held equal to this one by a test.
 */

/** The ten-thousands route and the hundreds/thousands route. */
export const ROUTE_NAME_HE = {
  green_path: 'המסלול הירוק',
  remediation_path: 'מסלול צמצום פערי קדם',
} as const;

export type RoutePath = keyof typeof ROUTE_NAME_HE;

/** The two approval buttons at the gate. */
export const ROUTE_APPROVE_HE: Readonly<Record<RoutePath, string>> = {
  green_path: 'אישור המסלול הירוק',
  remediation_path: 'אישור מסלול צמצום פערי קדם',
};

/** The gate between meeting 2 and meeting 3 (PRD Module 20). */
export const TEACHER_GATE_HE = 'שלב החלוקה למסלולים';

/** A learner whose coaching card is open right now (PRD Module 18 §ב, red). */
export const CARD_OPEN_HE = 'כרטיס החניכה פתוח';

/** The three error categories of PRD Module 18 (the stored keys do not change). */
export const ERROR_CATEGORY_HE = {
  calculation: 'טעות חישוב',
  procedural: 'טעות בשלבי הפתרון',
  conceptual: 'טעות בהבנת ערך המקום',
} as const;

/**
 * Why a coaching card opened, as the teacher reads it (the learner's timeline
 * and the reports). מסמכים 03 ו-04 word for word; only the per-column digit
 * streak (register deviation 2) opens a card with consecutive_errors_4. The
 * stored trigger_reason values do not change. The server's reports carry a
 * copy (functions/src/teacherLabels.ts), held equal to this one by a test.
 */
export const TRIGGER_REASON_HE = {
  hesitation_45s: 'היסוס 45 שניות',
  consecutive_errors_4: 'ארבע מחיקות או הקלדות שגויות רצופות',
  consecutive_undos_3: 'שלושה ביטולים רצופים',
  conversion_not_performed: 'לא בוצעה המרה נדרשת',
  repeated_errors: 'תשובה שגויה שנייה ברצף באותו תרגיל',
} as const;

/** The route's name for a stored path value, or null for anything else. */
export function routeNameHe(path: unknown): string | null {
  return path === 'green_path' || path === 'remediation_path' ? ROUTE_NAME_HE[path] : null;
}

/**
 * The radar's own path values stay as they are ('ירוק' / 'צמצום פערים'); what
 * the teacher reads is the route's one name (owner, 27.9.2026).
 */
export function radarPathLabelHe(path: 'ירוק' | 'צמצום פערים' | 'טרם נקבעה' | undefined): string {
  if (path === 'ירוק') return ROUTE_NAME_HE.green_path;
  if (path === 'צמצום פערים') return ROUTE_NAME_HE.remediation_path;
  return path ?? 'טרם נקבעה';
}
