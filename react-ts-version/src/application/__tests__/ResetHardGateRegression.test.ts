import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Module 23א §ג/§ז regression suite.
 *
 * Commit 2cbd71a ("fix: resolve system reset backup gate with Firestore vault
 * and guarantee complete data wipe") reverted the hard backup-before-delete
 * gate on `resetEntireSystemUsageData`: it replaced the abort-on-failure throw
 * with a mere console.warn, so a failed backup call fell through to deleting
 * all 12 students' data anyway. These tests exercise the real store actions
 * (not a self-mocked stand-in) against a mocked `backupAndResetSessionData`
 * callable and assert that every destructive RTDB call is skipped whenever
 * the callable rejects, for all three reset levels.
 */

const mockCallable = vi.fn();
const mockUpdate = vi.fn(async (..._args: any[]) => {});
const mockRemove = vi.fn(async (..._args: any[]) => {});
const mockSet = vi.fn(async (..._args: any[]) => {});

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  functions: {},
  firestore: {},
  authReady: Promise.resolve(true),
  serverNow: () => Date.now(),
  fetchServerClockOffset: async () => 0,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mockCallable),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  onValue: vi.fn(() => () => {}),
  update: (...args: any[]) => mockUpdate(...args),
  get: vi.fn(async () => ({ exists: () => false, val: () => null })),
  remove: (...args: any[]) => mockRemove(...args),
  set: (...args: any[]) => mockSet(...args),
  push: vi.fn(() => ({ key: 'mock_key' })),
  onDisconnect: vi.fn(() => ({ set: vi.fn(async () => {}) })),
  runTransaction: vi.fn(async () => ({ committed: true })),
  serverTimestamp: vi.fn(() => Date.now()),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(async () => {}),
}));

const { useStore } = await import('@/application/useStore');

describe('Module 23א: backup-before-delete hard gate (regression for Antigravity commit 2cbd71a)', () => {
  beforeEach(() => {
    mockCallable.mockReset();
    mockUpdate.mockClear();
    mockRemove.mockClear();
    mockSet.mockClear();
  });

  describe('resetStudentData (level 2 — single_student)', () => {
    it('aborts and performs zero RTDB writes when the backup callable rejects', async () => {
      mockCallable.mockRejectedValueOnce(new Error('network down'));

      await expect(
        useStore.getState().resetStudentData('student_1', 'technical_fault')
      ).rejects.toThrow('BACKUP_FAILED_RESET_ABORTED');

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('defaults to the active meeting only (PRD 23א §ב.2) and leaves the learner record to the server', async () => {
      mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });

      await useStore.getState().resetStudentData('student_1', 'technical_fault');

      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({ reset_level: 'single_student', reason: 'technical_fault', reset_scope: 'active_session', session_number: null })
      );
      // The server resets the meeting's fields in place; the client must not
      // wipe the whole record on top of it.
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('sends the open meeting number so the server restarts that meeting', async () => {
      mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });

      await useStore.getState().resetStudentData('student_1', 'student_stuck', undefined, { scope: 'active_session', sessionNumber: 4 });

      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({ reset_scope: 'active_session', session_number: 4 })
      );
    });

    it("wipes the learner's record locally too when the teacher chose a full reset", async () => {
      mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });

      await useStore.getState().resetStudentData('student_1', 'technical_fault', undefined, { scope: 'full_student' });

      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({ reset_level: 'single_student', reset_scope: 'full_student' })
      );
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
    });
  });

  describe('resetEntireSystemUsageData (level 3 — system)', () => {
    it('aborts and performs zero destructive RTDB calls when the backup callable rejects', async () => {
      mockCallable.mockRejectedValueOnce(new Error('network down'));

      await expect(
        useStore.getState().resetEntireSystemUsageData('technical_fault')
      ).rejects.toThrow('BACKUP_FAILED_RESET_ABORTED');

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('reports a server permission denial as such, not as a backup failure, and deletes nothing', async () => {
      const denied = Object.assign(new Error('איפוס נתוני למידה מותר למורת הכיתה בלבד (מודול 23א).'), {
        code: 'functions/permission-denied',
      });
      mockCallable.mockRejectedValueOnce(denied);

      await expect(
        useStore.getState().resetEntireSystemUsageData('technical_fault')
      ).rejects.toThrow('RESET_PERMISSION_DENIED');

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('proceeds with the full class RTDB wipe once the backup callable succeeds', async () => {
      mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });

      await useStore.getState().resetEntireSystemUsageData('technical_fault');

      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({ reset_level: 'system', reason: 'technical_fault' })
      );
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
    });
  });

  describe('resetRadarAlerts (level 1 — alerts, unified through the server callable)', () => {
    it('delegates entirely to the server callable and never writes its own audit entry via the client Firestore SDK', async () => {
      mockCallable.mockResolvedValueOnce({ data: { status: 'SUCCESS' } });

      await useStore.getState().resetRadarAlerts('restart_session', 'note');

      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({ reset_level: 'alerts', reason: 'restart_session', reason_note: 'note' })
      );
      // No direct RTDB alert-flag clearing left client-side — that's now the
      // server's job too, so update/remove for this level are never called
      // directly by the client action itself.
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('surfaces an error and never silently succeeds when the callable rejects', async () => {
      mockCallable.mockRejectedValueOnce(new Error('network down'));

      await expect(
        useStore.getState().resetRadarAlerts('restart_session')
      ).rejects.toThrow('ALERTS_RESET_FAILED');
    });
  });
});
