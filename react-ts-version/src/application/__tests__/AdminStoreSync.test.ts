import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAdminStore } from '../useAdminStore';

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
  database: {}
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

  it('adds and deletes schools optimistically with state sync', () => {
    const store = useAdminStore.getState();
    expect(store.schools).toHaveLength(0);

    store.addSchool('בית ספר הרצל');
    const updatedState = useAdminStore.getState();
    expect(updatedState.schools).toHaveLength(1);
    expect(updatedState.schools[0].name).toBe('בית ספר הרצל');

    const schoolId = updatedState.schools[0].id;
    useAdminStore.getState().deleteSchool(schoolId);
    expect(useAdminStore.getState().schools).toHaveLength(0);
  });

  it('adds and deletes teachers optimistically with state sync', () => {
    useAdminStore.getState().addSchool('בית ספר בגין');
    const schoolId = useAdminStore.getState().schools[0].id;

    useAdminStore.getState().addTeacher(schoolId, 'מורה דוד', '039604483', '290984');
    const stateWithTeacher = useAdminStore.getState();
    expect(stateWithTeacher.teachers).toHaveLength(1);
    expect(stateWithTeacher.teachers[0].name).toBe('מורה דוד');
    expect(stateWithTeacher.teachers[0].taz).toBe('039604483');

    useAdminStore.getState().deleteTeacher('039604483');
    expect(useAdminStore.getState().teachers).toHaveLength(0);
  });

  it('adds and deletes classrooms optimistically with state sync', () => {
    useAdminStore.getState().addSchool('מוסד פיילוט');
    const schoolId = useAdminStore.getState().schools[0].id;

    useAdminStore.getState().addTeacher(schoolId, 'מורה שרה', '123456789', '010190');
    const teacherId = '123456789';

    useAdminStore.getState().addClassRoom(schoolId, teacherId, 'כיתה ד1');
    const stateWithClass = useAdminStore.getState();
    expect(stateWithClass.classes).toHaveLength(1);
    expect(stateWithClass.classes[0].name).toBe('כיתה ד1');
    expect(stateWithClass.classes[0].studentLimit).toBe(12);

    const classId = stateWithClass.classes[0].id;
    useAdminStore.getState().deleteClassRoom(classId);
    expect(useAdminStore.getState().classes).toHaveLength(0);
  });

  it('cascades school deletion to associated teachers and classes', () => {
    useAdminStore.getState().addSchool('מוסד משולב');
    const schoolId = useAdminStore.getState().schools[0].id;

    useAdminStore.getState().addTeacher(schoolId, 'מורה ראשי', '987654321', '010190');
    useAdminStore.getState().addClassRoom(schoolId, '987654321', 'כיתה א1');

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
