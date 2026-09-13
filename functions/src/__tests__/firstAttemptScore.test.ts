import { describe, it, expect } from 'vitest';
import { computeFirstAttemptScore, summarizeMeeting, sessionNumberFromId, DIAGNOSTIC_COMPULSORY_COUNT } from '../meetingMetrics';

/**
 * ציון הניסיון הראשון (מודול 23 §ב).
 *
 * הנוסחה: מספר תרגילי החובה שנפתרו נכון בניסיון ראשון, חלקי מספר תרגילי
 * החובה של אותו מפגש. שני חלקי השבר חייבים לספור את אותם תרגילים.
 *
 * שני באגים חיו כאן, ושניהם ייצרו אחוז בטוח בעצמו שלא נמדד:
 * המונה ספר כל תרגיל שהושלם, כולל תרגילי בחירה של מסיימים מוקדם, מול מכנה
 * של תרגילי חובה בלבד; וכשמספר תרגילי החובה לא היה ידוע, "מה שהילד פתח"
 * הפך למכנה.
 */
const ev = (exercise_id: string, event_type: string, extra: Record<string, unknown> = {}) => ({
  exercise_id,
  event_type,
  client_timestamp: 0,
  ...extra,
});
const wrongDigit = (id: string) => ev(id, 'DIGIT_ENTERED', { details: { is_correct: false } });
const done = (id: string) => ev(id, 'PROBLEM_COMPLETE');

describe('המונה והמכנה סופרים את אותם תרגילים', () => {
  it('מסיים מוקדם אינו מנפח את הציון בתרגילי בחירה', () => {
    // 6 תרגילי חובה. הילד פתר 4 בניסיון ראשון, נכשל בשניים, ואז סיים
    // 3 תרגילי בחירה. לפני התיקון: min(7,6)/6 = 100% ומסלול אתגר עצמאי.
    const compulsory = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    const events = [
      done('c1'), done('c2'), done('c3'), done('c4'),
      wrongDigit('c5'), done('c5'),
      wrongDigit('c6'), done('c6'),
      done('opt1'), done('opt2'), done('challenge_x_1699999999'),
    ];
    const score = computeFirstAttemptScore(events, 6, compulsory);
    expect(score.correctFirstAttempt).toBe(4);
    expect(score.denominator).toBe(6);
    expect(score.scorePercent).toBe(67);
  });

  it('בלי רשימת מזהי חובה, המונה עדיין חסום בגובה המכנה', () => {
    const events = [done('a'), done('b'), done('c'), done('d'), done('e'), done('f'), done('g')];
    const score = computeFirstAttemptScore(events, 6, null);
    expect(score.correctFirstAttempt).toBe(6);
    expect(score.scorePercent).toBe(100);
  });
});

describe('אין מכנה — אין ציון', () => {
  it('מספר תרגילי חובה לא ידוע מחזיר null ולא אחוז', () => {
    // תרגיל אחד נפתח ונפתר. לפני התיקון: מכנה 1, כלומר 100%.
    const score = computeFirstAttemptScore([done('c1')], null);
    expect(score.scorePercent).toBeNull();
    expect(score.denominator).toBeNull();
    expect(score.attempted).toBe(1);
  });

  it('מפגש בלי אירועי תרגיל כלל אינו מייצר 0%', () => {
    // לפני התיקון זה נקרא 0%, והילד נשלח לקבוצת ביסוס על סמך כלום.
    const events = [ev('', 'SESSION_START'), ev('', 'SESSION_END')];
    const score = computeFirstAttemptScore(events, null);
    expect(score.scorePercent).toBeNull();
    expect(score.attempted).toBe(0);
  });

  it('מכנה אפס או שלילי נחשב לא ידוע', () => {
    expect(computeFirstAttemptScore([done('a')], 0).scorePercent).toBeNull();
    expect(computeFirstAttemptScore([done('a')], -3).scorePercent).toBeNull();
  });
});

describe('הגדרת "ניסיון ראשון"', () => {
  it('ספרה שגויה לפני ההשלמה פוסלת את התרגיל', () => {
    const score = computeFirstAttemptScore([wrongDigit('c1'), done('c1')], 1);
    expect(score.correctFirstAttempt).toBe(0);
    expect(score.scorePercent).toBe(0);
  });

  it('is_correct: null אינו נספר כטעות', () => {
    // מודול 23 §ב: אירועים שבהם is_correct === null אינם משפיעים כלל.
    const events = [ev('c1', 'DIGIT_ENTERED', { details: { is_correct: null } }), done('c1')];
    expect(computeFirstAttemptScore(events, 1).scorePercent).toBe(100);
  });

  it('תרגיל שנפתח ולא הושלם אינו נספר במונה', () => {
    const score = computeFirstAttemptScore([ev('c1', 'PROBLEM_LOAD')], 2);
    expect(score.correctFirstAttempt).toBe(0);
    expect(score.attempted).toBe(1);
  });

  it('מפגש האבחון הוא שבעה תרגילים', () => {
    expect(DIAGNOSTIC_COMPULSORY_COUNT).toBe(7);
  });
});

describe('מוני המפגש', () => {
  it('כל סוג אירוע נספר פעם אחת ובמונה שלו', () => {
    const s = summarizeMeeting([
      ev('c1', 'UNDO_EXECUTED'),
      ev('c1', 'UNDO_EXECUTED'),
      ev('c1', 'DIGIT_DELETED'),
      ev('c1', 'REGROUPING_SUCCESS'),
      ev('c1', 'SOCRATIC_CARD_SHOWN'),
      ev('c1', 'HESITATION_DETECTED', { details: { hesitation_seconds: 12 } }),
      ev('c1', 'HESITATION_DETECTED', { details: { hesitation_seconds: 8 } }),
      ev('c1', 'REFLECTION_SUBMITTED'),
      done('c1'),
    ]);
    expect(s.undos).toBe(2);
    expect(s.deletions).toBe(1);
    expect(s.regroupings).toBe(1);
    expect(s.socratic_cards).toBe(1);
    expect(s.hesitations).toBe(2);
    expect(s.hesitation_seconds_total).toBe(20);
    expect(s.reflection_submitted).toBe(true);
    expect(s.exercises_completed).toBe(1);
  });

  it('מפגש ריק אינו ממציא דקות פעילות', () => {
    const s = summarizeMeeting([]);
    expect(s.active_minutes).toBe(0);
    expect(s.first_event_at).toBeNull();
    expect(s.events).toBe(0);
  });
});

describe('מספר המפגש מתוך המזהה', () => {
  it('מזהה תקין מפוענח, ומזהה שאינו מוכר מחזיר null ולא ניחוש', () => {
    expect(sessionNumberFromId('session_02_student_4')).toBe(2);
    expect(sessionNumberFromId('session_8_student_11')).toBe(8);
    expect(sessionNumberFromId('s5_student_4')).toBeNull();
    expect(sessionNumberFromId('')).toBeNull();
  });
});
