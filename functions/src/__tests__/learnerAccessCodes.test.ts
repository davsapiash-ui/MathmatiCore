import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD מודול 1 §א ומודול 25 §ב.3 — קוד גישה אישי בן 4 ספרות לכל לומד: מספרו
 * בכיתה בשתי ספרות (01–12) ואחריו שתי ספרות אקראיות, שאינן זוג ספרות זהות
 * (כמו 11) ואינן זוג ספרות עוקבות (כמו 34). הרשימה גלויה למורה ולמנהל המערכת,
 * וכל אחד מהם יכול לשנות קוד של לומד. הקוד המשותף 10203040 אינו עובד עוד.
 */

const h = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, any>>,
  claims: [] as Array<{ uid: string; claims: unknown }>,
  logs: [] as string[],
  transactions: 0,
}));

vi.mock('firebase-functions/logger', () => {
  const log = (...args: unknown[]) => { h.logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
  return { info: log, warn: log, error: log, debug: log, log };
});

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const docRef = (collection: string, id: string) => {
    const path = `${collection}/${id}`;
    return {
      path,
      get: async () => ({ exists: path in h.docs, data: () => (h.docs[path] ? JSON.parse(JSON.stringify(h.docs[path])) : undefined) }),
      set: async (data: Record<string, any>) => { h.docs[path] = { ...data }; },
    };
  };
  const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(name, id) }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => { h.transactions++; return fn({
      get: (ref: any) => ref.get(),
      set: (ref: any, data: any) => { void ref.set(data); },
    }); },
  };
  const firestore = Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'ts' } });
  return {
    ...actual,
    default: actual,
    firestore,
    auth: () => ({ setCustomUserClaims: async (uid: string, claims: unknown) => { h.claims.push({ uid, claims }); } }),
  };
});

import {
  ALLOWED_SUFFIXES, isAllowedSuffix, isWellFormedCode, generateAccessCode, completeCodeMap, codesMatch,
  getLearnerAccessCodes, regenerateLearnerAccessCode,
} from '../learnerAccessCodes';
import { authenticateStudentSession } from '../authenticateStudentSession';
import { getStudentLoginCards } from '../studentLoginCards';

const call = (fn: any, data: unknown, token: Record<string, unknown> | null, uid = 'uid_x') =>
  fn.run({ data, auth: token ? { uid, token } : undefined, rawRequest: {} });

const TEACHER = { role: 'teacher', class_id: 'class_1' };
const ADMIN = { role: 'admin' };
const ANON = { firebase: { sign_in_provider: 'anonymous' } };

beforeEach(() => {
  h.docs = {};
  h.claims = [];
  h.logs = [];
  h.transactions = 0;
});

describe('כלל הקוד', () => {
  it('זוג זהה וזוג עוקב (בשני הכיוונים) אסורים', () => {
    for (const bad of ['11', '00', '99', '34', '01', '89', '43', '10', '98']) expect(isAllowedSuffix(bad), bad).toBe(false);
    for (const ok of ['02', '13', '47', '90', '58', '20']) expect(isAllowedSuffix(ok), ok).toBe(true);
    expect(ALLOWED_SUFFIXES).toHaveLength(100 - 10 - 18);
  });

  it('הקוד: מספר הלומד בשתי ספרות ואחריו זוג מותר', () => {
    for (let id = 1; id <= 12; id++) {
      for (let i = 0; i < 200; i++) {
        const code = generateAccessCode(id);
        expect(code).toMatch(/^[0-9]{4}$/);
        expect(code.slice(0, 2)).toBe(String(id).padStart(2, '0'));
        expect(isAllowedSuffix(code.slice(2))).toBe(true);
        expect(isWellFormedCode(id, code)).toBe(true);
      }
    }
  });

  it('כל זוג מותר יכול לצאת, וקוד חדש שונה תמיד מהקודם', () => {
    const seen = new Set(ALLOWED_SUFFIXES.map((_, i) => generateAccessCode(5, undefined, () => i)));
    expect(seen.size).toBe(ALLOWED_SUFFIXES.length);
    for (let i = 0; i < 300; i++) expect(generateAccessCode(5, '0547')).not.toBe('0547');
  });

  it('קוד של לומד אחר, או 10203040, אינו קוד תקין ללומד', () => {
    expect(isWellFormedCode(3, '0447')).toBe(false);
    expect(isWellFormedCode(3, '10203040')).toBe(false);
    expect(isWellFormedCode(3, '0334')).toBe(false);
  });

  it('השלמת הרשימה שומרת קודים תקינים ומחליפה חסרים או פגומים', () => {
    const { codes, changed } = completeCodeMap({ '1': '0147', '2': '0211' });
    expect(changed).toBe(true);
    expect(codes['1']).toBe('0147');
    expect(isWellFormedCode(2, codes['2'])).toBe(true);
    expect(Object.keys(codes)).toHaveLength(12);
    expect(completeCodeMap(codes).changed).toBe(false);
  });

  it('השוואה: רק הקוד המדויק', () => {
    expect(codesMatch('0147', '0147')).toBe(true);
    expect(codesMatch('0147', ' 0147 ')).toBe(true);
    expect(codesMatch('0147', '0148')).toBe(false);
    expect(codesMatch('0147', '10203040')).toBe(false);
    expect(codesMatch('0147', 147)).toBe(false);
  });

  it('השוואה: כל מה שאינו בדיוק 4 ספרות נדחה לפני ההשוואה', () => {
    for (const bad of ['', '014', '01470', '01a7', '0147\n0147', '0'.repeat(9), ' '.repeat(4) + '0147' + ' '.repeat(4) + ' ', '٠١٤٧']) {
      expect(codesMatch('0147', bad), JSON.stringify(bad)).toBe(false);
    }
    expect(codesMatch('0147', '0147' + 'x'.repeat(1_000_000))).toBe(false);
    // A stored value that is not a string never matches.
    expect(codesMatch(undefined as unknown as string, '0147')).toBe(false);
  });
});

describe('הרשימה — למורה ולמנהל המערכת בלבד', () => {
  it('מורה מקבלת 12 קודים, והם נוצרים בקריאה הראשונה ונשמרים', async () => {
    const res = await call(getLearnerAccessCodes, {}, TEACHER);
    expect(Object.keys(res.codes)).toHaveLength(12);
    for (let id = 1; id <= 12; id++) expect(isWellFormedCode(id, res.codes[String(id)])).toBe(true);
    expect(h.docs['learner_access_codes/class_1'].codes).toEqual(res.codes);
    expect(h.docs['learner_access_codes/class_1'].updated_by).toBe('uid_x');
    const again = await call(getLearnerAccessCodes, {}, ADMIN);
    expect(again.codes).toEqual(res.codes);
  });

  it('לומד, אנונימי או מי שאינו מחובר — נדחים', async () => {
    await expect(call(getLearnerAccessCodes, {}, { role: 'student', student_id: 3 })).rejects.toThrow();
    await expect(call(getLearnerAccessCodes, {}, ANON)).rejects.toThrow();
    await expect(call(getLearnerAccessCodes, {}, null)).rejects.toThrow();
    await expect(call(regenerateLearnerAccessCode, { studentId: 3 }, { role: 'student', student_id: 3 })).rejects.toThrow();
    await expect(call(getLearnerAccessCodes, {}, { role: 'teacher', class_id: 'class_9' })).rejects.toThrow();
  });

  it('מורה שבאסימון שלה אין class_id — נדחית (fail closed)', async () => {
    await expect(call(getLearnerAccessCodes, {}, { role: 'teacher' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(regenerateLearnerAccessCode, { studentId: 3 }, { role: 'teacher' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(getLearnerAccessCodes, {}, { role: 'teacher', class_id: '' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.docs['learner_access_codes/class_1']).toBeUndefined();
  });

  it('"קוד חדש" משנה רק את הקוד של הלומד הזה — מורה וגם מנהל', async () => {
    const before = (await call(getLearnerAccessCodes, {}, TEACHER)).codes;
    const r1 = await call(regenerateLearnerAccessCode, { studentId: 7 }, TEACHER);
    expect(r1.studentId).toBe(7);
    expect(isWellFormedCode(7, r1.code)).toBe(true);
    expect(r1.code).not.toBe(before['7']);
    const after = h.docs['learner_access_codes/class_1'].codes;
    expect(after['7']).toBe(r1.code);
    for (let id = 1; id <= 12; id++) if (id !== 7) expect(after[String(id)]).toBe(before[String(id)]);
    const r2 = await call(regenerateLearnerAccessCode, { studentId: 7 }, ADMIN);
    expect(r2.code).not.toBe(r1.code);
  });

  it('מספר לומד מחוץ ל-1–12 נדחה', async () => {
    for (const bad of [0, 13, 2.5, '3', null]) {
      await expect(call(regenerateLearnerAccessCode, { studentId: bad }, TEACHER)).rejects.toThrow();
    }
  });

  it('כרטיסי הכניסה מציגים לכל לומד את הקוד שלו — למנהל בלבד', async () => {
    const list = (await call(getLearnerAccessCodes, {}, TEACHER)).codes;
    const cards = await call(getStudentLoginCards, {}, ADMIN);
    expect(cards.studentIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(cards.codes).toEqual(list);
    expect(cards).not.toHaveProperty('passcode');
    await expect(call(getStudentLoginCards, {}, TEACHER)).rejects.toThrow();
  });
});

describe('כניסת לומד — מול הקוד האישי', () => {
  it('הקוד של הלומד מכניס, ומטביע את זהותו', async () => {
    const codes = (await call(getLearnerAccessCodes, {}, TEACHER)).codes;
    const res = await call(authenticateStudentSession, { studentId: 4, passcode: codes['4'] }, ANON, 'anon_1');
    expect(res.success).toBe(true);
    expect(h.claims).toHaveLength(1);
    expect((h.claims[0].claims as any).student_id).toBe(4);
  });

  it('10203040, קוד של לומד אחר או קוד ישן — נדחים, ושום זהות אינה מוטבעת', async () => {
    const codes = (await call(getLearnerAccessCodes, {}, TEACHER)).codes;
    await expect(call(authenticateStudentSession, { studentId: 4, passcode: '10203040' }, ANON)).rejects.toThrow(/Invalid access code/);
    await expect(call(authenticateStudentSession, { studentId: 4, passcode: codes['5'] }, ANON)).rejects.toThrow(/Invalid access code/);
    const old = codes['4'];
    await call(regenerateLearnerAccessCode, { studentId: 4 }, TEACHER);
    await expect(call(authenticateStudentSession, { studentId: 4, passcode: old }, ANON)).rejects.toThrow(/Invalid access code/);
    expect(h.claims).toHaveLength(0);
  });

  it('קוד ארוך מ-4 ספרות נדחה גם כשהוא מתחיל בקוד הנכון', async () => {
    const codes = (await call(getLearnerAccessCodes, {}, TEACHER)).codes;
    await expect(call(authenticateStudentSession, { studentId: 6, passcode: codes['6'] + '0' }, ANON)).rejects.toThrow(/Invalid access code/);
    await expect(call(authenticateStudentSession, { studentId: 6, passcode: codes['6'].repeat(1000) }, ANON)).rejects.toThrow(/Invalid access code/);
    expect(h.claims).toHaveLength(0);
  });

  it('כשהרשימה שלמה, כניסת לומד קוראת בלבד — בלי טרנזקציה; "קוד חדש" נשאר בטרנזקציה', async () => {
    const codes = (await call(getLearnerAccessCodes, {}, TEACHER)).codes;
    expect(h.transactions).toBe(1); // the list was created once
    h.transactions = 0;
    for (let id = 1; id <= 12; id++) {
      await call(authenticateStudentSession, { studentId: id, passcode: codes[String(id)] }, ANON, `anon_${id}`);
    }
    await call(getLearnerAccessCodes, {}, ADMIN);
    expect(h.transactions).toBe(0);
    expect(h.claims).toHaveLength(12);
    await call(regenerateLearnerAccessCode, { studentId: 2 }, TEACHER);
    expect(h.transactions).toBe(1);
  });

  it('רשימה חסרה לומד — נקראת בטרנזקציה ומושלמת, והקודים הקיימים נשמרים', async () => {
    h.docs['learner_access_codes/class_1'] = { codes: { '1': '0147' } };
    await expect(call(authenticateStudentSession, { studentId: 1, passcode: '0147' }, ANON)).resolves.toMatchObject({ success: true });
    expect(h.transactions).toBe(1);
    const stored = h.docs['learner_access_codes/class_1'].codes;
    expect(stored['1']).toBe('0147');
    expect(Object.keys(stored)).toHaveLength(12);
  });

  it('לפני שנוצרה רשימה, 10203040 אינו מכניס — והרשימה נוצרת', async () => {
    await expect(call(authenticateStudentSession, { studentId: 1, passcode: '10203040' }, ANON)).rejects.toThrow();
    expect(Object.keys(h.docs['learner_access_codes/class_1'].codes)).toHaveLength(12);
    expect(h.claims).toHaveLength(0);
  });

  it('אף קוד אינו נכתב ליומן', async () => {
    const codes = (await call(getLearnerAccessCodes, {}, TEACHER)).codes;
    const r = await call(regenerateLearnerAccessCode, { studentId: 2 }, TEACHER);
    await call(authenticateStudentSession, { studentId: 2, passcode: r.code }, ANON);
    await call(authenticateStudentSession, { studentId: 3, passcode: '0000' }, ANON).catch(() => {});
    const all = h.logs.join('\n');
    // As a whole token: a timestamp in a log line may contain the same four digits.
    for (const c of [...Object.values(codes) as string[], r.code]) expect(all).not.toMatch(new RegExp(`\\b${c}\\b`));
  });

  it('הקוד המשותף נעלם מקוד השרת', () => {
    for (const f of ['authenticateStudentSession.ts', 'studentLoginCards.ts', 'learnerAccessCodes.ts']) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf-8');
      expect(src).not.toContain('10203040');
      expect(src).not.toContain('FIXED_CLASS_PASSCODE');
    }
  });
});
