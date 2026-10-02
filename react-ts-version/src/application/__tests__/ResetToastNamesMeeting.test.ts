import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Owner, 2.10.2026: "תתקן ותפטור כבר עכשיו את הבאג של 4".
 *
 * The toast after a single learner's "המפגש הנוכחי" reset said "…הוחזר לתחילת
 * המפגש הנוכחי" when no meeting was open, although the server returns the
 * meeting it restarted. It now names that meeting — the server's, not the one
 * the client asked for.
 */

const mockCallable = vi.fn();
const mockToastSuccess = vi.fn();

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
  ref: vi.fn(() => ({})),
  onValue: vi.fn(() => () => {}),
  update: vi.fn(async () => {}),
  get: vi.fn(async () => ({ exists: () => false, val: () => null })),
  remove: vi.fn(async () => {}),
  set: vi.fn(async () => {}),
  push: vi.fn(() => ({ key: 'mock_key' })),
  onDisconnect: vi.fn(() => ({ set: vi.fn(async () => {}) })),
  runTransaction: vi.fn(async () => ({ committed: true })),
  serverTimestamp: vi.fn(() => Date.now()),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), setDoc: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: (...args: unknown[]) => mockToastSuccess(...args), info: vi.fn(), warning: vi.fn() },
}));

const { useStore } = await import('@/application/useStore');

describe('the single-learner reset toast names the meeting the server reset', () => {
  beforeEach(() => {
    mockCallable.mockReset();
    mockToastSuccess.mockClear();
  });

  it('no open meeting: the server chose the learner\'s meeting 4', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS', resetScope: 'active_session', sessionNumber: 4 } });
    await useStore.getState().resetStudentData('student_user3', 'student_stuck', undefined, { scope: 'active_session', sessionNumber: 4 });
    expect(mockToastSuccess).toHaveBeenCalledWith('תלמיד 3 הוחזר לתחילת מפגש 4 · חיבור במאונך עם הקבצה. שאר המפגשים נשמרו.');
  });

  it('the server\'s number wins over the one sent', async () => {
    mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS', sessionNumber: 2 } });
    await useStore.getState().resetStudentData('student_user5', 'student_stuck', undefined, { scope: 'active_session', sessionNumber: null });
    expect(mockToastSuccess).toHaveBeenCalledWith('תלמיד 5 הוחזר לתחילת מפגש 2 · יוצאים למסע. שאר המפגשים נשמרו.');
  });
});
