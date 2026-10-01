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

/**
 * Module 25 §ב.2: a hard cap of 12 learners, enforced on the server (learner
 * ids 1–12 in authenticateStudentSession and the rules). The spec sets no
 * smaller capacity, so the console shows it as fixed instead of offering a
 * control that changed nothing.
 */
export const PILOT_CLASS_CAPACITY = 12;

/**
 * Module 25 §ה fixes this sentence verbatim as the rollback message shown
 * when the class is at capacity (§ז: the wizard clears the field and shows it).
 */
export const CLASS_FULL_MESSAGE = 'ההרשמה חסומה. כיתת המחקר הגיעה לתפוסה מלאה של 12 לומדים.';

/** The class_type a class document gets when none was chosen — the value the meeting activation writes. */
export const DEFAULT_CLASS_TYPE = 'כיתת ביקורת';

/** Shown when a second school or class is attempted. */
export const ONE_INSTITUTION_MESSAGE =
  'הפיילוט פועל עם בית ספר אחד וכיתה אחת בלבד: בית ספר ביקורת, כיתת המבקרים.';
