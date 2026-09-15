import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAdminStore } from '../useAdminStore';
import { PILOT_SCHOOL_ID, PILOT_SCHOOL_NAME, PILOT_CLASS_ID, PILOT_CLASS_NAME } from '@/core/pilotInstitution';

// Mock Firebase RTDB methods
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve({
    exists: () => false,
    val: () => null
  })),
  update: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'mock_push_key_123' })),
  onValue: vi.fn(),
  onDisconnect: vi.fn(() => ({ set: vi.fn() })),
  runTransaction: vi.fn(async (_ref, updateFn) => { if (typeof updateFn === 'function') return updateFn(0); }),
  serverTimestamp: vi.fn(() => Date.now())
}));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  authReady: Promise.resolve(),
  auth: { currentUser: null },
  firestore: {},
}));

describe('Admin Store State Synchronization & Creation/Deletion', () => {
  beforeEach(() => {
    useAdminStore.setState({
      schools: [],
      teachers: [],
      classes: [],
      globalStudentLimit: 12,
    });
  });

  it('adds and deletes the pilot school optimistically with state sync (Module 25 §ב.1 fixes its id and name)', () => {
    const store = useAdminStore.getState();
    expect(store.schools).toHaveLength(0);

    store.addSchool('any name the form sends');
    const updatedState = useAdminStore.getState();
    expect(updatedState.schools).toHaveLength(1);
    expect(updatedState.schools[0].id).toBe(PILOT_SCHOOL_ID);
    expect(updatedState.schools[0].name).toBe(PILOT_SCHOOL_NAME);

    useAdminStore.getState().deleteSchool(PILOT_SCHOOL_ID);
    expect(useAdminStore.getState().schools).toHaveLength(0);
  });

  it('adds and deletes teachers optimistically with state sync', () => {
    useAdminStore.getState().addSchool('ignored');
    const schoolId = useAdminStore.getState().schools[0].id;

    useAdminStore.getState().addTeacher(schoolId, 'teacher.david@edu-haifa.org.il');
    const stateWithTeacher = useAdminStore.getState();
    expect(stateWithTeacher.teachers).toHaveLength(1);
    expect(stateWithTeacher.teachers[0].ssoEmail).toBe('teacher.david@edu-haifa.org.il');

    useAdminStore.getState().deleteTeacher('teacher.david@edu-haifa.org.il');
    expect(useAdminStore.getState().teachers).toHaveLength(0);
  });

  it('adds and deletes the pilot class optimistically with state sync', async () => {
    useAdminStore.getState().addSchool('ignored');
    const schoolId = useAdminStore.getState().schools[0].id;

    useAdminStore.getState().addTeacher(schoolId, '123456789');
    const teacherId = '123456789';

    await useAdminStore.getState().addClassRoom(schoolId, teacherId, 'any name the form sends');
    const stateWithClass = useAdminStore.getState();
    expect(stateWithClass.classes).toHaveLength(1);
    expect(stateWithClass.classes[0].id).toBe(PILOT_CLASS_ID);
    expect(stateWithClass.classes[0].name).toBe(PILOT_CLASS_NAME);
    expect(stateWithClass.classes[0].studentLimit).toBe(12);

    useAdminStore.getState().deleteClassRoom(PILOT_CLASS_ID);
    expect(useAdminStore.getState().classes).toHaveLength(0);
  });

  it('cascades school deletion to associated teachers and classes', async () => {
    useAdminStore.getState().addSchool('ignored');
    const schoolId = useAdminStore.getState().schools[0].id;

    useAdminStore.getState().addTeacher(schoolId, '987654321');
    await useAdminStore.getState().addClassRoom(schoolId, '987654321', 'ignored');

    expect(useAdminStore.getState().schools).toHaveLength(1);
    expect(useAdminStore.getState().teachers).toHaveLength(1);
    expect(useAdminStore.getState().classes).toHaveLength(1);

    useAdminStore.getState().deleteSchool(schoolId);

    expect(useAdminStore.getState().schools).toHaveLength(0);
    expect(useAdminStore.getState().teachers).toHaveLength(0);
    expect(useAdminStore.getState().classes).toHaveLength(0);
  });

  it('updates global student limit synchronously', () => {
    useAdminStore.getState().setGlobalStudentLimit(40);
    expect(useAdminStore.getState().globalStudentLimit).toBe(40);
  });
});
