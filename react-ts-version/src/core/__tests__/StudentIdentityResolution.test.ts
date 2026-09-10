import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
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

describe('אין ניחוש זהות בשום מקום בקוד', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf-8');

  /**
   * הסריקה הזאת היא הבדיקה האמיתית. שלושה סבבי תיקון ידניים השאירו בכל
   * פעם מופע אחד או שניים של אותה נפילה — "אם לא הצלחתי לזהות, זה תלמיד
   * 1". כאן זה נבדק אוטומטית על כל קובץ מקור, כך שמופע חדש ייפול בבדיקות
   * ולא ייתגלה בסבב ידני נוסף.
   */
  const SOURCE_DIRS = ['src/features', 'src/application', 'src/presentation', 'src/infrastructure', 'src/core'];

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(resolve(__dirname, '../../..', dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        out.push(...walk(rel));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(rel);
      }
    }
    return out;
  };

  const files = SOURCE_DIRS.flatMap(walk);

  it('סורק קבצי מקור אמיתיים', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each([
    ["|| 'student_1'", /\|\|\s*'student_1'/],
    ["|| 'student_user1'", /\|\|\s*'student_user1'/],
    ['|| "student_1"', /\|\|\s*"student_1"/],
  ])('אף קובץ אינו נופל ל-%s', (_label, pattern) => {
    const offenders = files.filter((f) => {
      const src = read(f)
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      return pattern.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
