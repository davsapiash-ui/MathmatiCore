/**
 * sessionBranchTasks.ts — early-finisher exercises (מדיניות סיום מוקדם ומענה ללומדים מהירים).
 *
 * Source: מסמך 03 §3.3–3.7, "מאגר תרגילי הבחירה": for each of sessions 3–7 and
 * for each learning path, two reinforcement exercises (נתיב החזרה והביסוס) and
 * one challenge exercise (נתיב האתגר והעומק). Numbers are the document's.
 * PRD v7.2 Module 14 §ג: the choice screen exists in sessions 3–7 only, so no
 * branch bank exists for sessions 1, 2 or 8.
 *
 * Every task here is `isOptionalChoiceTask: true` and excluded from the
 * baseline mastery metrics (PRD Module 14 §ג, מסמך 03 "לוגיקת ניתוח הנתונים").
 */

import { addition, subtraction, skeleton, readWrite, decompose, composeGroup, flexible, S4_ADD, S5_SUB, S6_SUB, FLEX_HOWTO } from './taskBuilders';
import type { SessionTask, LearningPath } from './sessionTasks';

export type BranchType = 'reinforcement' | 'challenge';
export type BranchSession = 3 | 4 | 5 | 6 | 7;
export interface BranchBank {
  reinforcement: SessionTask[];
  challenge: SessionTask[];
}

const R = { branchType: 'reinforcement' as const };
const C = { branchType: 'challenge' as const };

export const SESSION_BRANCH_TASKS: Record<BranchSession, Record<LearningPath, BranchBank>> = {
  // ── מפגש 3: ערך המקום וגמישות ייצוגית ──
  // The reinforcement exercises follow the compulsory ones' redesign (owner,
  // 30.9.2026; sessionTasks.ts): the number in words, then the number of blocks.
  3: {
    remediation_path: {
      reinforcement: [
        readWrite('s3_r_reinforce_1', 270, 'מאתיים ושבעים',
          'ביסוס 1: ייצוג סטנדרטי של 270', R),
        decompose('s3_r_reinforce_2', 270, 'tens',
          'ביסוס 2: 270 בעשרות בלבד', R),
      ],
      challenge: [
        flexible('s3_r_challenge_1', 320,
          'אתגר: כל הדרכים לייצג את 320',
          `מצאו דרכים שונות לייצג את המספר 320 באמצעות מאות ועשרות בלבד. ${FLEX_HOWTO}`, C),
      ],
    },
    green_path: {
      reinforcement: [
        readWrite('s3_g_reinforce_1', 3600, 'שלושת אלפים ושש מאות',
          'ביסוס 1: ייצוג סטנדרטי של 3,600', R),
        decompose('s3_g_reinforce_2', 3600, 'hundreds',
          'ביסוס 2: 3,600 במאות בלבד', R),
      ],
      challenge: [
        flexible('s3_g_challenge_1', 4200,
          'אתגר: כל הדרכים לייצג את 4,200',
          `מצאו דרכים שונות לייצג את המספר 4,200 באמצעות אלפים, מאות ועשרות. ${FLEX_HOWTO}`, C),
      ],
    },
  },

  // ── מפגש 4: אלגוריתם החיבור במאונך והמרה פשוטה ──
  4: {
    remediation_path: {
      reinforcement: [
        addition('s4_r_reinforce_1', 236, 41, 'ביסוס 1: חיבור ללא המרה', S4_ADD('236 + 41'), R),
        addition('s4_r_reinforce_2', 165, 27, 'ביסוס 2: המרה אחת בטור היחידות', S4_ADD('165 + 27'), R),
      ],
      challenge: [
        addition('s4_r_challenge_1', 278, 156, 'אתגר: שתי המרות עוקבות', S4_ADD('278 + 156'), C),
      ],
    },
    green_path: {
      reinforcement: [
        addition('s4_g_reinforce_1', 2341, 125, 'ביסוס 1: חיבור ללא המרה', S4_ADD('2,341 + 125'), R),
        addition('s4_g_reinforce_2', 3528, 164, 'ביסוס 2: המרה אחת בטור היחידות', S4_ADD('3,528 + 164'), R),
      ],
      challenge: [
        addition('s4_g_challenge_1', 4687, 2459, 'אתגר: שלוש המרות רצופות', S4_ADD('4,687 + 2,459'), C),
      ],
    },
  },

  // ── מפגש 5: אלגוריתם החיסור במאונך והמרה פשוטה (פריטה) ──
  5: {
    remediation_path: {
      reinforcement: [
        subtraction('s5_r_reinforce_1', 86, 34, 'ביסוס 1: חיסור ללא פריטה', S5_SUB('86 − 34', 86, 34), R),
        subtraction('s5_r_reinforce_2', 72, 48, 'ביסוס 2: פריטה אחת בטור היחידות', S5_SUB('72 − 48', 72, 48), R),
      ],
      challenge: [
        subtraction('s5_r_challenge_1', 523, 187, 'אתגר: שתי פריטות עוקבות', S5_SUB('523 − 187', 523, 187), C),
      ],
    },
    green_path: {
      reinforcement: [
        subtraction('s5_g_reinforce_1', 5879, 2431, 'ביסוס 1: חיסור ללא פריטה', S5_SUB('5,879 − 2,431', 5879, 2431), R),
        subtraction('s5_g_reinforce_2', 6352, 1128, 'ביסוס 2: פריטה אחת בטור היחידות', S5_SUB('6,352 − 1,128', 6352, 1128), R),
      ],
      challenge: [
        subtraction('s5_g_challenge_1', 7214, 3568, 'אתגר: שלוש פריטות רצופות', S5_SUB('7,214 − 3,568', 7214, 3568), C),
      ],
    },
  },

  // ── מפגש 6: אתגר האפס כשומר מקום ──
  6: {
    remediation_path: {
      reinforcement: [
        subtraction('s6_r_reinforce_1', 305, 102, 'ביסוס 1: קריאת האפס כשומר מקום, ללא פריטה', S6_SUB('305 − 102', 305, 102), { ...R, targetNode: 'zero_placeholder' }),
        subtraction('s6_r_reinforce_2', 250, 130, 'ביסוס 2: חיסור ללא פריטה', S6_SUB('250 − 130', 250, 130), { ...R, targetNode: 'zero_placeholder' }),
      ],
      challenge: [
        subtraction('s6_r_challenge_1', 600, 247, 'אתגר: פריטה כפולה דרך שני אפסים עוקבים', S6_SUB('600 − 247', 600, 247), { ...C, targetNode: 'zero_placeholder' }),
      ],
    },
    green_path: {
      reinforcement: [
        subtraction('s6_g_reinforce_1', 4050, 1020, 'ביסוס 1: חיסור ללא פריטה עם אפסים', S6_SUB('4,050 − 1,020', 4050, 1020), { ...R, targetNode: 'zero_placeholder' }),
        subtraction('s6_g_reinforce_2', 3006, 1004, 'ביסוס 2: חיסור ללא פריטה עם אפסים', S6_SUB('3,006 − 1,004', 3006, 1004), { ...R, targetNode: 'zero_placeholder' }),
      ],
      challenge: [
        subtraction('s6_g_challenge_1', 8000, 2376, 'אתגר: פריטה משולשת רצופה דרך שלושה אפסים', S6_SUB('8,000 − 2,376', 8000, 2376), { ...C, targetNode: 'zero_placeholder' }),
      ],
    },
  },

  // ── מפגש 7: פתרון בעיות חקר ואינטגרציה ──
  // מסמך 03 describes these skeletons without numbers; the numbers below are ★ chosen.
  7: {
    remediation_path: {
      reinforcement: [
        skeleton('s7_r_reinforce_1', 412, 253, false, { a: ['units'] },
          'ביסוס 1: ספרת יחידות חסרה בחיבור ללא המרה',
          'בתרגיל 41▢ + 253 = 665 חסרה ספרת היחידות של המחובר הראשון. גלו אותה בעזרת הלבנים וכתבו אותה בתיבה הריקה.',
          { ...R, targetNode: 'relational_thinking' }),
        skeleton('s7_r_reinforce_2', 467, 213, true, { a: ['tens'] },
          'ביסוס 2: ספרת עשרות חסרה בחיסור ללא פריטה',
          'בתרגיל 4▢7 − 213 = 254 חסרה ספרת העשרות של המחוסר. גלו אותה בעזרת הלבנים וכתבו אותה בתיבה הריקה.',
          { ...R, targetNode: 'relational_thinking' }),
      ],
      challenge: [
        skeleton('s7_r_challenge_1', 415, 258, false, { a: ['hundreds', 'tens', 'units'] },
          'אתגר: תרגיל שלד עם שלוש ספרות חסרות',
          'בתרגיל ▢▢▢ + 258 = 673 חסרות שלוש ספרות של המחובר הראשון, בטורים שונים. גלו אותן בעזרת הלבנים בבית המספרים וכתבו אותן בתיבות הריקות.',
          { ...C, targetNode: 'relational_thinking' }),
      ],
    },
    green_path: {
      reinforcement: [
        skeleton('s7_g_reinforce_1', 5538, 1246, false, { a: ['hundreds', 'units'] },
          'ביסוס 1: שתי ספרות חסרות בחיבור עם המרה אחת',
          'בתרגיל 5,▢3▢ + 1,246 = 6,784 חסרות שתי ספרות של המחובר הראשון. גלו אותן בעזרת הלבנים וכתבו אותן בתיבות הריקות.',
          { ...R, targetNode: 'relational_thinking' }),
        // Owner, 30.9.2026: a grouping composition, like s7_g_t1 — build the
        // blocks, group ten hundreds, write the number. ★ owner's numbers: 14
        // hundreds and 3 tens (1,430). מסמך 03 §3.7 has "25 מאות שוות לשני
        // אלפים וחמש מאות" here, the same exercise as s7_g_t1; the "prove that"
        // wording wrote the answer into the question.
        composeGroup('s7_g_reinforce_2', { hundreds: 14, tens: 3 }, ['hundreds'],
          'ביסוס 2: הקבצת 10 מאות לאלף אחד',
          { ...R, targetNode: 'relational_thinking' }),
      ],
      challenge: [
        skeleton('s7_g_challenge_1', 8003, 2587, true, { a: ['thousands', 'hundreds', 'tens', 'units'] },
          'אתגר: תרגיל שלד בתחום הרבבה עם ארבע ספרות חסרות',
          'בתרגיל ▢,▢▢▢ − 2,587 = 5,416 חסרות ארבע ספרות של המחוסר. גלו את הספרות בעזרת הלבנים וכתבו אותן בתיבות הריקות.',
          { ...C, targetNode: 'relational_thinking' }),
      ],
    },
  },
};

/**
 * The early-finisher bank for a session, branch and learning path.
 * Sessions outside 3–7 have no choice screen (PRD Module 14 §ג) and return [].
 */
export function getSessionBranchTasks(
  sessionNumber: number,
  branch: BranchType,
  path: LearningPath = 'green_path'
): SessionTask[] {
  const session = SESSION_BRANCH_TASKS[sessionNumber as BranchSession];
  if (!session) return [];
  const bank = session[path] ?? session.green_path;
  return bank[branch] ?? bank.reinforcement;
}
