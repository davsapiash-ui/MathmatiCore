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

  it('adds the pilot school optimistically with state sync (Module 25 §ב.1 fixes its id and name)', () => {
    const store = useAdminStore.getState();
    expect(store.schools).toHaveLength(0);

    store.addSchool('any name the form sends');
    const updatedState = useAdminStore.getState();
    expect(updatedState.schools).toHaveLength(1);
    expect(updatedState.schools[0].id).toBe(PILOT_SCHOOL_ID);
    expect(updatedState.schools[0].name).toBe(PILOT_SCHOOL_NAME);
  });

  it('has no school or class deletion (owner, 11.10.2026): staff are never removed by deleting a school', () => {
    const state = useAdminStore.getState() as unknown as Record<string, unknown>;
    expect(state.deleteSchool).toBeUndefined();
    expect(state.deleteClassRoom).toBeUndefined();
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

  it('adds the pilot class optimistically with state sync', async () => {
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
  });

  it('refuses to remove an admin entry or a read-only entry (owner, 11.10.2026)', async () => {
    useAdminStore.setState({
      teachers: [
        { id: 'owner_example_org', schoolId: PILOT_SCHOOL_ID, ssoEmail: 'owner@example.org', licenseActive: false, createdAt: 1, role: 'admin' },
        { id: 'lecturer_example_org', schoolId: PILOT_SCHOOL_ID, ssoEmail: 'lecturer@example.org', licenseActive: false, createdAt: 1, role: 'teacher', readOnly: true },
      ],
    });
    await expect(useAdminStore.getState().deleteTeacher('owner_example_org')).rejects.toThrow('staff/protected-entry');
    await expect(useAdminStore.getState().deleteTeacher('lecturer_example_org')).rejects.toThrow('staff/protected-entry');
    expect(useAdminStore.getState().teachers).toHaveLength(2);
  });

  it('updates global student limit synchronously', () => {
    useAdminStore.getState().setGlobalStudentLimit(40);
    expect(useAdminStore.getState().globalStudentLimit).toBe(40);
  });
});
