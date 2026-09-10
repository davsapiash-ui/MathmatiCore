import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore, currentStudentNumber, currentStudentUid } from '@/application/useAuthStore';
import { resolveTelemetryStudentId } from '@/infrastructure/services/FirebaseSyncService';

/**
 * מודול 1 ו-5: לומד מזוהה במספר 1-12 בלבד, ואותו מספר הוא גם נתיב הכתיבה
 * שלו וגם ה-student_id בכל אירוע טלמטריה.
 *
 * לפני התיקון, מזהה שלא נפתר נפל בשקט ל"תלמיד 1" בשלושה מקומות שונים —
 * במרחב העבודה, במשדר הטלמטריה ובתג הזהות. התוצאה: לומד אחד יכול היה
 * לקרוא ולכתוב לתוך הצומת של לומד אחר, ונתוני מחקר של ילד אחד נרשמו על
 * ילד אחר בלי שום עקבות. הבדיקות כאן נועלות את החלופה: אין זיהוי — אין
 * ניחוש.
 */
const setUser = (user: Record<string, unknown> | null) => {
  useAuthStore.setState({ user: user as never });
};

describe('זיהוי לומד: כל 12 התלמידים, ואף אחד מעבר להם', () => {
  beforeEach(() => setUser(null));

  it('נפתר נכון לכל אחד מ-12 תלמידי הפיילוט', () => {
    for (let n = 1; n <= 12; n++) {
      setUser({ uid: `student_user${n}`, student_id: n });
      expect(currentStudentNumber()).toBe(n);
      expect(currentStudentUid()).toBe(`student_user${n}`);
      expect(resolveTelemetryStudentId(undefined, `student_user${n}`)).toBe(n);
    }
  });

  it('שדה student_id המאומת גובר על מזהה Auth שאינו תואם', () => {
    // מזהה Auth אקראי שיש בו ספרה — בדיוק המקרה שהיה מייצר שיוך שגוי.
    setUser({ uid: 'kJ3nX8pQ', student_id: 7 });
    expect(currentStudentNumber()).toBe(7);
    expect(currentStudentUid()).toBe('student_user7');
    expect(resolveTelemetryStudentId(undefined, 'kJ3nX8pQ')).toBe(7);
  });

  it('מזהה Auth אקראי בלי student_id אינו הופך למספר תלמיד', () => {
    setUser({ uid: 'kJ3nX8pQ' });
    expect(currentStudentNumber()).toBeNull();
    expect(currentStudentUid()).toBe('');
    expect(resolveTelemetryStudentId(undefined, 'kJ3nX8pQ')).toBeNull();
  });

  it('אין משתמש מחובר — אין מספר תלמיד, ובוודאי לא 1', () => {
    setUser(null);
    expect(currentStudentNumber()).toBeNull();
    expect(currentStudentUid()).toBe('');
    expect(resolveTelemetryStudentId(undefined, null)).toBeNull();
  });

  it('מספר מחוץ לטווח הפיילוט נדחה ואינו נחתך לגבול', () => {
    setUser({ uid: 'student_user13', student_id: 13 });
    expect(currentStudentNumber()).toBeNull();
    expect(resolveTelemetryStudentId(13, null)).toBeNull();
    expect(resolveTelemetryStudentId(0, null)).toBeNull();
    expect(resolveTelemetryStudentId(-4, null)).toBeNull();
  });

  it('מספר שהועבר במפורש הוא הקובע', () => {
    setUser({ uid: 'student_user2', student_id: 2 });
    expect(resolveTelemetryStudentId(9, 'student_user2')).toBe(9);
  });

  it('מזהי לומד בצורות המוכרות נפתרים גם בלי משתמש מחובר', () => {
    setUser(null);
    expect(resolveTelemetryStudentId('student_user11', null)).toBe(11);
    expect(resolveTelemetryStudentId('student_5', null)).toBe(5);
    expect(resolveTelemetryStudentId('12', null)).toBe(12);
  });

  it('שני לומדים שונים לעולם אינם נפתרים לאותו מזהה', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      setUser({ uid: `student_user${n}`, student_id: n });
      const uid = currentStudentUid();
      expect(seen.has(uid)).toBe(false);
      seen.add(uid);
    }
    expect(seen.size).toBe(12);
  });
});
