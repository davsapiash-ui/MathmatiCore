import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PRD Module 22 §ב, layer 2: "מסירה שם שבא אחרי 'תלמיד N המכונה' ומשאירה
 * 'תלמיד N' … אין במערכת רשימת שמות של הכיתה (Zero PII), ולכן השרת אינו מצליב
 * מול שמות, ושם פרטי שנכתב לבדו אינו מוחלף." §ז: "תלמיד 3 המכונה דניאל מתקשה
 * בפריטה" → "תלמיד 3 מתקשה בפריטה".
 */
const h = vi.hoisted(() => ({ docs: {} as Record<string, Record<string, any>> }));

vi.mock('firebase-functions/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, log: () => {} }));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  let auto = 0;
  const docRef = (collection: string, id: string) => ({
    id,
    set: async (data: Record<string, any>) => { h.docs[`${collection}/${id}`] = { ...data }; },
  });
  const db = { collection: (name: string) => ({ doc: (id?: string) => docRef(name, id ?? `auto_${++auto}`) }) };
  const firestore = Object.assign(() => db, actual.firestore);
  return { ...actual, default: { ...actual, firestore }, firestore };
});

import { sendTeacherAdminMessage, stripNicknameAfterLearnerId } from '../teacherAdminChat';

const TEACHER = { role: 'teacher', teacher: true, email: 'teacher@edu-haifa.org.il' };
const send = async (data: Record<string, unknown>) => {
  const res = await (sendTeacherAdminMessage as any).run({ data: { receiver_id: 'admin', ...data }, auth: { uid: 't', token: TEACHER }, rawRequest: {} });
  return res.message.message_body as string;
};

beforeEach(() => { h.docs = {}; });

describe('the name after "תלמיד N המכונה"', () => {
  it('PRD 22 §ז: one name, the sentence after it kept', () => {
    expect(stripNicknameAfterLearnerId('תלמיד 3 המכונה דניאל מתקשה בפריטה')).toBe('תלמיד 3 מתקשה בפריטה');
  });

  it('a name of two words at the end of the message', () => {
    expect(stripNicknameAfterLearnerId('תלמיד 3 המכונה דני כהן')).toBe('תלמיד 3');
  });

  it('a name of two words that ends a clause', () => {
    expect(stripNicknameAfterLearnerId('תלמיד 3 המכונה דני כהן, מתקשה בפריטה')).toBe('תלמיד 3, מתקשה בפריטה');
    expect(stripNicknameAfterLearnerId('תלמיד 3 המכונה דני כהן. תלמיד 4 המכונה רון מצליח בחיבור')).toBe('תלמיד 3. תלמיד 4 מצליח בחיבור');
  });

  it('text without the phrase is unchanged', () => {
    expect(stripNicknameAfterLearnerId('תלמיד 3 מתקשה בפריטה')).toBe('תלמיד 3 מתקשה בפריטה');
  });
});

describe('sendTeacherAdminMessage', () => {
  it('stores "תלמיד 3" without the two-word name', async () => {
    expect(await send({ message_body: 'תלמיד 3 המכונה דני כהן' })).toBe('תלמיד 3');
    expect(await send({ message_body: 'תלמיד 3 המכונה דניאל מתקשה בפריטה' })).toBe('תלמיד 3 מתקשה בפריטה');
  });

  it('accepts no list of names: a name map sent with the message is ignored and never matched', async () => {
    const body = await send({ message_body: 'דניאל מתקשה בפריטה', ephemeral_name_map: { 'דניאל': 3 } });
    // "שם פרטי שנכתב לבדו אינו מוחלף" — and no map turns it into "תלמיד 3".
    expect(body).toBe('דניאל מתקשה בפריטה');
    const stored = Object.values(h.docs)[0];
    expect(JSON.stringify(stored)).not.toContain('ephemeral_name_map');
  });
});
