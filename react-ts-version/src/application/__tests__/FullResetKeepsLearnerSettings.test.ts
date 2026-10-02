import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Module 23א, owner 2.10.2026: "ברור שלשמור את הגדרות התלמיד אין צורך להקים לו
 * את זה מחדש". A full learner reset keeps the support profile and quiet mode the
 * teacher set. The server keeps them on the record (LEARNER_SETTINGS_FIELDS);
 * the client used to null the profile right after, on every alias, and dropped
 * both from its own copy of the learner.
 */

const mockCallable = vi.fn();
const mockUpdate = vi.fn(async (..._args: any[]) => {});

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  functions: {},
  firestore: {},
  authReady: Promise.resolve(true),
  serverNow: () => Date.now(),
  fetchServerClockOffset: async () => 0,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => mockCallable) }));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  onValue: vi.fn(() => () => {}),
  update: (...args: any[]) => mockUpdate(...args),
  get: vi.fn(async () => ({ exists: () => false, val: () => null })),
  remove: vi.fn(async () => {}),
  set: vi.fn(async () => {}),
  push: vi.fn(() => ({ key: 'mock_key' })),
  onDisconnect: vi.fn(() => ({ set: vi.fn(async () => {}) })),
  runTransaction: vi.fn(async () => ({ committed: true })),
  serverTimestamp: vi.fn(() => Date.now()),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), setDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const { useStore } = await import('@/application/useStore');

describe('a full learner reset keeps the teacher\'s settings for the learner', () => {
  beforeEach(() => {
    mockCallable.mockReset();
    mockUpdate.mockClear();
  });

  it('the client writes no support-profile field, so the profile the server kept stays', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });
    await useStore.getState().resetStudentData('student_user5', 'technical_fault', undefined, { scope: 'full_student' });
    expect(mockUpdate).toHaveBeenCalled();
    for (const [, payload] of mockUpdate.mock.calls) {
      expect(payload).not.toHaveProperty('support_profile_id');
      expect(payload).not.toHaveProperty('enhanced_support_profile');
      expect(payload).not.toHaveProperty('isASD');
      // Everything else is still reset.
      expect(payload).toMatchObject({ highestCompletedMeeting: 0, workspaceState: null, pedagogicalPath: null, forceReload: true });
    }
  });

  it('the teacher\'s copy of the learner keeps quiet mode and the profile, and loses the progress', async () => {
    useStore.setState((s) => ({
      students: {
        ...s.students,
        student_user6: {
          studentId: 'student_user6',
          classId: 'class_1',
          name: 'תלמיד 6',
          completedMeeting2: true,
          highestCompletedMeeting: 4,
          isASD: true,
          support_profile_id: 'enhanced_cognitive_support',
        } as any,
      },
    }));
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });
    await useStore.getState().resetStudentData('student_user6', 'technical_fault', undefined, { scope: 'full_student' });
    const after = useStore.getState().students.student_user6;
    expect(after.isASD).toBe(true);
    expect(after.support_profile_id).toBe('enhanced_cognitive_support');
    expect(after.highestCompletedMeeting).toBe(0);
    expect(after.completedMeeting2).toBe(false);
    expect(useStore.getState().students.student_6.isASD).toBe(true);
  });

  it('a learner with no settings gets none invented', async () => {
    useStore.setState((s) => ({
      students: { ...s.students, student_user7: { studentId: 'student_user7', classId: 'class_1', name: 'תלמיד 7', completedMeeting2: false, highestCompletedMeeting: 2 } as any },
    }));
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });
    await useStore.getState().resetStudentData('student_user7', 'technical_fault', undefined, { scope: 'full_student' });
    const after = useStore.getState().students.student_user7;
    expect(after.isASD).toBeUndefined();
    expect(after.support_profile_id).toBeUndefined();
  });
});
