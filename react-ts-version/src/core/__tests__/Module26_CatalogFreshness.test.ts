import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  compareCatalog,
  stableFingerprint,
  bankLabelHe,
  freshnessMessageHe,
} from '@/core/catalogFreshness';

/**
 * מודול 26 §ב, 22.9.2026 — החיווי במסך המנהל.
 *
 * `getSessionTasks()` מחזיר `curriculumCatalog.getActiveBank(...) ?? hardcoded`:
 * מאגר שפורסם גובר על הקוד. לכן תיקון תרגיל שנפרס לאוויר אינו מגיע לילדים עד
 * שמישהו לוחץ "פרסום תוכנית הלימודים", ועד עכשיו אי אפשר היה לדעת את זה.
 *
 * בעל המוצר החליט (22.9.2026) לוותר על עורך התרגילים של מודול 26 §ג ולבנות
 * את החיווי בלבד — ראו סטייה 22 במסמך הסטיות.
 */

const CODE = [
  { id: 'session_1', tasks: [{ id: 'ex_1_01', titleHe: 'א' }] },
  { id: 'session_3_green_path', tasks: [{ id: 'ex_3_01', titleHe: 'ב' }] },
];

describe('טביעת האצבע יציבה', () => {
  it('סדר המפתחות אינו משנה — Firestore אינו מבטיח אותו', () => {
    expect(stableFingerprint({ a: 1, b: 2 })).toBe(stableFingerprint({ b: 2, a: 1 }));
  });

  it('שדה undefined מושמט, בדיוק כמו ב-JSON.parse(JSON.stringify(...)) של הפרסום', () => {
    expect(stableFingerprint({ a: 1, hint: undefined })).toBe(stableFingerprint({ a: 1 }));
  });

  it('סדר האיברים במערך כן משנה — זה סדר התרגילים', () => {
    expect(stableFingerprint([1, 2])).not.toBe(stableFingerprint([2, 1]));
  });

  it('ערך שונה בעומק מזוהה', () => {
    expect(stableFingerprint({ t: [{ n: 314 }] })).not.toBe(stableFingerprint({ t: [{ n: 315 }] }));
  });
});

describe('ההשוואה בין מה שפורסם לקוד', () => {
  it('מסד ריק אינו תקלה: הילדים מקבלים את הקוד', () => {
    const f = compareCatalog([], CODE);
    expect(f.status).toBe('never_published');
    expect(f.publishedAt).toBeNull();
    expect(freshnessMessageHe(f)).toContain('ישירות מהקוד');
  });

  it('זהה לקוד — מציג את תאריך הפרסום האחרון', () => {
    const at = Date.UTC(2026, 8, 16, 9, 0, 0);
    const f = compareCatalog(
      CODE.map((b, i) => ({ id: b.id, updatedAt: at - i * 1000, tasks: b.tasks })),
      CODE
    );
    expect(f.status).toBe('match');
    expect(f.publishedAt).toBe(at);
    expect(f.changedBankIds).toEqual([]);
  });

  it('תרגיל שהשתנה בקוד מסומן, ונאמר במפורש שהילדים מקבלים את הישן', () => {
    const f = compareCatalog(
      [
        { id: 'session_1', updatedAt: 1, tasks: CODE[0].tasks },
        { id: 'session_3_green_path', updatedAt: 1, tasks: [{ id: 'ex_3_01', titleHe: 'ישן' }] },
      ],
      CODE
    );
    expect(f.status).toBe('stale');
    expect(f.changedBankIds).toEqual(['session_3_green_path']);
    const msg = freshnessMessageHe(f);
    expect(msg).toContain('הילדים ממשיכים לקבל את הגרסה שפורסמה');
    expect(msg).toContain('מפגש 3 — מסלול ירוק');
  });

  it('מאגר שקיים בקוד ולא פורסם, ומאגר שפורסם ואינו בקוד — שניהם פער', () => {
    const partial = compareCatalog([{ id: 'session_1', updatedAt: 1, tasks: CODE[0].tasks }], CODE);
    expect(partial.status).toBe('stale');
    expect(partial.missingBankIds).toEqual(['session_3_green_path']);

    const leftover = compareCatalog(
      [
        ...CODE.map((b) => ({ id: b.id, updatedAt: 1, tasks: b.tasks })),
        { id: 'session_9_green_path', updatedAt: 1, tasks: [{ id: 'x', titleHe: 'x' }] },
      ],
      CODE
    );
    expect(leftover.status).toBe('stale');
    expect(leftover.extraBankIds).toEqual(['session_9_green_path']);
  });

  it('מסמך שפורסם בלי שדה tasks נחשב שונה, לא זהה', () => {
    const f = compareCatalog(
      [
        { id: 'session_1', updatedAt: 1 },
        { id: 'session_3_green_path', updatedAt: 1, tasks: CODE[1].tasks },
      ],
      CODE
    );
    expect(f.changedBankIds).toEqual(['session_1']);
  });

  it('שמות המאגרים מוצגים בעברית', () => {
    expect(bankLabelHe('session_1')).toBe('מפגש 1');
    expect(bankLabelHe('session_4_remediation_path')).toBe('מפגש 4 — מסלול ביסוס');
    expect(bankLabelHe('לא_מזוהה')).toBe('לא_מזוהה');
  });
});

describe('המסך מחובר לחיווי', () => {
  const view = readFileSync(
    resolve(__dirname, '../../presentation/pages/admin/AdminCurriculumView.tsx'),
    'utf-8'
  );

  it('קורא את הקטלוג מהמסד ומשווה אותו למאגרים שבקוד', () => {
    expect(view).toContain("getDocs(collection(db, 'curriculum_catalog'))");
    expect(view).toContain('compareCatalog(published, getHardcodedCatalogBanks())');
  });

  it('לאחר פרסום מוצלח החיווי נקרא מחדש', () => {
    const publish = view.slice(view.indexOf('const handlePublishCatalog'), view.indexOf('return ('));
    expect(publish).toContain('await loadFreshness();');
  });

  it('כישלון קריאה אינו מוצג כ"הכול תקין"', () => {
    expect(view).toContain('setFreshnessError(true);');
    expect(view).toContain('אי אפשר להגיד אם מה שפורסם מעודכן');
  });
});
