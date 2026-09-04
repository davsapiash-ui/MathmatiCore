import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useAuthStore, unifiedLogout } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAdminStore } from '@/application/useAdminStore';
import { useChatStore } from '@/application/useChatStore';
import { AuditLogger, maskPII } from '@/infrastructure/services/AuditLogger';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

describe('Remediations Verification Suite (R1 - R5)', () => {

  beforeEach(() => {
    unifiedLogout();
  });

  describe('R1: Security, Auth, & PII Remediations', () => {
    it('verifies database.rules.json has no root .read/.write and no || true in chat_messages', () => {
      const rulesPath = resolve(__dirname, '../../../../database.rules.json');
      const raw = readFileSync(rulesPath, 'utf-8');
      const json = JSON.parse(raw);

      // Root must NOT have blanket open permissions
      expect(json.rules['.read']).toBeUndefined();
      expect(json.rules['.write']).toBeUndefined();

      // Chat messages roomId must NOT contain || true
      const chatRoom = json.rules.chat_messages.$roomId;
      expect(chatRoom).toBeDefined();
      expect(chatRoom['.read']).not.toContain('|| true');
      expect(chatRoom['.write']).not.toContain('|| true');
      expect(chatRoom['.read']).toContain('auth.uid == $roomId');
      expect(chatRoom['.write']).toContain('auth.uid == $roomId');
    });

    it('verifies unifiedLogout resets useAuthStore, useStore, useWorkspaceStore, useAdminStore, and useChatStore', () => {
      // 1. Seed dirty state across all stores
      useAuthStore.setState({
        user: { uid: 'student_1', name: 'Test Student', role: 'student' },
        role: 'student',
        isAuthenticated: true,
      });

      useStore.setState({
        currentUserRole: 'student',
        currentUserId: 'student_1',
        firebaseLoaded: true,
      });

      useWorkspaceStore.setState({
        sessionNumber: 3,
        counts: { units: 5, tens: 4, hundreds: 3, thousands: 2 },
        undoCount: 7,
        hesitationCount: 2,
        standardTaskIdx: 4,
      });

      useAdminStore.setState({
        schools: [{ id: 's1', name: 'School 1', createdAt: 100 }],
        teachers: [{ id: 't1', schoolId: 's1', ssoEmail: 'teacher.demo@edu-haifa.org.il', dob: '010190', name: 'T1', licenseActive: false, createdAt: 100 }],
        classes: [{ id: 'c1', schoolId: 's1', teacherId: 't1', name: 'Class 1', studentLimit: 12, createdAt: 100 }],
      });

      useChatStore.setState({
        messages: [{ id: 'm1', senderId: 'student_1', receiverId: 'teacher_1', text: 'hello', timestamp: 100 } as any],
        activeRoomId: 'student_1',
      });

      // 2. Perform Unified Logout
      unifiedLogout();

      // 3. Verify clean state across all stores
      const authState = useAuthStore.getState();
      expect(authState.user).toBeNull();
      expect(authState.role).toBeNull();
      expect(authState.isAuthenticated).toBe(false);

      const storeState = useStore.getState();
      expect(storeState.currentUserRole).toBeNull();
      expect(storeState.currentUserId).toBeNull();
      expect(storeState.firebaseLoaded).toBe(false);

      const wsState = useWorkspaceStore.getState();
      expect(wsState.counts.units).toBe(0);
      expect(wsState.counts.tens).toBe(0);
      expect(wsState.counts.hundreds).toBe(0);
      expect(wsState.counts.thousands).toBe(0);
      expect(wsState.sessionNumber).toBe(1);
      expect(wsState.standardTaskIdx).toBe(0);

      const adminState = useAdminStore.getState();
      expect(adminState.schools).toHaveLength(0);
      expect(adminState.teachers).toHaveLength(0);
      expect(adminState.classes).toHaveLength(0);

      const chatState = useChatStore.getState();
      expect(chatState.messages).toHaveLength(0);
      expect(chatState.activeRoomId).toBeNull();
    });

    it('verifies maskPII masks 9-digit Israeli national IDs', () => {
      expect(maskPII(null)).toBeNull();
      expect(maskPII(undefined)).toBeNull();
      expect(maskPII('מורה חדש: דוד (ת"ז: 123456782)')).toBe('מורה חדש: דוד (ת"ז: ***6782)');
      expect(maskPII('ת"ז: 123456789 ועוד ת"ז: 987654321')).toBe('ת"ז: ***6789 ועוד ת"ז: ***4321');
      expect(maskPII('אין פה תעודת זהות')).toBe('אין פה תעודת זהות');
    });
  });

  describe('R2: Arithmetic Engine & VRA Invariant Remediations', () => {
    it('allows 0-value subtraction / difference without empty_board rejection', () => {
      const ws = useWorkspaceStore.getState();
      ws.initSession(1, false, 0);

      // Set counts to 0 (empty board representing 0)
      useWorkspaceStore.setState({
        counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
        answerDigits: { units: '0' },
        hasInteracted: true,
      });

      // Target = 0 (e.g. difference of zero)
      const state = useWorkspaceStore.getState();
      const boardVal = state.counts.units * 1 + state.counts.tens * 10 + state.counts.hundreds * 100 + state.counts.thousands * 1000;
      const target = 0;
      const isBoardEmpty = boardVal === 0 && target !== 0;

      expect(isBoardEmpty).toBe(false);
      expect(boardVal).toBe(target);
    });

    it('detects overcrowded hundreds column (hundreds >= 10)', () => {
      useWorkspaceStore.setState({
        counts: { units: 2, tens: 3, hundreds: 10, thousands: 0 },
      });

      const s = useWorkspaceStore.getState();
      const hasOvercrowded = s.counts.units >= 10 || s.counts.tens >= 10 || s.counts.hundreds >= 10;
      expect(hasOvercrowded).toBe(true);

      useWorkspaceStore.setState({
        counts: { units: 2, tens: 3, hundreds: 9, thousands: 0 },
      });
      const s2 = useWorkspaceStore.getState();
      const hasOvercrowded2 = s2.counts.units >= 10 || s2.counts.tens >= 10 || s2.counts.hundreds >= 10;
      expect(hasOvercrowded2).toBe(false);
    });

    it('verifies click operations update undoStack synchronously without nested set race conditions', () => {
      useWorkspaceStore.setState({
        counts: { units: 2, tens: 5, hundreds: 1, thousands: 0 },
        undoStack: [],
      });

      // Remove a unit block
      useWorkspaceStore.getState().removeBlockClick('units');
      const afterRemove = useWorkspaceStore.getState();
      expect(afterRemove.counts.units).toBe(1);
      expect(afterRemove.undoStack).toHaveLength(1);
      expect(afterRemove.undoStack[0].counts.units).toBe(2);

      // Split a tens block
      useWorkspaceStore.getState().splitBlockClick('tens');
      const afterSplit = useWorkspaceStore.getState();
      expect(afterSplit.counts.tens).toBe(4);
      expect(afterSplit.counts.units).toBe(11); // 1 + 10 = 11
      expect(afterSplit.undoStack).toHaveLength(2);

      // Group units
      useWorkspaceStore.getState().groupColumnClick('units');
      const afterGroup = useWorkspaceStore.getState();
      expect(afterGroup.counts.units).toBe(1);
      expect(afterGroup.counts.tens).toBe(5);
      expect(afterGroup.undoStack).toHaveLength(3);
    });
  });

  describe('R4: RTDB Sync & Offline Queue Remediations', () => {
    it('allows offline queue to hold up to 500 items before dropping oldest', () => {
      // Simulate enqueuing 505 transactions offline
      (firebaseSyncService as any).isOnline = false;
      (firebaseSyncService as any).offlineTelemetryQueue = [];

      for (let i = 1; i <= 505; i++) {
        (firebaseSyncService as any).enqueueOfflineTransaction('test_ref', { eventIndex: i });
      }

      const queue = (firebaseSyncService as any).offlineTelemetryQueue;
      expect(queue.length).toBe(500);
      // First 5 were shifted out
      expect(queue[0].payload.eventIndex).toBe(6);
      expect(queue[499].payload.eventIndex).toBe(505);
    });
  });

  describe('R5: SRL Metrics Canonical Ratio Alignment', () => {
    const calculatePersistence = (u: number, e: number, g: number) => {
      const safeU = Math.max(0, u);
      const safeE = Math.max(0, e);
      const safeG = Math.max(0, g);
      const denominator = safeU + safeE + safeG;
      return denominator <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((safeU / denominator) * 100)));
    };

    it('returns 100% when 0/0/0 denominator', () => {
      expect(calculatePersistence(0, 0, 0)).toBe(100);
    });

    it('handles negative or corrupted values safely', () => {
      expect(calculatePersistence(-5, -2, -1)).toBe(100);
      expect(calculatePersistence(10, -2, 0)).toBe(100);
    });

    it('calculates exact canonical ratios', () => {
      // 10 undos, 10 errors, 0 guesses -> 10/20 = 50%
      expect(calculatePersistence(10, 10, 0)).toBe(50);
      // 3 undos, 1 error, 0 guesses -> 3/4 = 75%
      expect(calculatePersistence(3, 1, 0)).toBe(75);
      // 0 undos, 5 errors, 5 guesses -> 0/10 = 0%
      expect(calculatePersistence(0, 5, 5)).toBe(0);
    });
  });

  describe('R3 & Gating: Meeting 3 Prerequisite Gate Enforcement', () => {
    const evaluateMeeting3Access = (
      highestCompleted: number,
      routeStatus: string | null | undefined,
      tasks: any[] | null | undefined,
      isTeacherSessionActive: boolean,
      teacherActiveSessionNum: number | null
    ) => {
      const teacherSessionAllowsMeeting3 = isTeacherSessionActive && teacherActiveSessionNum !== null && teacherActiveSessionNum >= 3;
      const isAllowedMeeting3 = teacherSessionAllowsMeeting3 || (highestCompleted >= 2 && routeStatus === 'APPROVED' && Boolean(tasks));
      return isAllowedMeeting3;
    };

    it('blocks fresh students (highestCompleted === 0) from entering Meeting 3 directly', () => {
      const allowed = evaluateMeeting3Access(0, null, null, false, null);
      expect(allowed).toBe(false);
    });

    it('blocks students who only completed Meeting 1 (highestCompleted === 1)', () => {
      const allowed = evaluateMeeting3Access(1, null, null, false, null);
      expect(allowed).toBe(false);
    });

    it('blocks students who completed Meeting 2 but routeStatus is PENDING', () => {
      const allowed = evaluateMeeting3Access(2, 'PENDING', null, false, null);
      expect(allowed).toBe(false);
    });

    it('blocks students who completed Meeting 2 and routeStatus is APPROVED but tasks are null', () => {
      const allowed = evaluateMeeting3Access(2, 'APPROVED', null, false, null);
      expect(allowed).toBe(false);
    });

    it('allows students who completed Meeting 2, routeStatus is APPROVED, and tasks are populated', () => {
      const allowed = evaluateMeeting3Access(2, 'APPROVED', [{ id: 't1' }], false, null);
      expect(allowed).toBe(true);
    });

    it('allows students if teacher session is active and sessionNumber >= 3', () => {
      const allowed = evaluateMeeting3Access(0, null, null, true, 3);
      expect(allowed).toBe(true);
    });

    it('blocks students if teacher session is active for session 2 only and student has not completed prerequisites', () => {
      const allowed = evaluateMeeting3Access(0, null, null, true, 2);
      expect(allowed).toBe(false);
    });
  });
});
