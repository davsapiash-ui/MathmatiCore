import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 25 §ב + Module 1 §ג + deviation 1 (מסמכי אפיון/סטיות_מהאפיון.md):
 * the admin registers every authorised teacher from the console, and that
 * registration is what lets the teacher through Google sign-in.
 *
 * "רישום מורה" on the school card did not work for the pilot school because
 * the wizard enforced an invented "one lead teacher per school" rule; and a
 * teacher who did get registered was bounced straight back to /login,
 * because Login.tsx dropped the whitelistVerified stamp the guards rely on.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

const firestoreMock = vi.hoisted(() => ({
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path?: string) => ({ path })),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn((r: { path?: string }) => {
    const path = r?.path ?? '';
    if (path === 'users/teachers') {
      return Promise.resolve({
        exists: () => true,
        val: () => ({
          lead_school_org_il: { id: 'lead_school_org_il', schoolId: 'school_1', ssoEmail: 'lead@school.org.il', name: 'מובילה' },
          second_school_org_il: { id: 'second_school_org_il', schoolId: 'school_1', ssoEmail: 'second@school.org.il', name: 'שנייה' },
        }),
      });
    }
    if (path === 'users/teachers/lead_school_org_il') {
      return Promise.resolve({ exists: () => true, val: () => ({ id: 'lead_school_org_il', schoolId: 'school_1', ssoEmail: 'lead@school.org.il' }) });
    }
    if (path === 'classes') {
      return Promise.resolve({ exists: () => true, val: () => ({ class_1: { id: 'class_1', schoolId: 'school_1', teacherId: 'lead_school_org_il', name: 'המבקרים' } }) });
    }
    return Promise.resolve({ exists: () => false, val: () => null });
  }),
  update: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'mock_push_key' })),
  onValue: vi.fn(),
  onDisconnect: vi.fn(() => ({ set: vi.fn() })),
  runTransaction: vi.fn(async (_ref: unknown, fn: (v: number) => number) => (typeof fn === 'function' ? fn(0) : undefined)),
  serverTimestamp: vi.fn(() => Date.now()),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  setDoc: firestoreMock.setDoc,
  deleteDoc: firestoreMock.deleteDoc,
}));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  authReady: Promise.resolve(),
  auth: { currentUser: null },
  // `app` present → AuthService.isFirestoreAvailable() is true and the whitelist writes run.
  firestore: { app: {} },
  functions: {},
}));

import { useAdminStore, normalizeTeacherRecords } from '@/application/useAdminStore';
import { teacherRecordKey, firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { update } from 'firebase/database';

describe('Module 25: registering a second teacher for the pilot school', () => {
  const wizard = read('../AdminWizardModal.tsx');
  const view = read('../AdminSchoolsView.tsx');

  it('the wizard no longer enforces an invented one-teacher-per-school or five-teachers cap', () => {
    expect(wizard.includes('מורה מוביל אחד בלבד לכל מוסד')).toBe(false);
    expect(wizard.includes('5 מורים בסך הכל')).toBe(false);
    expect(wizard.includes('schoolTeachers.length >= 1')).toBe(false);
    // Only a real e-mail and no duplicate remain as conditions.
    expect(wizard.includes('כבר רשומה במערכת כמורה')).toBe(true);
  });

  it('mounts through createPortal OUTSIDE AnimatePresence, so the dialog actually appears', () => {
    // A React portal is not a "valid element" to AnimatePresence's child
    // filter. The old nesting <AnimatePresence>{createPortal(...)}</AnimatePresence>
    // silently dropped the whole dialog: every wizard button (רישום מורה,
    // הקמת מוסד) set isOpen=true and nothing ever rendered. Verified in a
    // real browser (Playwright) on 2026-09-09.
    expect(wizard).toMatch(/return createPortal\(\s*<AnimatePresence>/);
    expect(wizard).not.toMatch(/<AnimatePresence>\s*\{isOpen &&\s*createPortal\(/);
  });

  it('the wizard re-derives its step and target school every time it opens', () => {
    expect(wizard).toMatch(/useEffect\(\(\) => \{\s*if \(!isOpen\) return;\s*setStep\(mode === "add_teacher" \? 2/);
    expect(wizard.includes('setSelectedSchoolId(initialTargetSchoolId || (schools[0]?.id ?? ""))')).toBe(true);
  });

  it('the wizard awaits the server write and shows the failure instead of a success screen', () => {
    expect(wizard.includes('const handleQuickAddTeacher = async () => {')).toBe(true);
    expect(wizard.includes('await addTeacher(schoolId,')).toBe(true);
    expect(wizard.includes('רישום המורה נכשל בשרת')).toBe(true);
  });

  it('the school card offers "add teacher" regardless of how many are registered and no longer shows "n / 1"', () => {
    expect(view.includes('{schoolTeachers.length === 0 && (')).toBe(false);
    expect(view.includes('{schoolTeachers.length} / 1')).toBe(false);
    expect(view.includes('{teachers.length} / 5')).toBe(false);
    expect(view.includes('+ הוסף מורה')).toBe(true);
  });

  it('destructive actions on the school card ask before deleting', () => {
    expect(view.includes('window.confirm(message)')).toBe(true);
    for (const h of ['handleDeleteSchool', 'handleDeleteTeacher', 'handleDeleteClass']) {
      expect(view.includes(`${h}(`)).toBe(true);
    }
    expect(view).toMatch(/const handleResetPilot = async \(\) => \{\s*if \(!confirmAction\(/);
  });
});

describe('Module 1 §ג: an admin-registered teacher actually gets in', () => {
  it('Login.tsx carries the whitelistVerified stamp the route guards trust', () => {
    const login = read('../../Login.tsx');
    expect(login.includes('whitelistVerified: authenticatedUser.whitelistVerified === true')).toBe(true);
  });

  it('the whitelist write is strict (a denied write fails the registration)', () => {
    const auth = read('../../../../infrastructure/services/AuthService.ts');
    const fn = auth.slice(auth.indexOf('export async function addAuthorizedTeacherFirestore'));
    const body = fn.slice(0, fn.indexOf('export async function removeAuthorizedTeacherFirestore'));
    expect(body.includes('console.warn("addAuthorizedTeacherFirestore non-blocking error:"')).toBe(false);
    expect(body).not.toMatch(/try \{[\s\S]*await setDoc/);
    expect(body.includes('await setDoc(teacherDocRef')).toBe(true);
    expect(auth.includes('export async function removeAuthorizedTeacherFirestore')).toBe(true);
  });

  it('the RTDB fallback whitelist check reads the field admin records actually carry (ssoEmail)', () => {
    const auth = read('../../../../infrastructure/services/AuthService.ts');
    expect(auth.includes('[t?.ssoEmail, t?.email].some(')).toBe(true);
  });

  it('every path keys the teacher record the same way', () => {
    expect(teacherRecordKey('Dana.Levi@School.org.il')).toBe('dana_levi_school_org_il');
    expect(teacherRecordKey('1002220159@edu-haifa.org.il')).toBe('1002220159_edu-haifa_org_il');
    const auth = read('../../../../infrastructure/services/AuthService.ts');
    expect(auth.includes('const key = teacherRecordKey(email);')).toBe(true);
    const store = read('../../../../application/useAdminStore.ts');
    expect(store.includes('const teacherKey = teacherRecordKey(id);')).toBe(true);
    expect(store.includes('const pilotTeacherKey = teacherRecordKey(pilotTeacherEmail);')).toBe(true);
  });

  it('the RTDB rules no longer let any e-mail containing "admin" write teacher records', () => {
    const rules = read('../../../../../../database.rules.json');
    expect(rules.includes('matches(/.*admin.*/)')).toBe(false);
  });
});

describe('useAdminStore teacher lifecycle (mocked Firebase)', () => {
  beforeEach(() => {
    firestoreMock.setDoc.mockClear();
    firestoreMock.deleteDoc.mockClear();
    vi.mocked(update).mockClear();
    useAdminStore.setState({
      schools: [{ id: 'school_1', name: 'בית ספר ביקורת', createdAt: 1 }],
      teachers: [{ id: 'lead_school_org_il', schoolId: 'school_1', ssoEmail: 'lead@school.org.il', dob: '', name: 'מובילה', licenseActive: false, createdAt: 1 }],
      classes: [{ id: 'class_1', schoolId: 'school_1', teacherId: 'lead_school_org_il', name: 'המבקרים', studentLimit: 12, createdAt: 1 }],
      globalStudentLimit: 12,
    });
  });

  it('addTeacher writes the login whitelist and resolves with the canonical record', async () => {
    const saved = await useAdminStore.getState().addTeacher('school_1', 'דנה', 'Dana@School.org.il', '');
    expect(saved.id).toBe('dana_school_org_il');
    expect(saved.ssoEmail).toBe('dana@school.org.il');
    expect(useAdminStore.getState().teachers).toHaveLength(2);
    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
    const [docRef, data] = firestoreMock.setDoc.mock.calls[0] as unknown as [{ col: string; id: string }, { role: string; schoolId: string }];
    expect(docRef.col).toBe('authorizedTeachers');
    expect(docRef.id).toBe('dana@school.org.il');
    expect(data.role).toBe('teacher');
    expect(data.schoolId).toBe('school_1');
  });

  it('addTeacher rolls back and rejects when the whitelist write is denied', async () => {
    firestoreMock.setDoc.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(useAdminStore.getState().addTeacher('school_1', 'דנה', 'dana@school.org.il', '')).rejects.toThrow('permission-denied');
    expect(useAdminStore.getState().teachers.map((t) => t.id)).toEqual(['lead_school_org_il']);
  });

  it('deleteTeacher revokes the login whitelist and hands the class to another teacher instead of deleting it', async () => {
    useAdminStore.setState({
      teachers: [
        ...useAdminStore.getState().teachers,
        { id: 'second_school_org_il', schoolId: 'school_1', ssoEmail: 'second@school.org.il', dob: '', name: 'שנייה', licenseActive: false, createdAt: 2 },
      ],
    });
    await useAdminStore.getState().deleteTeacher('lead_school_org_il');

    expect(useAdminStore.getState().teachers.map((t) => t.id)).toEqual(['second_school_org_il']);
    expect(useAdminStore.getState().classes).toHaveLength(1);
    expect(useAdminStore.getState().classes[0].teacherId).toBe('second_school_org_il');

    const written = vi.mocked(update).mock.calls[0][1] as Record<string, unknown>;
    expect(written['users/teachers/lead_school_org_il']).toBeNull();
    expect(written['classes/class_1/teacherId']).toBe('second_school_org_il');
    expect(Object.keys(written).some((k) => k === 'classes/class_1' || k === 'public_classes/class_1')).toBe(false);

    expect(firestoreMock.deleteDoc).toHaveBeenCalledTimes(1);
    expect((firestoreMock.deleteDoc.mock.calls[0] as unknown as [{ id: string }])[0].id).toBe('lead@school.org.il');
  });

  it('presence stubs and e-mail-less junk under users/teachers are not counted as staff', () => {
    const teachers = normalizeTeacherRecords({
      teacher_1002220159: { isOnline: true, lastPing: 1 },
      lead_school_org_il: { id: 'lead_school_org_il', schoolId: 'school_1', ssoEmail: 'lead@school.org.il', name: 'מובילה' },
      login_created: { email: 'other@school.org.il', name: 'x' },
    });
    expect(teachers.map((t) => t.id)).toEqual(['lead_school_org_il', 'login_created']);
    expect(teachers[1].ssoEmail).toBe('other@school.org.il');
  });

  it('firebaseSyncService.addTeacher keys by teacherRecordKey and whitelists the e-mail', async () => {
    const t = await firebaseSyncService.addTeacher('school_1', 'דנה', 'Dana@School.org.il', '');
    expect(t.id).toBe('dana_school_org_il');
    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
  });
});
