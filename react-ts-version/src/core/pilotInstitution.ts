/**
 * PRD Module 25 §ב.1 — the pilot's institutional structure, fixed by the spec:
 * "הגדרת בית ספר יחיד בשם 'בית ספר ביקורת' וכיתה פעילה אחת בלבד בשם 'המבקרים'."
 *
 * One school, one class. Learners are identified by their number alone (1–12),
 * so a second class would share the first one's identities, progress, approved
 * path and reports. Every place that creates, lists or targets a school or a
 * class reads these constants instead of generating an id or trusting whatever
 * happens to be first in the database.
 */
export const PILOT_SCHOOL_ID = 'school_bikorot';
export const PILOT_SCHOOL_NAME = 'בית ספר ביקורת';
export const PILOT_CLASS_ID = 'class_1';
export const PILOT_CLASS_NAME = 'המבקרים';

/** Shown when a second school or class is attempted. */
export const ONE_INSTITUTION_MESSAGE =
  'הפיילוט פועל עם בית ספר אחד וכיתה אחת בלבד: בית ספר ביקורת, כיתת המבקרים.';
