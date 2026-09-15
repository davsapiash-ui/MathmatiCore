import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAdminStore } from '@/application/useAdminStore';
import { PILOT_CLASS_ID, PILOT_CLASS_NAME, PILOT_SCHOOL_ID, PILOT_SCHOOL_NAME } from '@/core/pilotInstitution';

// Mock Firebase RTDB methods (mirrors application/__tests__/AdminStoreSync.test.ts)
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  update: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'mock_push_key_123' })),
  onValue: vi.fn(),
  onDisconnect: vi.fn(() => ({ set: vi.fn() })),
  runTransaction: vi.fn(async (_ref, updateFn) => { if (typeof updateFn === 'function') return updateFn(0); }),
  serverTimestamp: vi.fn(() => Date.now()),
}));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  authReady: Promise.resolve(),
  auth: { currentUser: null },
  firestore: {},
}));

/**
 * Module 25 Admin Scale Limits.
 *
 * Module 25 §ב: "הגדרת בית ספר יחיד בשם 'בית ספר ביקורת' וכיתה פעילה אחת בלבד
 * בשם 'המבקרים'" and a hard cap of 12 learners. The store used to allow up to
 * five schools and five classes per teacher; it now allows exactly one of each.
 */
describe('Module 25: Admin Scale Limits', () => {
  beforeEach(() => {
    useAdminStore.setState({
      schools: [],
      teachers: [],
      classes: [],
      globalStudentLimit: 12,
    });
  });

  it('resetInstitutionsToOfficialPilot() produces exactly the PRD-mandated single school/class structure', async () => {
    await useAdminStore.getState().resetInstitutionsToOfficialPilot();
    const state = useAdminStore.getState();

    expect(state.schools).toHaveLength(1);
    expect(state.schools[0].name).toBe(PILOT_SCHOOL_NAME);

    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe(PILOT_CLASS_NAME);
    expect(state.classes[0].studentLimit).toBe(12);

    expect(state.globalStudentLimit).toBe(12);
  });

  it('a second school is never created', () => {
    useAdminStore.getState().addSchool('first');
    useAdminStore.getState().addSchool('second');
    const { schools } = useAdminStore.getState();
    expect(schools).toHaveLength(1);
    expect(schools[0].id).toBe(PILOT_SCHOOL_ID);
  });

  it('the one class takes the global limit, and a second class is refused', async () => {
    useAdminStore.getState().addSchool('ignored');
    const schoolId = useAdminStore.getState().schools[0].id;

    await useAdminStore.getState().addClassRoom(schoolId, 'teacher_key', 'ignored');
    const created = useAdminStore.getState().classes[0];
    expect(created.id).toBe(PILOT_CLASS_ID);
    expect(created.name).toBe(PILOT_CLASS_NAME);
    expect(created.studentLimit).toBe(12);

    await expect(
      useAdminStore.getState().addClassRoom(schoolId, 'teacher_key', 'כיתה נוספת')
    ).rejects.toThrow();
    expect(useAdminStore.getState().classes).toHaveLength(1);
  });

  it('full provisioning is refused once the pilot school or class exists', async () => {
    useAdminStore.getState().addSchool('ignored');
    await expect(
      useAdminStore.getState().provisionFullInstitution({
        schoolName: 'מוסד נוסף',
        teacherEmail: 'second@school.org.il',
        className: 'כיתה נוספת',
        classType: 'קבוצת ביקורת פיילוט',
        studentLimit: 12,
      })
    ).rejects.toThrow();
    expect(useAdminStore.getState().schools).toHaveLength(1);
  });
});
