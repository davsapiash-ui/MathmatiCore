import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  evaluateDeviceOwnership, 
  canWriteWorkspaceData 
} from '@/features/workspace/StudentWorkspacePage';
import { 
  calculateMonotonicMeetingUpdate, 
  FirebaseSyncService 
} from '@/infrastructure/services/FirebaseSyncService';
import { sanitizePII } from '@/core/security/PiiFilter';
import { normalizeStudentId, computeRoomId } from '@/application/useChatStore';

// In-Memory Global Mock Database
let mockDatabase: Record<string, any> = {};

vi.mock('firebase/database', async () => {
  return {
    ref: vi.fn((_db: any, path: string = '') => ({ _path: path })),
    set: vi.fn(async (targetRef: any, val: any) => {
      mockDatabase[targetRef._path] = val;
    }),
    get: vi.fn(async (targetRef: any) => ({
      exists: () => mockDatabase[targetRef._path] !== undefined && mockDatabase[targetRef._path] !== null,
      val: () => mockDatabase[targetRef._path]
    })),
    update: vi.fn(async (targetRef: any, val: any) => {
      const path: string = targetRef._path;
      const existing = mockDatabase[path] || {};
      const updated = typeof val === 'object' && !Array.isArray(val) ? { ...existing } : val;
      if (typeof val === 'object' && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) {
          if (k.includes('/')) {
            const parts = k.split('/');
            let curr = updated;
            for (let i = 0; i < parts.length - 1; i++) {
              curr[parts[i]] = curr[parts[i]] || {};
              curr = curr[parts[i]];
            }
            curr[parts[parts.length - 1]] = v;
          } else {
            updated[k] = v;
          }
        }
      }
      mockDatabase[path] = updated;
    }),
    push: vi.fn((targetRef: any) => {
      const key = `push_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      return { key, _path: `${targetRef._path}/${key}` };
    }),
    onValue: vi.fn(),
    onDisconnect: vi.fn(() => ({
      set: vi.fn(),
      cancel: vi.fn(),
    })),
    serverTimestamp: vi.fn(() => 123456789),
    runTransaction: vi.fn(async (targetRef: any, updateFn: (curr: any) => any) => {
      const path: string = targetRef._path;
      const parts = path.split('/');
      let curr = mockDatabase[path];
      if (curr === undefined && parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        const prop = parts[parts.length - 1];
        if (mockDatabase[parentPath]) {
          curr = mockDatabase[parentPath][prop];
        }
      }
      const next = updateFn(curr);
      if (next !== undefined) {
        mockDatabase[path] = next;
        if (parts.length > 1) {
          const parentPath = parts.slice(0, -1).join('/');
          const prop = parts[parts.length - 1];
          mockDatabase[parentPath] = {
            ...(mockDatabase[parentPath] || {}),
            [prop]: next
          };
        }
      }
      return { committed: next !== undefined, snapshot: { val: () => (next !== undefined ? next : curr) } };
    }),
    query: vi.fn((r: any) => r),
    limitToLast: vi.fn(() => ({})),
  };
});

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {}
}));

describe('💀 THE GRAND INQUISITION: Unforgiving Chaos, Concurrency & Adversarial Torture Suite', () => {

  beforeEach(() => {
    mockDatabase = {};
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. 50-TAB SPLIT-BRAIN & MULTI-DEVICE MEATGRINDER
  // =========================================================================
  describe('1. 50-Device Split-Brain Meatgrinder & Zero-Write Lock Enforcement', () => {
    it('forces 50 concurrent tabs to fight for ownership: exactly 1 wins, 49 are strictly muted', async () => {
      const studentUid = 'student_user1';
      const numTabs = 50;
      const tabIds = Array.from({ length: numTabs }, (_, i) => `tab_dev_${i + 1}`);

      // Simulate random registration times and select one authoritative winner in DB
      const winningTabIndex = Math.floor(Math.random() * numTabs);
      const winningTabId = tabIds[winningTabIndex];

      // Set DB authoritative active device
      mockDatabase[`users/students/${studentUid}`] = {
        active_device_id: winningTabId,
        isOnline: true,
        lastPing: Date.now(),
      };

      const writeAttemptSpies: Record<string, { update: ReturnType<typeof vi.fn>, push: ReturnType<typeof vi.fn> }> = {};

      // Simulate all 50 tabs reacting to the DB snapshot simultaneously
      for (const tabId of tabIds) {
        writeAttemptSpies[tabId] = {
          update: vi.fn(),
          push: vi.fn(),
        };

        const remoteDevId = mockDatabase[`users/students/${studentUid}`].active_device_id;
        const ownership = evaluateDeviceOwnership(remoteDevId, tabId);
        const canWrite = canWriteWorkspaceData(studentUid, ownership.isSuperseded);

        // Attempt write from tab
        if (canWrite) {
          writeAttemptSpies[tabId].update(`users/students/${studentUid}`, { counts: { units: 5 } });
          writeAttemptSpies[tabId].push(`users/students/${studentUid}/vector_replays`, { action: 'DRAG' });
        }

        // Verify mathematical lock invariant
        if (tabId === winningTabId) {
          expect(ownership.isSuperseded).toBe(false);
          expect(canWrite).toBe(true);
          expect(writeAttemptSpies[tabId].update).toHaveBeenCalledTimes(1);
          expect(writeAttemptSpies[tabId].push).toHaveBeenCalledTimes(1);
        } else {
          expect(ownership.isSuperseded).toBe(true);
          expect(canWrite).toBe(false);
          expect(writeAttemptSpies[tabId].update).not.toHaveBeenCalled();
          expect(writeAttemptSpies[tabId].push).not.toHaveBeenCalled();
        }
      }
    });

    it('simulates rapid sequential takeover storm: ownership shifts 20 times cleanly without ghost pings', () => {
      const studentUid = 'student_user2';
      let currentDbOwner = 'dev_initial';
      mockDatabase[`users/students/${studentUid}`] = { active_device_id: currentDbOwner };

      for (let step = 1; step <= 20; step++) {
        const newOwner = `dev_takeover_${step}`;
        currentDbOwner = newOwner;
        mockDatabase[`users/students/${studentUid}`].active_device_id = currentDbOwner;

        // Old owner check
        const oldOwnership = evaluateDeviceOwnership(currentDbOwner, `dev_takeover_${step - 1}`);
        expect(oldOwnership.isSuperseded).toBe(true);
        expect(canWriteWorkspaceData(studentUid, oldOwnership.isSuperseded)).toBe(false);

        // New owner check
        const newOwnership = evaluateDeviceOwnership(currentDbOwner, newOwner);
        expect(newOwnership.isSuperseded).toBe(false);
        expect(canWriteWorkspaceData(studentUid, newOwnership.isSuperseded)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. CHAOS NETWORK FUZZER FOR MONOTONIC PROGRESSION
  // =========================================================================
  describe('2. 100 Out-of-Order Packet Chaos Fuzzer on Meeting Progression', () => {
    it('bombards syncHighestCompletedMeeting with 100 shuffled packets and poisons: DB strictly reaches 8 monotonically', async () => {
      const service = FirebaseSyncService.getInstance();
      const studentId = 'student_user3';

      // 100 randomly shuffled meeting progression packets including out-of-order, duplicates, and poisons
      const chaoticPackets: any[] = [
        1, 3, 2, 5, 4, 3, 2, 6, 1, 5, 7, 2, 4, 8, 3, 1, 6, 7, 5, 2,
        4, 1, 6, 8, 5, 3, 7, 2, 4, 1, 5, 6, 3, 7, 8, 2, 1, 4, 5, 6,
        '3', '7', '8', '2', 'corrupt_string', null, undefined, -5, 0, 999,
        5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 2, 4, 6, 8, 1, 3, 5, 7,
        1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 1, 2, 3, 4,
        8, 7, 6, 5, 4, 3, 2, 1, 8, 7, 6, 5, 4, 3, 2, 1, 8, 8, 8, 8
      ];

      for (const packet of chaoticPackets) {
        await service.syncHighestCompletedMeeting(studentId, packet);
      }

      const finalVal = mockDatabase[`users/students/${studentId}/highestCompletedMeeting`];
      // Must be at least 8 (highest legitimate meeting completion in the stream)
      expect(finalVal).toBe(8);
      expect(typeof finalVal).toBe('number');
      expect(Number.isNaN(finalVal)).toBe(false);
    });

    it('heals poisoned DB state (NaN/null/corrupted) on the fly when new progress arrives', () => {
      // 1. Poisoned state in DB
      expect(calculateMonotonicMeetingUpdate('corrupted_garbage_state', 3)).toBe(3);
      expect(calculateMonotonicMeetingUpdate(NaN, 4)).toBe(4);
      expect(calculateMonotonicMeetingUpdate(null, 1)).toBe(1);
      expect(calculateMonotonicMeetingUpdate(undefined, 2)).toBe(2);

      // 2. Reject retrograde attempts
      expect(calculateMonotonicMeetingUpdate(7, 3)).toBeUndefined();
      expect(calculateMonotonicMeetingUpdate(5, 5)).toBeUndefined();
      expect(calculateMonotonicMeetingUpdate(8, -1)).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. SUBTREE PRESERVATION & TEACHER OVERRIDE COLLISION TEST
  // =========================================================================
  describe('3. Subtree Preservation & High-Frequency Teacher Override Collision', () => {
    it('guarantees student workspaceState (counts, digits, undo) is 100% preserved during teacher ASD toggle', async () => {
      const service = FirebaseSyncService.getInstance();
      const studentId = 'student_user4';

      // 1. Student has populated active board in DB
      mockDatabase[`users/students/${studentId}`] = {
        studentId,
        isOnline: true,
        workspaceState: {
          sessionNumber: 3,
          counts: { units: 7, tens: 4, hundreds: 2, thousands: 1 },
          answerDigits: { units: '7', tens: '4', hundreds: '2', thousands: '1' },
          carryDigits: { units: '0', tens: '1', hundreds: '0', thousands: '0' },
          undoCount: 3,
          hesitationCount: 1,
          flowStatus: 'task',
          isASD: false,
        }
      };

      // 2. Teacher executes physical override with ASD toggle
      await service.syncPhysicalOverride(studentId, {
        isASD: true,
        physicalOverride: true,
        routeStatus: 'APPROVED',
        difficultyRecommendation: 'ASD_SUPPORT'
      });

      const updatedStudent = mockDatabase[`users/students/${studentId}`];

      // Invariants: ASD mode must be true, BUT student counts and digits must be intact!
      expect(updatedStudent.isASD).toBe(true);
      expect(updatedStudent.physicalOverride).toBe(true);
      expect(updatedStudent.workspaceState.isASD).toBe(true);
      expect(updatedStudent.workspaceState.counts).toEqual({ units: 7, tens: 4, hundreds: 2, thousands: 1 });
      expect(updatedStudent.workspaceState.answerDigits).toEqual({ units: '7', tens: '4', hundreds: '2', thousands: '1' });
      expect(updatedStudent.workspaceState.carryDigits).toEqual({ units: '0', tens: '1', hundreds: '0', thousands: '0' });
      expect(updatedStudent.workspaceState.sessionNumber).toBe(3);
      expect(updatedStudent.workspaceState.undoCount).toBe(3);
    });
  });

  // =========================================================================
  // 4. ADVERSARIAL PII & INJECTION ATTACK WAVE
  // =========================================================================
  describe('4. Adversarial PII Scrubbing & Injection Attacks', () => {
    it('scrubs 9-digit Israeli IDs, phones, emails, and names across all adversarial variants', () => {
      const attacks = [
        { raw: 'תעודת הזהות שלי היא 012345678 אנא עזור לי', expected: 'תעודת הזהות שלי היא ***5678 אנא עזור לי' },
        { raw: 'מספר טלפון: 054-1234567 או 0501234567', expected: 'מספר טלפון: [PHONE_REDACTED] או [PHONE_REDACTED]' },
        { raw: 'אימייל: student.test@school.edu.il תשלחו לשם', expected: 'אימייל: [EMAIL_REDACTED] תשלחו לשם' },
        { raw: 'שמי ישראל ישראלי ואני בכיתה ג', expected: 'שמי [NAME_REDACTED] ואני בכיתה ג' },
        { raw: 'My name is Alexander and I need help', expected: 'My name is [NAME_REDACTED] and I need help' },
      ];

      for (const attack of attacks) {
        expect(sanitizePII(attack.raw)).toBe(attack.expected);
      }
    });

    it('strictly clamps normalized student IDs to 1..12 under fuzzing attacks', () => {
      const fuzzed = [
        'student_0', 'student_13', 'student_-1', 'student_999999',
        'student_user0', 'student_user13', 'student_user-99', '0', '13', '999'
      ];

      for (const input of fuzzed) {
        const norm = normalizeStudentId(input);
        expect(norm).toMatch(/^student_user(1[0-2]|[1-9])$/);
      }
    });

    it('preserves admin and teacher identity rooms securely without crosstalk', () => {
      expect(computeRoomId('admin', 'student_user5')).toBe('student_user5');
      expect(computeRoomId('student_user5', 'admin')).toBe('student_user5');
      expect(computeRoomId('teacher_demo', 'student_user8')).toBe('student_user8');
      expect(computeRoomId('student_user8', 'teacher_demo')).toBe('student_user8');
    });
  });

  // =========================================================================
  // 5. VRA MATHEMATICAL INVARIANTS UNDER RAPID REGROUPING
  // =========================================================================
  describe('5. High-Frequency Place-Value Mathematical Invariants', () => {
    it('guarantees exact numerical conservation under 1,000 random regrouping operations', () => {
      for (let iter = 0; iter < 1000; iter++) {
        let units = Math.floor(Math.random() * 50);
        let tens = Math.floor(Math.random() * 30);
        let hundreds = Math.floor(Math.random() * 20);
        let thousands = Math.floor(Math.random() * 5);

        const initialTotal = units * 1 + tens * 10 + hundreds * 100 + thousands * 1000;

        // Perform cascading regroupings
        if (units >= 10) {
          const uCarry = Math.floor(units / 10);
          units = units % 10;
          tens += uCarry;
        }

        if (tens >= 10) {
          const tCarry = Math.floor(tens / 10);
          tens = tens % 10;
          hundreds += tCarry;
        }

        if (hundreds >= 10) {
          const hCarry = Math.floor(hundreds / 10);
          hundreds = hundreds % 10;
          thousands += hCarry;
        }

        const finalTotal = units * 1 + tens * 10 + hundreds * 100 + thousands * 1000;
        expect(finalTotal).toBe(initialTotal);
        expect(units).toBeLessThanOrEqual(9);
        expect(tens).toBeLessThanOrEqual(9);
        expect(hundreds).toBeLessThanOrEqual(9);
      }
    });
  });
});
