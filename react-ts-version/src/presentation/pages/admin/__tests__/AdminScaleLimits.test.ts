import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAdminStore } from '@/application/useAdminStore';

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
 * The suite this replaced (title: "PRD Section 5.6 Admin Scale Limits") cited
 * a PRD subsection that doesn't exist (grep -n "5\.6" on the PRD returns
 * nothing) and injected its own 5-school/5-teacher/35-student-per-class
 * fixture via setState, then asserted that fixture against itself — it could
 * not fail, and 35 directly contradicts the PRD's hard 12-student cap
 * (Module 25 §ב.2). This version exercises the real store mutators instead.
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
    expect(state.schools[0].name).toBe('בית ספר ביקורת');

    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('המבקרים');
    expect(state.classes[0].studentLimit).toBe(12);

    expect(state.globalStudentLimit).toBe(12);
  });

  it('addClassRoom() always caps a new class at the current globalStudentLimit, regardless of caller intent', () => {
    useAdminStore.getState().addSchool('בית ספר ביקורת');
    const schoolId = useAdminStore.getState().schools[0].id;
    useAdminStore.getState().addTeacher(schoolId, 'מורה מוביל', 'teacher@edu-haifa.org.il', '010190');
    const teacherId = 'teacher@edu-haifa.org.il';

    useAdminStore.getState().addClassRoom(schoolId, teacherId, 'המבקרים');

    const created = useAdminStore.getState().classes[0];
    expect(created.studentLimit).toBe(12);

    // Module 25 §ב.2: the 12-cap tracks globalStudentLimit, which the pilot
    // reset above always restores to 12 — it is not a value the class-creation
    // call can override on its own.
    useAdminStore.getState().setGlobalStudentLimit(6);
    useAdminStore.getState().addClassRoom(schoolId, teacherId, 'כיתה נוספת');
    expect(useAdminStore.getState().classes[1].studentLimit).toBe(6);
  });
});
