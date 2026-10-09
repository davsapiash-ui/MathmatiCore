/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * PRD 23א §ז, scenario 1 (l.1085): the teacher confirms a reset and her
 * connection drops right after. The reset runs on the server; "תוצאת האיפוס
 * מוצגת למורה כשהחיבור שלה חוזר". The dashboard used to tell her to refresh
 * the page and check for herself. Now it names the reset (reset_id), keeps the
 * name, and reads the reset's entry until it is final — then shows it with the
 * messages the reset already uses.
 */

const mockCallable = vi.fn();
const mockFetchEntry = vi.fn();

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
  push: vi.fn(() => ({ key: 'k' })),
  onDisconnect: vi.fn(() => ({ set: vi.fn(async () => {}) })),
  runTransaction: vi.fn(async () => ({ committed: true })),
  serverTimestamp: vi.fn(() => Date.now()),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), setDoc: vi.fn(async () => {}) }));
vi.mock('@/infrastructure/services/LearnerJourneyService', () => ({
  invalidateLearnerEventsCache: vi.fn(),
  fetchResetAuditEntry: (...args: unknown[]) => mockFetchEntry(...args),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a), info: vi.fn(), warning: vi.fn() },
}));

const {
  loggedResetOutcome,
  newResetId,
  watchResetOutcome,
  RESET_OUTCOME_MESSAGES_HE,
  RESET_OUTCOME_WAIT_MS,
  RESET_OUTCOME_POLL_MS,
} = await import('@/application/resetOutcome');
const { useStore, resumePendingResetWatch } = await import('@/application/useStore');

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const entry = (over: Record<string, unknown>) => ({
  reset_id: 'reset_1', class_id: 'class_1', reset_level: 'single_student', backup_status: 'success',
  backup_file_url: 'gs://b/x.json', ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  mockCallable.mockReset();
  mockFetchEntry.mockReset();
  toastError.mockClear();
  toastSuccess.mockClear();
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });

describe('loggedResetOutcome: the entry, read back', () => {
  const t0 = 1_000_000;
  it('final statuses', () => {
    expect(loggedResetOutcome(entry({ deletion_status: 'completed', session_number: 3, side_effect_errors: ['x'] }), t0, t0 + 1))
      .toEqual({ status: 'completed', data: { webViewLink: 'gs://b/x.json', sideEffectErrors: ['x'], sessionNumber: 3 } });
    expect(loggedResetOutcome(entry({ backup_status: 'failed', deletion_status: 'not_required' }), t0, t0 + 1))
      .toEqual({ status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.backupFailed });
    expect(loggedResetOutcome(entry({ deletion_status: 'partial' }), t0, t0 + 1))
      .toEqual({ status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.deletionIncomplete });
    expect(loggedResetOutcome(entry({ deletion_status: 'not_required' }), t0, t0 + 1))
      .toEqual({ status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.abortedAfterBackup });
  });

  it('still running, or not logged yet: waiting — until the longest a reset can run has passed', () => {
    expect(loggedResetOutcome(entry({ deletion_status: 'in_progress' }), t0, t0 + 1)).toEqual({ status: 'waiting' });
    expect(loggedResetOutcome(null, t0, t0 + 1)).toEqual({ status: 'waiting' });
    expect(loggedResetOutcome(entry({ deletion_status: 'in_progress' }), t0, t0 + RESET_OUTCOME_WAIT_MS))
      .toEqual({ status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.deletionIncomplete });
    // Nothing is deleted before the entry is written: no entry means nothing deleted.
    expect(loggedResetOutcome(null, t0, t0 + RESET_OUTCOME_WAIT_MS)).toEqual({ status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.notStarted });
    expect(RESET_OUTCOME_MESSAGES_HE.notStarted).toContain('לא נמחקו נתונים');
  });

  it('newResetId has the shape the server accepts', () => {
    expect(newResetId(1_759_400_000_000)).toMatch(/^reset_1759400000000_[a-z0-9]{10}$/);
    expect(newResetId()).not.toBe(newResetId());
  });
});

describe('watchResetOutcome: reads until final, then reports once', () => {
  it('a failed read (offline) and an unwritten entry are retried; the final outcome is reported once', async () => {
    mockFetchEntry
      .mockRejectedValueOnce(new Error('client is offline'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(entry({ deletion_status: 'completed', session_number: 4 }));
    const onCompleted = vi.fn();
    const onFailed = vi.fn();
    watchResetOutcome({ resetId: 'reset_1', kind: 'system', startedAt: Date.now() }, { fetchEntry: mockFetchEntry, onCompleted, onFailed });
    await flush();
    expect(onCompleted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RESET_OUTCOME_POLL_MS);
    expect(onCompleted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RESET_OUTCOME_POLL_MS);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted.mock.calls[0][1]).toMatchObject({ sessionNumber: 4 });
    await vi.advanceTimersByTimeAsync(RESET_OUTCOME_POLL_MS * 3);
    expect(mockFetchEntry).toHaveBeenCalledTimes(3);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('the connection coming back reads at once', async () => {
    mockFetchEntry.mockResolvedValueOnce(null).mockResolvedValueOnce(entry({ deletion_status: 'partial' }));
    const onFailed = vi.fn();
    watchResetOutcome({ resetId: 'reset_2', kind: 'system', startedAt: Date.now() }, { fetchEntry: mockFetchEntry, onCompleted: vi.fn(), onFailed });
    await flush();
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ resetId: 'reset_2' }), RESET_OUTCOME_MESSAGES_HE.deletionIncomplete);
  });
});

describe('the dashboard: no answer, then the outcome when the connection returns', () => {
  it('the class reset names itself, waits, and shows the success it would have shown', async () => {
    mockCallable.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code: 'functions/unavailable' }));
    mockFetchEntry.mockRejectedValue(new Error('client is offline'));

    await expect(useStore.getState().resetClassActiveSession('technical_fault', undefined, 3)).rejects.toThrow('RESET_OUTCOME_UNKNOWN');
    const sent = mockCallable.mock.calls[0][0] as Record<string, unknown>;
    expect(String(sent.reset_id)).toMatch(/^reset_\d+_[a-z0-9]{10}$/);
    expect(toastError).toHaveBeenLastCalledWith(RESET_OUTCOME_MESSAGES_HE.noAnswer, expect.anything());
    expect(String(toastError.mock.lastCall?.[0])).not.toContain('רעננו את הדף');
    expect(toastSuccess).not.toHaveBeenCalled();

    // The connection returns; the server finished the reset meanwhile.
    mockFetchEntry.mockReset();
    mockFetchEntry.mockResolvedValue(entry({ reset_id: sent.reset_id, deletion_status: 'completed', session_number: 3, reset_target: 'class' }));
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(mockFetchEntry).toHaveBeenCalledWith(sent.reset_id);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(String(toastSuccess.mock.calls[0][0])).toContain('אופס לכל הכיתה');
  });

  it('after a reload the pending reset is picked up again, and a failure is shown as the reset shows it', async () => {
    mockCallable.mockRejectedValueOnce(Object.assign(new Error('deadline-exceeded'), { code: 'functions/deadline-exceeded' }));
    mockFetchEntry.mockRejectedValue(new Error('client is offline'));
    await expect(useStore.getState().resetEntireSystemUsageData('technical_fault')).rejects.toThrow('RESET_OUTCOME_UNKNOWN');
    const sent = mockCallable.mock.calls[0][0] as Record<string, unknown>;

    // A fresh page: the pending reset comes from the browser's storage.
    mockFetchEntry.mockReset();
    mockFetchEntry.mockResolvedValue(entry({ reset_id: sent.reset_id, reset_level: 'system', backup_status: 'failed', deletion_status: 'not_required' }));
    resumePendingResetWatch();
    await flush();
    expect(toastError).toHaveBeenLastCalledWith(RESET_OUTCOME_MESSAGES_HE.backupFailed, expect.anything());
    // Reported once, then forgotten.
    toastError.mockClear();
    resumePendingResetWatch();
    await flush();
    expect(toastError).not.toHaveBeenCalled();
  });
});
