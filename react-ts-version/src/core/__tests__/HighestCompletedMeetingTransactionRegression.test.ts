import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  calculateMonotonicMeetingUpdate, 
  FirebaseSyncService 
} from '@/infrastructure/services/FirebaseSyncService';

// In-memory mock database node for testing transaction behavior
let mockDbState: Record<string, any> = {};

vi.mock('firebase/database', async () => {
  return {
    ref: vi.fn((_db: any, path: string = '') => ({ _path: path })),
    set: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    push: vi.fn(),
    onValue: vi.fn(),
    onDisconnect: vi.fn(() => ({ set: vi.fn(), cancel: vi.fn() })),
    serverTimestamp: vi.fn(() => 123456789),
    runTransaction: vi.fn(async (targetRef: any, updateFn: (current: any) => any) => {
      const path = targetRef._path;
      const currentVal = mockDbState[path] ?? null;
      const newVal = updateFn(currentVal);
      // In Firebase RTDB, returning undefined aborts the transaction (no write)
      if (newVal !== undefined) {
        mockDbState[path] = newVal;
      }
      return { committed: newVal !== undefined, snapshot: { val: () => mockDbState[path] } };
    }),
  };
});

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {}
}));

describe('Monotonic Progress Protection: highestCompletedMeeting runTransaction', () => {
  beforeEach(() => {
    mockDbState = {};
    vi.clearAllMocks();
  });

  describe('1. Pure Logic: calculateMonotonicMeetingUpdate', () => {
    it('initializes highestCompletedMeeting from null/undefined to initial meeting', () => {
      expect(calculateMonotonicMeetingUpdate(null, 1)).toBe(1);
      expect(calculateMonotonicMeetingUpdate(undefined, 2)).toBe(2);
    });

    it('advances progress forward monotonically when meeting > currentVal', () => {
      expect(calculateMonotonicMeetingUpdate(2, 5)).toBe(5);
      expect(calculateMonotonicMeetingUpdate(5, 8)).toBe(8);
      expect(calculateMonotonicMeetingUpdate('3', 6)).toBe(6);
    });

    it('strictly rejects out-of-order stale packets (meeting <= currentVal) returning undefined', () => {
      // Meeting 3 arriving after Meeting 5 must be rejected (no-op)
      expect(calculateMonotonicMeetingUpdate(5, 3)).toBeUndefined();
      expect(calculateMonotonicMeetingUpdate(5, 5)).toBeUndefined();
      expect(calculateMonotonicMeetingUpdate(8, 1)).toBeUndefined();
      expect(calculateMonotonicMeetingUpdate('7', 4)).toBeUndefined();
    });

    it('handles corrupted NaN values with console.warn and heals them by defaulting currentNum to 0', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      expect(calculateMonotonicMeetingUpdate('corrupted_invalid', 4)).toBe(4);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid non-numeric highestCompletedMeeting detected in DB:'),
        'corrupted_invalid'
      );

      expect(calculateMonotonicMeetingUpdate(NaN, 3)).toBe(3);

      warnSpy.mockRestore();
    });
  });

  describe('2. Integration: syncHighestCompletedMeeting with Out-of-Order Network Writes', () => {
    it('prevents stale out-of-order write (meeting=3 landing after meeting=5) from overwriting DB', async () => {
      const service = FirebaseSyncService.getInstance();
      const studentId = 'student_user1';

      // 1. Initial completion of meeting 5 lands in DB
      await service.syncHighestCompletedMeeting(studentId, 5);
      expect(mockDbState[`users/students/${studentId}/highestCompletedMeeting`]).toBe(5);

      // 2. Delayed/stale packet of meeting 3 arrives out-of-order
      await service.syncHighestCompletedMeeting(studentId, 3);

      // 3. DB must strictly remain at meeting 5 (not overwritten to 3!)
      expect(mockDbState[`users/students/${studentId}/highestCompletedMeeting`]).toBe(5);

      // 4. Legitimate next completion (meeting 6) advances progress
      await service.syncHighestCompletedMeeting(studentId, 6);
      expect(mockDbState[`users/students/${studentId}/highestCompletedMeeting`]).toBe(6);
    });

    it('updates both studentId and normalized studentId paths when they differ', async () => {
      const service = FirebaseSyncService.getInstance();
      // student_1 normalizes to student_user1
      const rawStudentId = 'student_1';
      const normStudentId = 'student_user1';

      await service.syncHighestCompletedMeeting(rawStudentId, 4);

      expect(mockDbState[`users/students/${rawStudentId}/highestCompletedMeeting`]).toBe(4);
      expect(mockDbState[`users/students/${normStudentId}/highestCompletedMeeting`]).toBe(4);
    });
  });
});
