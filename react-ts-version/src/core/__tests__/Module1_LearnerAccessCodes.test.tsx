/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD מודול 1 §א ומודול 25 §ב.3 — קוד גישה אישי בן 4 ספרות לכל לומד. "רשימת
 * הקודים … גלויים למורה ולמנהל המערכת, וכל אחד מהם יכול לשנות את הקוד של לומד."
 * הקודים נשמרים בשרת בלבד: אוסף learner_access_codes סגור בפני כל לקוח, גם
 * בפני הצוות, שקורא ומשנה אותו רק דרך פונקציות הענן.
 *
 * ההתנהגות של התצוגה עצמה (12 קודים, "קוד חדש", בלי אחסון בדפדפן) נבדקת
 * ב-LearnerAccessCodesView.test.tsx; ההתנהגות בשרת ב-functions.
 */
const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');
const rules = read('firestore.rules');
const view = read('react-ts-version/src/presentation/pages/TeacherDashboard/components/LearnerAccessCodes.tsx');
const cm = read('react-ts-version/src/presentation/pages/TeacherDashboard/ClassManagement.tsx');
const index = read('functions/src/index.ts');

const h = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; data: unknown }>,
}));

// A full stub, as in SignInEntersOnlyALiveMeeting.test.tsx.
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  db: {},
  functions: {},
  authReady: Promise.resolve(true),
  auth: { currentUser: { isAnonymous: true, getIdToken: async () => 'token' } },
  fetchServerClockOffset: () => Promise.resolve(0),
  isServerClockKnown: () => true,
  serverNow: () => Date.now(),
}));
vi.mock('firebase/functions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  httpsCallable: (_f: unknown, name: string) => (data?: unknown) => {
    h.calls.push({ name, data });
    return Promise.resolve({ data: { ok: true } });
  },
}));
vi.mock('firebase/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ref: vi.fn((_db: unknown, path = '') => ({ path })),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  onValue: vi.fn(() => () => {}),
  set: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
  onDisconnect: vi.fn(() => ({ set: () => Promise.resolve(), update: () => Promise.resolve(), cancel: () => Promise.resolve() })),
}));

import { Login } from '@/presentation/pages/Login';
import { useAuthStore } from '@/application/useAuthStore';

describe('אוסף קודי הגישה — סגור בפני כל לקוח', () => {
  it('חוק Firestore: אין קריאה ואין כתיבה מהדפדפן', () => {
    const start = rules.indexOf('match /learner_access_codes/{classId}');
    expect(start).toBeGreaterThan(0);
    const block = rules.slice(start, rules.indexOf('\n    }', start));
    expect(block).toContain('allow read, write: if false;');
    expect(block.match(/allow /g)).toHaveLength(1);
  });

  it('אין חוק כללי (document=**) שפותח את האוסף', () => {
    expect(rules).not.toMatch(/match \/\{document=\*\*\}/);
  });

  it('צד הלקוח אינו ניגש לאוסף ישירות, רק דרך פונקציות הענן', () => {
    expect(view).not.toContain('learner_access_codes');
    expect(view).not.toMatch(/from ['"]firebase\/firestore['"]/);
    expect(index).toContain('export { getLearnerAccessCodes, regenerateLearnerAccessCode } from "./learnerAccessCodes";');
  });

  it('הרשימה מוצגת בניהול הכיתה', () => {
    expect(cm).toContain('<LearnerAccessCodes />');
  });
});

describe('מסך הכניסה — קוד בן 4 ספרות', () => {
  beforeEach(() => {
    h.calls = [];
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
  });
  afterEach(() => cleanup());

  const openLearnerSignIn = async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth" element={<Login studentForm />} />
          <Route path="/hub" element={<div>LOBBY</div>} />
          <Route path="/workspace" element={<div>MEETING</div>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('תלמיד'));
    return (await screen.findByPlaceholderText('••••')) as HTMLInputElement;
  };

  it('שדה קוד הגישה: 4 ספרות, מקלדת מספרית, מוסתר', async () => {
    const field = await openLearnerSignIn();
    expect(field.maxLength).toBe(4);
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.type).toBe('password');
  });

  it('הקוד שהוקלד נשלח לשרת כמו שהוא, עם מספר הלומד', async () => {
    const field = await openLearnerSignIn();
    fireEvent.change(field, { target: { value: '0147' } });
    fireEvent.click(screen.getByText('כניסה'));
    await waitFor(() => expect(h.calls.some((c) => c.name === 'authenticateStudentSession')).toBe(true));
    const sent = h.calls.find((c) => c.name === 'authenticateStudentSession')!.data as Record<string, unknown>;
    expect(sent).toMatchObject({ studentId: 1, passcode: '0147', classId: 'class_1' });
  });
});
