/**
 * The research measures as the teacher reads them (PRD 7.3, Module 23 §ב).
 *
 * Owner, 30.9.2026: measure 2 has two parts — 2א התמדה (of the exercises the
 * learner made a mistake in and completed, how many without pressing "קריאה
 * לעזרה") and 2ב תיקון עצמי (Module 16 §ב, U ÷ (U + E + G) × 100). Every
 * report names each measure with the same words and one sentence on what it
 * says. The server's RESEARCH_MEASURES_HE (functions/src/meetingMetrics.ts)
 * holds the same words, pinned by ClassReport_ResearchMeasures2.test.ts.
 */
export const RESEARCH_MEASURES_HE = [
  { key: 'persistence', label: 'מדד 2א: התמדה', explanation: 'מתוך התרגילים שהלומד טעה בהם והשלים אותם, בכמה מהם לא ביקש עזרה: לא בלחצן העזרה השקט ולא בצ׳אט.' },
  { key: 'self_correction', label: 'מדד 2ב: תיקון עצמי', explanation: 'מתוך כל הביטולים והטעויות, כמה היו ביטולים (לחיצה על כפתור ביטול הפעולה). כשלא היו ביטולים ולא טעויות, המדד הוא 100%.' },
  { key: 'flexibility', label: 'מדד 3: גמישות ייצוגית', explanation: 'מתוך תרגילי בניית המספר שהלומד השלים, כמה מהם השלים בניסיון הראשון. נמדד במפגשים 3 ו-7.' },
  { key: 'mediation', label: 'מדד 4: אפקטיביות התיווך', explanation: 'מתוך כרטיסי החניכה שהוצגו, אחרי כמה מהם התשובה הבאה של הלומד הייתה נכונה.' },
] as const;

export type ResearchMeasureKey = (typeof RESEARCH_MEASURES_HE)[number]['key'];

/** A report stored before 30.9.2026 has no value for measure 2א. */
export const NOT_IN_THIS_REPORT_HE = 'לא נמדד בדוח זה';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Measure 2א as the server's persistenceHe writes it, from the stored object. */
export function persistenceTextHe(p: unknown): string {
  if (!p || typeof p !== 'object') return NOT_IN_THIS_REPORT_HE;
  const o = p as Record<string, unknown>;
  if (typeof o.percent !== 'number') return 'לא היו טעויות';
  return `${o.percent}% (בלי קריאה לעזרה ב-${num(o.solved_without_help)} מתוך ${num(o.exercises_with_errors)} תרגילים עם טעות)`;
}

/** Measure 2ב as the server's selfCorrectionHe writes it, from the stored object. */
export function selfCorrectionTextHe(p: unknown): string {
  if (!p || typeof p !== 'object') return 'לא נמדד';
  const o = p as Record<string, unknown>;
  return `${num(o.percent)}% (ביטולים: ${num(o.undos)}, ספרות שגויות: ${num(o.wrong_digits)}, בחירות שגויות בכרטיס: ${num(o.wrong_options)})`;
}
