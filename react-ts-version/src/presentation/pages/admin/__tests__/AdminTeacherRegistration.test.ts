import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 25 §ב + Module 1 §ג (the spec caps students, never teachers; no domain filter):
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
  // authorizedTeachers documents by address; absent = not on the list.
  docs: {} as Record<string, Record<string, unknown>>,
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
  getDoc: vi.fn((r: { col: string; id: string }) => {
    const d = r?.col === 'authorizedTeachers' ? firestoreMock.docs[r.id] : undefined;
    return Promise.resolve({ exists: () => Boolean(d), data: () => d ?? null });
  }),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  setDoc: firestoreMock.setDoc,
  deleteDoc: firestoreMock.deleteDoc,
  // writeClassDocument clears a stale updated_at (PRD Module 4 l.222).
  deleteField: vi.fn(() => ({ __deleteField: true })),
}));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  authReady: Promise.resolve(),
  auth: { currentUser: null },
  // `app` present → AuthService.isFirestoreAvailable() is true and the whitelist writes run.
  firestore: { app: {} },
  functions: {},
}));

import { useAdminStore, staffFromAuthorizedTeachers, isProtectedStaff } from '@/application/useAdminStore';
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
    expect(view.includes('handleDeleteTeacher(')).toBe(true);
    expect(view).toMatch(/const handleResetPilot = async \(\) => \{\s*if \(!confirmAction\(/);
  });

  it('the school and the class cannot be deleted from the card (owner, 11.10.2026)', () => {
    for (const gone of ['handleDeleteSchool', 'handleDeleteClass', 'deleteSchool', 'deleteClassRoom', 'מחק מוסד', 'מחק כיתה']) {
      expect(view.includes(gone), gone).toBe(false);
    }
    const sync = read('../../../../infrastructure/services/FirebaseSyncService.ts');
    expect(sync).not.toContain('public async deleteSchool');
    expect(sync).not.toContain('public async deleteClassRoom');
  });

  it('an admin entry or a read-only entry has no working remove button', () => {
    expect(view).toContain('disabled={readOnly || isProtectedStaff(teacher) || isDeletingId === teacher.id}');
    expect(view).toContain('if (isProtectedStaff(teacher)) return;');
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

  it('the RTDB teacher list is no second whitelist: staff read it, only the admin writes it (28.9.2026)', () => {
    // It used to be read by every signed-in identity, including the anonymous
    // session of any visitor, and a self-written record there passed the login
    // check. The admin-registered teacher gets in through authorizedTeachers
    // (tested above); the real-engine proof is Module24_AdminBlocked.live.test.ts.
    const rules = JSON.parse(read('../../../../../../database.rules.json'));
    const teachers = rules.rules.users.teachers;
    expect(teachers['.read']).not.toBe('auth != null');
    expect(teachers['.read']).toContain("auth.token.teacher == true");
    expect(teachers.$teacherId['.read']).toBeUndefined();
    expect(teachers.$teacherId['.write']).not.toContain('auth.uid == $teacherId');
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
      teachers: [{ id: 'lead_school_org_il', schoolId: 'school_1', ssoEmail: 'lead@school.org.il', licenseActive: false, createdAt: 1 }],
      classes: [{ id: 'class_1', schoolId: 'school_1', teacherId: 'lead_school_org_il', name: 'המבקרים', studentLimit: 12, createdAt: 1 }],
      globalStudentLimit: 12,
    });
  });

  it('addTeacher writes the login whitelist and resolves with the canonical record', async () => {
    const saved = await useAdminStore.getState().addTeacher('school_1', 'Dana@School.org.il');
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
    await expect(useAdminStore.getState().addTeacher('school_1', 'dana@school.org.il')).rejects.toThrow('permission-denied');
    expect(useAdminStore.getState().teachers.map((t) => t.id)).toEqual(['lead_school_org_il']);
  });

  it('deleteTeacher revokes the login whitelist and hands the class to another teacher instead of deleting it', async () => {
    useAdminStore.setState({
      teachers: [
        ...useAdminStore.getState().teachers,
        { id: 'second_school_org_il', schoolId: 'school_1', ssoEmail: 'second@school.org.il', licenseActive: false, createdAt: 2 },
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

  it('the staff list is authorizedTeachers (Module 25 §ב.3), keyed as every other path keys the teacher', () => {
    const teachers = staffFromAuthorizedTeachers([
      { id: 'lead@school.org.il', data: { email: 'lead@school.org.il', role: 'teacher', schoolId: 'school_1', createdAt: 5 } },
      { id: 'owner@school.org.il', data: { email: 'owner@school.org.il', role: 'admin' } },
      { id: 'lecturer@uni.ac.il', data: { email: 'lecturer@uni.ac.il', readOnly: true } },
      { id: 'not-an-address', data: {} },
    ]);
    expect(teachers.map((t) => t.id)).toEqual(['lead_school_org_il', 'owner_school_org_il', 'lecturer_uni_ac_il']);
    expect(teachers[0]).toMatchObject({ ssoEmail: 'lead@school.org.il', schoolId: 'school_1', role: 'teacher', createdAt: 5 });
    // One school in the pilot: an entry with none belongs to it.
    expect(teachers[1].schoolId).toBe('school_bikorot');
    expect(isProtectedStaff(teachers[0])).toBe(false);
    expect(isProtectedStaff(teachers[1])).toBe(true);
    expect(isProtectedStaff(teachers[2])).toBe(true);
  });

  it('the console no longer reads users/teachers for its staff list', () => {
    const store = read('../../../../application/useAdminStore.ts');
    const sync = read('../../../../infrastructure/services/FirebaseSyncService.ts');
    expect(store).toContain("onSnapshot(collection(firestore, 'authorizedTeachers')");
    expect(store).not.toMatch(/onValue\(teachersRef/);
    expect(store).not.toContain('unsubTeachers');
    expect(sync).not.toMatch(/onValue\(teachersRef/);
  });

  it('firebaseSyncService.addTeacher keys by teacherRecordKey, whitelists the e-mail, and writes no address to RTDB', async () => {
    const { set } = await import('firebase/database');
    vi.mocked(set).mockClear();
    const t = await firebaseSyncService.addTeacher('school_1', 'Dana@School.org.il');
    expect(t.id).toBe('dana_school_org_il');
    expect(t.ssoEmail).toBe('dana@school.org.il');
    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
    const rtdbRecord = vi.mocked(set).mock.calls[0][1] as Record<string, unknown>;
    expect(rtdbRecord).toEqual({ id: 'dana_school_org_il', schoolId: 'school_1', licenseActive: false, createdAt: expect.any(Number) });
    expect(JSON.stringify(rtdbRecord)).not.toContain('@');
  });

  it('no RTDB teacher write carries an address (Module 25 §ב.3)', () => {
    const store = read('../../../../application/useAdminStore.ts');
    const auth = read('../../../../infrastructure/services/AuthService.ts');
    expect(store).toContain("updates[`users/teachers/${teacherKey}`] = { id: teacherKey, schoolId, licenseActive: false, createdAt: timestamp };");
    expect(store).toContain("{ [pilotTeacherKey]: cleanTeacherRecord }");
    const ensure = auth.slice(auth.indexOf('async function ensureTeacherRecord'), auth.indexOf('export interface AuthenticatedUserPayload'));
    expect(ensure).not.toContain('ssoEmail');
    expect(ensure).not.toMatch(/^\s+email(: email)?,\s*$/m);
  });
});

describe('the whitelist keeps an existing role (owner, 11.10.2026)', () => {
  beforeEach(() => {
    firestoreMock.setDoc.mockClear();
    firestoreMock.docs = {};
  });

  it('an existing admin document is not turned into a teacher by the pilot reset', async () => {
    firestoreMock.docs['1002220159@edu-haifa.org.il'] = { email: '1002220159@edu-haifa.org.il', role: 'admin', createdAt: 1 };
    useAdminStore.setState({ schools: [], teachers: [], classes: [] });
    await useAdminStore.getState().resetInstitutionsToOfficialPilot();
    const whitelistWrites = (firestoreMock.setDoc.mock.calls as unknown as [{ col: string; id: string }, Record<string, unknown>][])
      .filter(([ref]) => ref.col === 'authorizedTeachers');
    expect(whitelistWrites).toHaveLength(1);
    expect(whitelistWrites[0][1]).toEqual({ email: '1002220159@edu-haifa.org.il', schoolId: 'school_bikorot' });
    expect(whitelistWrites[0][1]).not.toHaveProperty('role');
    expect(whitelistWrites[0][1]).not.toHaveProperty('createdAt');
  });

  it('a new address gets the role', async () => {
    const { addAuthorizedTeacherFirestore } = await import('@/infrastructure/services/AuthService');
    await addAuthorizedTeacherFirestore('new@school.org.il', 'teacher', 'school_bikorot');
    const [, data] = firestoreMock.setDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(data).toMatchObject({ email: 'new@school.org.il', role: 'teacher', schoolId: 'school_bikorot' });
  });
});

describe('teacher removal refuses an admin or a read-only entry (owner, 11.10.2026)', () => {
  beforeEach(() => {
    firestoreMock.deleteDoc.mockClear();
    firestoreMock.docs = {};
    vi.mocked(update).mockClear();
  });

  it('the service refuses before anything is written, reading authorizedTeachers', async () => {
    firestoreMock.docs['lecturer@uni.ac.il'] = { email: 'lecturer@uni.ac.il', role: 'teacher', readOnly: true };
    await expect(firebaseSyncService.deleteTeacher('lecturer_uni_ac_il', { email: 'lecturer@uni.ac.il', successorId: null }))
      .rejects.toThrow('staff/protected-entry');
    firestoreMock.docs['owner@school.org.il'] = { email: 'owner@school.org.il', role: 'admin' };
    await expect(firebaseSyncService.deleteTeacher('owner_school_org_il', { email: 'owner@school.org.il', successorId: null }))
      .rejects.toThrow('staff/protected-entry');
    expect(vi.mocked(update)).not.toHaveBeenCalled();
    expect(firestoreMock.deleteDoc).not.toHaveBeenCalled();
  });
});

/**
 * Module 25 §ד: "הקמת מסמכי הכיתה והמורים ב-Firestore" (finding 63/90,
 * 1.10.2026). The setup wrote the class to RTDB only; the Firestore class
 * document first appeared at the teacher's first meeting activation, and the
 * class type the admin chose reached no document.
 */
describe('the setup creates the Firestore class document with the chosen class type', () => {
  beforeEach(() => {
    firestoreMock.setDoc.mockClear();
    useAdminStore.setState({ schools: [], teachers: [], classes: [], globalStudentLimit: 8 });
  });

  const classDocWrite = () => {
    const call = (firestoreMock.setDoc.mock.calls as unknown as [{ col: string; id: string }, Record<string, unknown>, unknown][])
      .find(([ref]) => ref.col === 'classes');
    return call ? { ref: call[0], data: call[1], options: call[2] } : null;
  };

  it('the full setup wizard', async () => {
    await useAdminStore.getState().provisionFullInstitution({
      schoolName: 'x', teacherEmail: 'lead@school.org.il', className: 'x', classType: 'כיתת פיילוט סטנדרטית', studentLimit: 12,
    });
    const w = classDocWrite();
    expect(w?.ref.id).toBe('class_1');
    // Exactly the fields isValidClassDoc admits (Module 4 + register deviation 14), non-nullable ones set.
    expect(w?.data).toEqual({
      class_id: 'class_1', school_id: 'school_bikorot', class_name: 'המבקרים',
      class_type: 'כיתת פיילוט סטנדרטית', student_count: 12, created_at: expect.any(Number),
      // an old updated_at is cleared, since the merge write would otherwise keep it and be refused (PRD l.222)
      updated_at: { __deleteField: true },
    });
    expect(w?.options).toEqual({ merge: true });
  });

  it('"הקמת כיתה" — and the class takes the fixed capacity, not an old stored limit', async () => {
    useAdminStore.setState({
      schools: [{ id: 'school_bikorot', name: 'בית ספר ביקורת', createdAt: 1 }],
      teachers: [{ id: 'lead_school_org_il', schoolId: 'school_bikorot', ssoEmail: 'lead@school.org.il', licenseActive: false, createdAt: 1 }],
    });
    await useAdminStore.getState().addClassRoom('school_bikorot', 'lead_school_org_il', 'המבקרים', 'כיתת תמיכה מוגברת (UDL)');
    expect(classDocWrite()?.data).toMatchObject({ class_type: 'כיתת תמיכה מוגברת (UDL)', class_name: 'המבקרים' });
    expect(useAdminStore.getState().classes[0].studentLimit).toBe(12);
  });

  it('a refused class document fails the setup instead of reporting a class that is not there', async () => {
    firestoreMock.setDoc.mockImplementation(((ref: { col: string }) =>
      ref.col === 'classes' ? Promise.reject(new Error('permission-denied')) : Promise.resolve()) as never);
    await expect(useAdminStore.getState().provisionFullInstitution({
      schoolName: 'x', teacherEmail: 'lead@school.org.il', className: 'x', classType: 'קבוצת ביקורת פיילוט',
    })).rejects.toThrow('permission-denied');
    firestoreMock.setDoc.mockImplementation((() => Promise.resolve()) as never);
  });
});
