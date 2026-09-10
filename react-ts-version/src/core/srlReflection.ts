/**
 * מודול 16 — לוח הרפלקציה של מפגש 8.
 *
 * המסך אסף את שלושת השלבים כהלכה, אבל שום דבר מהם לא נשמר: בסיום נשלחה
 * רק רמת המאמץ, ובשדה הלא נכון (`routeRecommendation`, שהוא צבע מסלול
 * שהדשבורד משווה ל-'YELLOW'). התוצאה הייתה שדוח הכיתה סופר אפס רפלקציות
 * לכל לומד בכל מפגש, וייצוא המחקר הוציא אוסף ריק — שניהם קוראים
 * `srl_reflections`.
 *
 * האפיון (מודול 16, "הנחיות פיתוח נוקשות") דורש סנכרון אטומי מול Firestore
 * עם מפתח אידמפוטנטיות. מזהה המסמך הוא המפתח: כתיבה שנייה של אותו לומד
 * לאותו מפגש נדחית בחוקים (`allow update: if false`), כך שהראשונה קובעת.
 */

import { doc, setDoc } from 'firebase/firestore';
import { ref, update } from 'firebase/database';
import { firestore, database } from '@/infrastructure/firebase';

export type SRLEffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type SRLStrategy = 'UNDO_BUTTON' | 'MEMORY_CIRCLES' | 'SOCRATIC_CARD';

/** מה שמסך הרפלקציה מחזיר בסיום שלושת השלבים. */
export interface SRLReflectionResult {
  effortLevel: 'EASY' | 'MEDIUM' | 'HARD' | null;
  strategies: string[];
  persistenceIndex: number;
  undoCount: number;
  errorCount: number;
  guessCount: number;
}

const EFFORT_BY_SCREEN_ID: Record<string, SRLEffortLevel> = {
  EASY: 'LOW',
  MEDIUM: 'MEDIUM',
  HARD: 'HIGH',
};

const STRATEGY_BY_SCREEN_ID: Record<string, SRLStrategy> = {
  undo: 'UNDO_BUTTON',
  memory: 'MEMORY_CIRCLES',
  hints: 'SOCRATIC_CARD',
};

/** מזהה מסמך הרפלקציה של מפגש 8 עבור לומד — גם מפתח האידמפוטנטיות. */
export function srlReflectionDocId(studentNumber: number): string {
  return `session_08_student_${studentNumber}`;
}

export function toSRLEffortLevel(value: string | null): SRLEffortLevel {
  return EFFORT_BY_SCREEN_ID[value || ''] ?? 'MEDIUM';
}

export function toSRLStrategies(values: string[]): SRLStrategy[] {
  const mapped = (values || []).map((v) => STRATEGY_BY_SCREEN_ID[v]).filter(Boolean) as SRLStrategy[];
  return Array.from(new Set(mapped));
}

/** מספר לומד תקף לפיילוט: שלם בין 1 ל-12. אחרת אין למי לשייך את המסמך. */
function asPilotNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\D/g, ''));
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export interface SRLPersistResult {
  ok: boolean;
  reason?: 'unknown_student' | 'write_failed';
}

/**
 * שומרת את הרפלקציה: מסמך `srl_reflections` ב-Firestore (מקור האמת שדוח
 * הכיתה וייצוא המחקר קוראים), ובמקביל את שלושת השדות שמודול 16 §ב מגדיר
 * כמנוהלים בשרת על צומת הלומד, כדי שהדשבורד יראה מיד שהרפלקציה הושלמה.
 */
export async function submitSRLReflection(
  rawStudentId: string | number,
  result: SRLReflectionResult
): Promise<SRLPersistResult> {
  const studentNumber = asPilotNumber(rawStudentId);
  if (studentNumber === null) {
    console.error('[srlReflection] cannot resolve a pilot student number from', rawStudentId);
    return { ok: false, reason: 'unknown_student' };
  }

  const docId = srlReflectionDocId(studentNumber);
  const submittedAt = Date.now();
  const persistenceIndex = Math.min(100, Math.max(0, Math.round(result.persistenceIndex)));

  try {
    await setDoc(doc(firestore, 'srl_reflections', docId), {
      student_id: studentNumber,
      session_id: docId,
      session_number: 8,
      effort_level: toSRLEffortLevel(result.effortLevel),
      selected_strategies: toSRLStrategies(result.strategies),
      persistence_index: persistenceIndex,
      undo_count: Math.max(0, Math.round(result.undoCount || 0)),
      error_count: Math.max(0, Math.round(result.errorCount || 0)),
      guess_count: Math.max(0, Math.round(result.guessCount || 0)),
      submitted_at: submittedAt,
    });
  } catch (err) {
    console.error('[srlReflection] failed writing the reflection document:', err);
    return { ok: false, reason: 'write_failed' };
  }

  // מודול 16 §ב: reflection_step, reflection_completed ו-persistence_index
  // מנוהלים בשרת. זהו שיקוף לתצוגה החיה בלבד, לא מקור אמת שני.
  await update(ref(database, `users/students/student_user${studentNumber}`), {
    reflection_step: 3,
    reflection_completed: true,
    persistence_index: persistenceIndex,
    reflection_updated_at: submittedAt,
  }).catch((err) => {
    console.warn('[srlReflection] live mirror notice:', err);
  });

  return { ok: true };
}
