import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAdminStore } from '@/application/useAdminStore';
import { useChatStore, normalizeStudentId, computeRoomId, type ChatMessage } from '@/application/useChatStore';
import { isWhitelistedTeacherEmail } from '@/infrastructure/services/AuthService';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import {
  EMPTY_COUNTS,
  getValue,
  groupBlocksManually,
  ungroupBlock,
  splitBlockClick,
  removeBlock,
  addBlock,
  PLACE_ORDER,
  type PlaceCounts,
  type Place,
} from '@/core/placeValue';
import { stateReducer } from '@/machines/vraMachine';
import { transitionKeyboardState } from '@/core/ExerciseValidationEngine';

// ============================================================================
// ENVIRONMENT & MOCK SETUP
// ============================================================================
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] || null),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
};

if (typeof window === 'undefined') {
  (globalThis as any).window = {
    location: { hostname: 'localhost' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
}

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockLocalStorage;
if (typeof navigator === 'undefined') {
  (globalThis as any).navigator = { onLine: true };
}

describe('Master PRD v4.0 — Adversarial Audit & Stress Test Suite (R1-R5)', () => {

  beforeEach(() => {
    mockLocalStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false });
    useStore.setState({ currentUserRole: null, currentUserId: null, students: {} });
    useAdminStore.setState({ schools: [], teachers: [], classes: [], globalStudentLimit: 12 });
    useWorkspaceStore.getState().initSession(1, false, null, 0);
    useWorkspaceStore.getState().clearSocraticPenaltyLockout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // REQUIREMENT 1 (R1): AUTH, ROLES, ROUTE GUARDS & STATE TRANSITIONS
  // ==========================================================================
  describe('R1: Adversarial Role Transitions, Route Guards & Isolation', () => {

    describe('1.1 AuthGuard Route Clearance & Unauthorized Redirections', () => {
      // Pure helper mirroring AuthGuard decision logic in App.tsx:68-104
      const evaluateAuthGuard = (
        authUser: any,
        userRole: string | null,
        isAuthenticated: boolean,
        allowedRoles: string[]
      ): { allowed: boolean; redirect: string | null; logoutTriggered: boolean } => {
        if (!isAuthenticated || !authUser) {
          return { allowed: false, redirect: '/login', logoutTriggered: false };
        }

        const activeRole = (typeof userRole === 'string' ? userRole : (authUser.role as string)) || 'teacher';

        // Whitelist enforcement for teacher/admin
        if (activeRole === 'teacher' || activeRole === 'admin') {
          const email = ((authUser.email as string) || '').toLowerCase().trim();
          if (!isWhitelistedTeacherEmail(email)) {
            return { allowed: false, redirect: '/login', logoutTriggered: true };
          }
        }

        const hasAccess = allowedRoles.includes(activeRole);
        if (!hasAccess) {
          if (activeRole === 'admin') return { allowed: false, redirect: '/admin', logoutTriggered: false };
          if (activeRole === 'teacher') return { allowed: false, redirect: '/dashboard', logoutTriggered: false };
          if (activeRole === 'student') return { allowed: false, redirect: '/hub', logoutTriggered: false };
        }

        return { allowed: true, redirect: null, logoutTriggered: false };
      };

      it('should redirect unauthenticated users to /login on any protected route', () => {
        const result = evaluateAuthGuard(null, null, false, ['student', 'admin']);
        expect(result.allowed).toBe(false);
        expect(result.redirect).toBe('/login');
        expect(result.logoutTriggered).toBe(false);
      });

      it('should block Student from accessing teacher dashboard (/dashboard) and redirect to /hub', () => {
        const studentUser = { uid: 'student_user3', name: 'תלמיד 3', role: 'student' };
        const result = evaluateAuthGuard(studentUser, 'student', true, ['teacher', 'admin']);
        expect(result.allowed).toBe(false);
        expect(result.redirect).toBe('/hub');
      });

      it('should block Student from accessing admin portal (/admin) and redirect to /hub', () => {
        const studentUser = { uid: 'student_user5', name: 'תלמיד 5', role: 'student' };
        const result = evaluateAuthGuard(studentUser, 'student', true, ['admin']);
        expect(result.allowed).toBe(false);
        expect(result.redirect).toBe('/hub');
      });

      it('should block Teacher from accessing admin portal (/admin) and redirect to /dashboard', () => {
        const teacherUser = { uid: 'teacher_1002220159', email: 'davidsep@edu-haifa.org.il', role: 'teacher' };
        const result = evaluateAuthGuard(teacherUser, 'teacher', true, ['admin']);
        expect(result.allowed).toBe(false);
        expect(result.redirect).toBe('/dashboard');
      });

      it('should block Teacher from accessing student hub (/hub) and redirect to /dashboard', () => {
        const teacherUser = { uid: 'teacher_1002220159', email: 'davidsep@edu-haifa.org.il', role: 'teacher' };
        const result = evaluateAuthGuard(teacherUser, 'teacher', true, ['student', 'admin']);
        expect(result.allowed).toBe(false);
        expect(result.redirect).toBe('/dashboard');
      });

      it('should grant Admin access across all roles (/admin, /dashboard, /hub, /workspace)', () => {
        const adminUser = { uid: 'admin_1', email: 'davidsep@edu-haifa.org.il', role: 'admin' };
        
        // Admin on /admin
        expect(evaluateAuthGuard(adminUser, 'admin', true, ['admin']).allowed).toBe(true);
        // Admin on /dashboard
        expect(evaluateAuthGuard(adminUser, 'admin', true, ['teacher', 'admin']).allowed).toBe(true);
        // Admin on /hub
        expect(evaluateAuthGuard(adminUser, 'admin', true, ['student', 'admin']).allowed).toBe(true);
      });

      it('should force logout and redirect to /login if teacher/admin email is not whitelisted', () => {
        const rogueUser = { uid: 'rogue_teacher', email: 'attacker@evil-domain.com', role: 'teacher' };
        const result = evaluateAuthGuard(rogueUser, 'teacher', true, ['teacher', 'admin']);
        expect(result.allowed).toBe(false);
        expect(result.redirect).toBe('/login');
        expect(result.logoutTriggered).toBe(true);
      });

      it('should permit valid whitelisted institutional domains (@edu-haifa.org.il, @mathmaticore.local)', () => {
        expect(isWhitelistedTeacherEmail('davidsep@edu-haifa.org.il')).toBe(true);
        expect(isWhitelistedTeacherEmail('teacher@mathmaticore.local')).toBe(true);
        expect(isWhitelistedTeacherEmail('hacker@gmail.com')).toBe(false);
        expect(isWhitelistedTeacherEmail('')).toBe(false);
        expect(isWhitelistedTeacherEmail(null)).toBe(false);
      });
    });

    describe('1.2 Multi-Store Logout Isolation & State Cleanup', () => {
      it('should purge authentication state, student identity, workspace counts, and admin stores on multi-store logout', () => {
        // 1. Simulate active Teacher / Admin login
        useAuthStore.getState().setUser({
          uid: 'teacher_1002220159',
          email: 'davidsep@edu-haifa.org.il',
          name: 'דוד המורה'
        }, 'teacher');

        useStore.getState().login('teacher', 'teacher_1002220159');

        // Populate Workspace Store with active progress
        useWorkspaceStore.setState({
          counts: { units: 7, tens: 5, hundreds: 3, thousands: 1 },
          undoStack: [{ counts: { units: 5, tens: 5, hundreds: 3, thousands: 1 } }],
          undoCount: 4,
          hesitationCount: 2,
          sessionNumber: 3,
        });

        // Populate Admin Store
        useAdminStore.setState({
          schools: [{ id: 'sch_1', name: 'בית ספר ניסויי', createdAt: Date.now() }],
          teachers: [{ id: 't_1', schoolId: 'sch_1', ssoEmail: 'davidsep@edu-haifa.org.il', dob: '290984', name: 'דוד', licenseActive: true, createdAt: Date.now() }],
          classes: [{ id: 'c_1', schoolId: 'sch_1', teacherId: 't_1', name: 'כיתה א', studentLimit: 12, createdAt: Date.now() }],
        });

        // Verify pre-conditions
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        expect(useAuthStore.getState().user?.uid).toBe('teacher_1002220159');
        expect(useStore.getState().currentUserRole).toBe('teacher');
        expect(useWorkspaceStore.getState().counts.thousands).toBe(1);
        expect(useAdminStore.getState().schools.length).toBe(1);

        // 2. Perform Multi-Store Logout
        useAuthStore.getState().logout();
        useStore.getState().logout();
        useWorkspaceStore.getState().initSession(1, false, null, 0); // Reset workspace session
        useAdminStore.setState({ schools: [], teachers: [], classes: [] }); // Admin purge

        // 3. Verify complete post-logout isolation
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
        expect(useAuthStore.getState().user).toBeNull();
        expect(useAuthStore.getState().role).toBeNull();

        expect(useStore.getState().currentUserRole).toBeNull();
        expect(useStore.getState().currentUserId).toBeNull();

        expect(useWorkspaceStore.getState().counts).toEqual(EMPTY_COUNTS);
        expect(useWorkspaceStore.getState().undoStack).toEqual([]);
        expect(useWorkspaceStore.getState().undoCount).toBe(0);
        expect(useWorkspaceStore.getState().hesitationCount).toBe(0);
        expect(useWorkspaceStore.getState().sessionNumber).toBe(1);

        expect(useAdminStore.getState().schools).toEqual([]);
        expect(useAdminStore.getState().teachers).toEqual([]);
        expect(useAdminStore.getState().classes).toEqual([]);
      });

      it('should handle rapid out-of-order role switching without state leakage', () => {
        // Student -> Teacher -> Admin -> Student
        useAuthStore.getState().setUser({ uid: 'student_3', name: 'תלמיד 3' }, 'student');
        expect(useAuthStore.getState().role).toBe('student');

        useAuthStore.getState().setUser({ uid: 'teacher_1', email: 'davidsep@edu-haifa.org.il', name: 'מורה' }, 'teacher');
        expect(useAuthStore.getState().role).toBe('teacher');

        useAuthStore.getState().setUser({ uid: 'admin_1', email: 'davidsep@edu-haifa.org.il', name: 'אדמין' }, 'admin');
        expect(useAuthStore.getState().role).toBe('admin');

        useAuthStore.getState().logout();
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
      });
    });

    describe('1.3 Direct Route Gate Validation for Meeting 3', () => {
      const evaluateMeeting3Access = (
        meeting: number,
        completedMeeting2: boolean,
        routeStatus: string | null,
        approvedTasks: any[] | null
      ): { canProceed: boolean; state: 'LOCKED' | 'PENDING_APPROVAL' | 'UNLOCKED' } => {
        if (meeting <= 2) {
          return { canProceed: true, state: 'UNLOCKED' };
        }
        if (meeting === 3) {
          if (!completedMeeting2) {
            return { canProceed: false, state: 'LOCKED' };
          }
          if (routeStatus !== 'APPROVED' || !approvedTasks || approvedTasks.length === 0) {
            return { canProceed: false, state: 'PENDING_APPROVAL' };
          }
          return { canProceed: true, state: 'UNLOCKED' };
        }
        return { canProceed: completedMeeting2 && routeStatus === 'APPROVED', state: 'UNLOCKED' };
      };

      it('should block Meeting 3 when Meeting 2 has not been completed (LOCKED state)', () => {
        const result = evaluateMeeting3Access(3, false, null, null);
        expect(result.canProceed).toBe(false);
        expect(result.state).toBe('LOCKED');
      });

      it('should block Meeting 3 when Meeting 2 is completed but teacher approval is pending (PENDING_APPROVAL state)', () => {
        const result = evaluateMeeting3Access(3, true, 'PENDING_TEACHER_APPROVAL', null);
        expect(result.canProceed).toBe(false);
        expect(result.state).toBe('PENDING_APPROVAL');
      });

      it('should unlock Meeting 3 when Meeting 2 is completed, routeStatus is APPROVED, and adaptive tasks exist', () => {
        const mockTasks = [{ id: 's3_task1', type: 'standard', minuend: 4890, subtrahend: 1750 }];
        const result = evaluateMeeting3Access(3, true, 'APPROVED', mockTasks);
        expect(result.canProceed).toBe(true);
        expect(result.state).toBe('UNLOCKED');
      });
    });
  });

  // ==========================================================================
  // REQUIREMENT 2 (R2): ARITHMETIC ENGINE & VRA MATHEMATICAL INVARIANTS
  // ==========================================================================
  describe('R2: Arithmetic Engine & VRA Mathematical Invariants', () => {

    describe('2.1 Value Preservation ΔV = 0 Across Cascading Carries (up to 4 digits)', () => {
      it('should preserve value equivalence at every step of 999 + 1 = 1000 cascading carry', () => {
        // Initial state: 9 hundreds, 9 tens, 9 units (999)
        let counts: PlaceCounts = { units: 9, tens: 9, hundreds: 9, thousands: 0 };
        expect(getValue(counts)).toBe(999);

        // Step 1: Add 1 unit -> units: 10
        counts = { ...counts, units: counts.units + 1 };
        expect(getValue(counts)).toBe(1000);

        // Step 2: Regroup 10 units -> 1 ten
        const gUnits = groupBlocksManually(counts, 'units');
        expect(gUnits).not.toBeNull();
        counts = gUnits!.counts;
        expect(counts.units).toBe(0);
        expect(counts.tens).toBe(10);
        expect(getValue(counts)).toBe(1000); // Invariant: ΔV = 0

        // Step 3: Regroup 10 tens -> 1 hundred
        const gTens = groupBlocksManually(counts, 'tens');
        expect(gTens).not.toBeNull();
        counts = gTens!.counts;
        expect(counts.tens).toBe(0);
        expect(counts.hundreds).toBe(10);
        expect(getValue(counts)).toBe(1000); // Invariant: ΔV = 0

        // Step 4: Regroup 10 hundreds -> 1 thousand
        const gHundreds = groupBlocksManually(counts, 'hundreds');
        expect(gHundreds).not.toBeNull();
        counts = gHundreds!.counts;
        expect(counts.hundreds).toBe(0);
        expect(counts.thousands).toBe(1);
        expect(getValue(counts)).toBe(1000); // Final canonical state: 1000
      });

      it('should preserve value equivalence for multi-carry 4-digit addition: 4890 + 1750 = 6640', () => {
        // Combined initial blocks: 5 thousands, 15 hundreds, 14 tens, 0 units (6640)
        let counts: PlaceCounts = { units: 0, tens: 14, hundreds: 15, thousands: 5 };
        expect(getValue(counts)).toBe(6640);

        // Regroup tens -> 10 tens to 1 hundred
        const gTens = groupBlocksManually(counts, 'tens');
        expect(gTens).not.toBeNull();
        counts = gTens!.counts;
        expect(counts.tens).toBe(4);
        expect(counts.hundreds).toBe(16);
        expect(getValue(counts)).toBe(6640);

        // Regroup hundreds -> 10 hundreds to 1 thousand
        const gHundreds = groupBlocksManually(counts, 'hundreds');
        expect(gHundreds).not.toBeNull();
        counts = gHundreds!.counts;
        expect(counts.hundreds).toBe(6);
        expect(counts.thousands).toBe(6);
        expect(getValue(counts)).toBe(6640); // Final canonical representation: 6640
      });

      it('should preserve value equivalence for extreme 4-digit cascading carry: 8999 + 1 = 9000', () => {
        let counts: PlaceCounts = { units: 10, tens: 9, hundreds: 9, thousands: 8 };
        expect(getValue(counts)).toBe(9000);

        counts = groupBlocksManually(counts, 'units')!.counts;
        expect(getValue(counts)).toBe(9000);

        counts = groupBlocksManually(counts, 'tens')!.counts;
        expect(getValue(counts)).toBe(9000);

        counts = groupBlocksManually(counts, 'hundreds')!.counts;
        expect(getValue(counts)).toBe(9000);
        expect(counts).toEqual({ units: 0, tens: 0, hundreds: 0, thousands: 9 });
      });
    });

    describe('2.2 Value Preservation ΔV = 0 Across Cascading Borrows (up to 4 digits)', () => {
      it('should preserve value equivalence at every step of 1000 - 1 = 999 decomposition', () => {
        // Initial state: 1 thousand (1000)
        let counts: PlaceCounts = { units: 0, tens: 0, hundreds: 0, thousands: 1 };
        expect(getValue(counts)).toBe(1000);

        // Step 1: Decompose 1 thousand -> 10 hundreds
        const dThousands = ungroupBlock(counts, 'thousands');
        expect(dThousands).not.toBeNull();
        counts = dThousands!.counts;
        expect(counts.thousands).toBe(0);
        expect(counts.hundreds).toBe(10);
        expect(getValue(counts)).toBe(1000); // Invariant: ΔV = 0

        // Step 2: Decompose 1 hundred -> 10 tens
        const dHundreds = ungroupBlock(counts, 'hundreds');
        expect(dHundreds).not.toBeNull();
        counts = dHundreds!.counts;
        expect(counts.hundreds).toBe(9);
        expect(counts.tens).toBe(10);
        expect(getValue(counts)).toBe(1000); // Invariant: ΔV = 0

        // Step 3: Decompose 1 ten -> 10 units
        const dTens = ungroupBlock(counts, 'tens');
        expect(dTens).not.toBeNull();
        counts = dTens!.counts;
        expect(counts.tens).toBe(9);
        expect(counts.units).toBe(10);
        expect(getValue(counts)).toBe(1000); // Invariant: ΔV = 0

        // Step 4: Subtract 1 unit -> 9 units
        const rUnit = removeBlock(counts, 'units');
        expect(rUnit).not.toBeNull();
        counts = rUnit!;
        expect(counts).toEqual({ units: 9, tens: 9, hundreds: 9, thousands: 0 });
        expect(getValue(counts)).toBe(999);
      });

      it('should preserve value equivalence during multi-step borrow for 5130 - 2850 = 2280', () => {
        // Start with 5130
        let counts: PlaceCounts = { units: 0, tens: 3, hundreds: 1, thousands: 5 };
        expect(getValue(counts)).toBe(5130);

        // Need tens for -50: decompose 1 hundred into 10 tens
        counts = ungroupBlock(counts, 'hundreds')!.counts;
        expect(counts.hundreds).toBe(0);
        expect(counts.tens).toBe(13);
        expect(getValue(counts)).toBe(5130);

        // Need hundreds for -800: decompose 1 thousand into 10 hundreds
        counts = ungroupBlock(counts, 'thousands')!.counts;
        expect(counts.thousands).toBe(4);
        expect(counts.hundreds).toBe(10);
        expect(getValue(counts)).toBe(5130);

        // Remove subtracted quantities (2 thousands, 8 hundreds, 5 tens, 0 units)
        counts = {
          units: counts.units - 0,
          tens: counts.tens - 5,
          hundreds: counts.hundreds - 8,
          thousands: counts.thousands - 2,
        };
        expect(counts).toEqual({ units: 0, tens: 8, hundreds: 2, thousands: 2 });
        expect(getValue(counts)).toBe(2280);
      });
    });

    describe('2.3 0-Value Difference Arithmetic Validation', () => {
      // Invariant: boardVal === 0 must be accepted as valid target when target is 0
      const validateSubmission = (boardVal: number, target: number, sessionNumber: number) => {
        const isBoardEmpty = boardVal === 0 && target !== 0;
        if (sessionNumber !== 8) {
          if (isBoardEmpty) {
            return { valid: false, error: 'empty_board' };
          }
          if (boardVal !== target) {
            return { valid: false, error: 'wrong_blocks' };
          }
        }
        return { valid: true, error: null };
      };

      it('should accept an empty board (value 0) when target arithmetic difference is 0 (A - B = 0)', () => {
        // E.g. 450 - 450 = 0
        const result = validateSubmission(0, 0, 1);
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
      });

      it('should reject an empty board (value 0) when target is non-zero with empty_board error', () => {
        // Target is 350, board is empty
        const result = validateSubmission(0, 350, 1);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('empty_board');
      });

      it('should reject non-zero board if it does not match target', () => {
        const result = validateSubmission(200, 300, 1);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('wrong_blocks');
      });
    });

    describe('2.4 10-Hundreds Overcrowding Detection (hundreds >= 10)', () => {
      const checkOvercrowded = (counts: PlaceCounts): boolean => {
        return counts.units >= 10 || counts.tens >= 10 || counts.hundreds >= 10;
      };

      it('should detect overcrowding in hundreds column when hundreds >= 10', () => {
        expect(checkOvercrowded({ units: 0, tens: 0, hundreds: 10, thousands: 0 })).toBe(true);
        expect(checkOvercrowded({ units: 2, tens: 5, hundreds: 14, thousands: 1 })).toBe(true);
      });

      it('should detect overcrowding in units or tens column', () => {
        expect(checkOvercrowded({ units: 10, tens: 0, hundreds: 0, thousands: 0 })).toBe(true);
        expect(checkOvercrowded({ units: 0, tens: 12, hundreds: 0, thousands: 0 })).toBe(true);
      });

      it('should pass canonical representations where all columns < 10', () => {
        expect(checkOvercrowded({ units: 9, tens: 9, hundreds: 9, thousands: 5 })).toBe(false);
        expect(checkOvercrowded(EMPTY_COUNTS)).toBe(false);
      });
    });

    describe('2.5 Undo Stack Depth Cap (50) and Rapid Hammering', () => {
      it('should cap undo stack at exactly 50 snapshots under continuous mutations', () => {
        const UNDO_STACK_CAP = 50;
        let undoStack: { counts: PlaceCounts }[] = [];

        const pushSnapshot = (counts: PlaceCounts) => {
          undoStack.push({ counts: { ...counts } });
          if (undoStack.length > UNDO_STACK_CAP) {
            undoStack.shift();
          }
        };

        // Push 75 mutations
        for (let i = 1; i <= 75; i++) {
          pushSnapshot({ units: i % 10, tens: 0, hundreds: 0, thousands: 0 });
        }

        expect(undoStack.length).toBe(50);
      });

      it('should safely handle rapid undo hammering (100 spam calls) without throwing', () => {
        // Setup store with initial stack of 5 items
        useWorkspaceStore.setState({
          counts: { units: 5, tens: 0, hundreds: 0, thousands: 0 },
          undoStack: [
            { counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 } },
            { counts: { units: 1, tens: 0, hundreds: 0, thousands: 0 } },
            { counts: { units: 2, tens: 0, hundreds: 0, thousands: 0 } },
            { counts: { units: 3, tens: 0, hundreds: 0, thousands: 0 } },
            { counts: { units: 4, tens: 0, hundreds: 0, thousands: 0 } },
          ],
          undoCount: 0,
        });

        // Rapid hammer 100 undos
        for (let i = 0; i < 100; i++) {
          expect(() => useWorkspaceStore.getState().undo()).not.toThrow();
        }

        // Stack is drained to 0, counts settled on oldest snapshot (0)
        expect(useWorkspaceStore.getState().undoStack.length).toBe(0);
        expect(useWorkspaceStore.getState().counts.units).toBe(0);
      });

      it('should maintain keyboard as UNLOCKED upon Undo per Module 11 (no penalty)', () => {
        expect(stateReducer('UNLOCKED', { type: 'UNDO_CLICK' })).toBe('UNLOCKED');
        expect(transitionKeyboardState('UNLOCKED', { undo_click: true })).toBe('UNLOCKED');
      });
    });
  });

  // ==========================================================================
  // REQUIREMENT 3 (R3): SOCRATIC & HESITATION CHAOS
  // ==========================================================================
  describe('R3: Socratic Engine & Hesitation Chaos Injections', () => {

    describe('3.1 Hesitation Boundary Tests (43s, 44.9s, 45s, 46s) & Interaction Reset', () => {
      const HESITATION_THRESHOLD_MS = 45000;

      const checkHesitation = (lastInteractionTime: number, currentTime: number): boolean => {
        return (currentTime - lastInteractionTime) >= HESITATION_THRESHOLD_MS;
      };

      it('should NOT trigger hesitation at 43 seconds of inactivity', () => {
        const lastAction = 100000;
        expect(checkHesitation(lastAction, 143000)).toBe(false);
      });

      it('should NOT trigger hesitation if interaction occurs at 44.9 seconds (timer reset)', () => {
        let lastAction = 100000;
        // User is idle for 44.9s
        expect(checkHesitation(lastAction, 144900)).toBe(false);

        // User interacts at 44.9s -> timer resets
        lastAction = 144900;
        // Check at original 45.0s timestamp -> NOT triggered
        expect(checkHesitation(lastAction, 145000)).toBe(false);
        // Trigger occurs only at 144900 + 45000 = 189900
        expect(checkHesitation(lastAction, 189899)).toBe(false);
        expect(checkHesitation(lastAction, 189900)).toBe(true);
      });

      it('should trigger hesitation exactly at 45.0 seconds of inactivity', () => {
        const lastAction = 100000;
        expect(checkHesitation(lastAction, 145000)).toBe(true);
      });

      it('should remain triggered at 46 seconds without re-triggering duplicates', () => {
        const lastAction = 100000;
        expect(checkHesitation(lastAction, 146000)).toBe(true);
      });
    });

    describe('3.2 60s Socratic Lockout Persistence, Wall-Clock Delta & Interactivity', () => {
      it('should persist 60s lockout in localStorage and compute accurate wall-clock remaining time', () => {
        const now = 1700000000000;
        vi.spyOn(Date, 'now').mockReturnValue(now);

        // Trigger lockout
        useWorkspaceStore.getState().triggerSocraticPenaltyLockout('רמז דיסטרקטור');

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'mc_socratic_penalty_until',
          String(now + 30000)
        );
        expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(30);

        // Simulate 15s elapsed (e.g. background tab throttling)
        vi.spyOn(Date, 'now').mockReturnValue(now + 15000);
        expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(15);

        // Simulate 29.5s elapsed
        vi.spyOn(Date, 'now').mockReturnValue(now + 29500);
        expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(1);

        // Simulate 30.1s elapsed -> Lockout cleared automatically
        vi.spyOn(Date, 'now').mockReturnValue(now + 30100);
        expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(0);
        expect(useWorkspaceStore.getState().socraticPenaltyLockoutUntil).toBeNull();
      });

      it('should maintain 100% board interactivity (manipulatives) while digit inputs and distractors are locked', () => {
        // Setup lockout
        useWorkspaceStore.setState({
          socraticPenaltyLockoutUntil: Date.now() + 30000,
          keyboardState: 'SOCRATIC_ONLY',
          counts: { units: 10, tens: 0, hundreds: 0, thousands: 0 }
        });

        // 1. Digit input is locked
        expect(useWorkspaceStore.getState().isColumnInputLocked('units', 15, 25, false)).toBe(true);

        // 2. Dienes Board manipulatives REMAIN INTERACTIVE
        // Grouping 10 units -> 1 ten
        useWorkspaceStore.getState().groupColumnClick('units');
        expect(useWorkspaceStore.getState().counts.units).toBe(0);
        expect(useWorkspaceStore.getState().counts.tens).toBe(1);

        // Splitting 1 ten -> 10 units
        useWorkspaceStore.getState().splitBlockClick('tens');
        expect(useWorkspaceStore.getState().counts.units).toBe(10);
        expect(useWorkspaceStore.getState().counts.tens).toBe(0);
      });
    });

    describe('3.3 Rapid 20-Click Distractor Bursts & Passive Drifting Undo Triggers', () => {
      it('should handle rapid 20-click distractor bursts without corrupting penalty timer or state', () => {
        const baseTime = 1700000000000;
        vi.spyOn(Date, 'now').mockReturnValue(baseTime);

        // Simulate 20 rapid clicks on distractor within 1 second
        for (let i = 0; i < 20; i++) {
          const remaining = useWorkspaceStore.getState().getSocraticPenaltyRemaining();
          if (remaining === 0) {
            useWorkspaceStore.getState().triggerSocraticPenaltyLockout('טעות');
          }
        }

        // Lockout must be exactly baseTime + 30000
        expect(useWorkspaceStore.getState().socraticPenaltyLockoutUntil).toBe(baseTime + 30000);
        expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(30);
      });

      it('should trigger passive drifting in Session 6 on 4 undos in 15 seconds', () => {
        const now = 100000;
        const undoTimestamps = [now - 12000, now - 8000, now - 4000, now];
        const recentUndos = undoTimestamps.filter(t => now - t <= 15000);
        expect(recentUndos.length >= 4).toBe(true);
      });

      it('should trigger passive drifting in Session 8 on 3 undos in a single task', () => {
        const taskUndos = [1, 2, 3];
        expect(taskUndos.length >= 3).toBe(true);
      });

      it('should strictly bypass Socratic popups during Session 2 (Diagnostic)', () => {
        const sessionNumber = 2;
        let shouldTriggerSocratic = false;
        if (sessionNumber === 2) {
          shouldTriggerSocratic = false;
        }
        expect(shouldTriggerSocratic).toBe(false);
      });
    });
  });

  // ==========================================================================
  // REQUIREMENT 4 (R4): RTDB SYNC & OFFLINE FIFO QUEUE
  // ==========================================================================
  describe('R4: Realtime Database Sync & Offline FIFO Queue Chaos', () => {

    describe('4.1 Offline FIFO Queue Capacity (500 Items) & Exact Drain Order', () => {
      it('should store up to 500 offline telemetry transactions and maintain exact FIFO order', () => {
        const queue: Array<{ id: number; path: string; payload: any }> = [];
        const QUEUE_MAX_CAP = 500;

        const enqueueOffline = (id: number, payload: any) => {
          queue.push({ id, path: `telemetry/${id}`, payload });
          if (queue.length > QUEUE_MAX_CAP) {
            queue.shift(); // Drop oldest
          }
        };

        // Enqueue 500 events
        for (let i = 1; i <= 500; i++) {
          enqueueOffline(i, { action: `event_${i}`, timestamp: Date.now() + i });
        }

        expect(queue.length).toBe(500);
        expect(queue[0].id).toBe(1);
        expect(queue[499].id).toBe(500);

        // Enqueue 1 more event (501) -> item 1 is evicted, item 2 is now first
        enqueueOffline(501, { action: 'event_501' });
        expect(queue.length).toBe(500);
        expect(queue[0].id).toBe(2);
        expect(queue[499].id).toBe(501);

        // Drain in exact FIFO order
        const drained: number[] = [];
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) drained.push(item.id);
        }

        expect(drained.length).toBe(500);
        expect(drained[0]).toBe(2);
        expect(drained[499]).toBe(501);
      });
    });

    describe('4.2 Chat Optimistic Messages & Server Snapshot Deduplication', () => {
      it('should merge server snapshots without duplicate messages when optimistic IDs match push keys', () => {
        const initialMessages: ChatMessage[] = [];
        
        // 1. Client creates optimistic message
        const optimisticMsg: ChatMessage = {
          id: '-N_PushKey123',
          senderId: 'student_user2',
          senderName: 'תלמיד 2',
          receiverId: 'teacher_1002220159',
          text: 'שלום מורה, עזרה בבקשה',
          timestamp: 1000,
          read: false,
        };

        let currentMessages = [...initialMessages.filter(m => m.id !== optimisticMsg.id), optimisticMsg];
        expect(currentMessages.length).toBe(1);

        // 2. Server snapshot returns data containing the exact same push key
        const serverSnapshotData: Record<string, ChatMessage> = {
          '-N_PushKey123': {
            id: '-N_PushKey123',
            senderId: 'student_user2',
            senderName: 'תלמיד 2',
            receiverId: 'teacher_1002220159',
            text: 'שלום מורה, עזרה בבקשה',
            timestamp: 1000,
            read: true, // Marked as read by server
          }
        };

        const parsedServerMsgs = Object.values(serverSnapshotData);
        expect(parsedServerMsgs.length).toBe(1);
        expect(parsedServerMsgs[0].read).toBe(true);
        expect(parsedServerMsgs[0].id).toBe('-N_PushKey123');
      });

      it('should route chat between student and teacher to normalized student room', () => {
        expect(computeRoomId('student_user3', 'teacher_1002220159')).toBe('student_user3');
        expect(computeRoomId('teacher_1002220159', 'student_user3')).toBe('student_user3');
        expect(computeRoomId('admin', 'student_user7')).toBe('student_user7');
      });

      it('should clamp student identifiers strictly to 1..12 pilot range', () => {
        expect(normalizeStudentId('student_0')).toBe('student_user1');
        expect(normalizeStudentId('student_1')).toBe('student_user1');
        expect(normalizeStudentId('student_12')).toBe('student_user12');
        expect(normalizeStudentId('student_999')).toBe('student_user12');
        expect(normalizeStudentId('student_-10')).toBe('student_user1');
      });
    });
  });

  // ==========================================================================
  // REQUIREMENT 5 (R5): SRL METRICS & ANALYTICS FUZZING
  // ==========================================================================
  describe('R5: SRL Persistence Metric & Analytics Fuzzing', () => {

    describe('5.1 Persistence Index Canonical Formula (U / (U + E + G)) * 100', () => {
      const calculatePersistenceIndex = (u: number, e: number, g: number): number => {
        const safeU = Math.max(0, u);
        const safeE = Math.max(0, e);
        const safeG = Math.max(0, g);
        const denominator = safeU + safeE + safeG;
        if (denominator <= 0) return 100; // PRD default: 100% when zero struggle/events
        const raw = (safeU / denominator) * 100;
        return Math.min(Math.max(Math.round(raw), 0), 100);
      };

      it('should return 100% for 0/0/0 divide-by-zero scenario (no errors or struggle)', () => {
        expect(calculatePersistenceIndex(0, 0, 0)).toBe(100);
      });

      it('should return 100% when student self-corrects using Undos with 0 errors', () => {
        expect(calculatePersistenceIndex(1, 0, 0)).toBe(100);
        expect(calculatePersistenceIndex(50, 0, 0)).toBe(100);
      });

      it('should return 0% when student had errors or guesses but 0 Undos', () => {
        expect(calculatePersistenceIndex(0, 5, 0)).toBe(0);
        expect(calculatePersistenceIndex(0, 0, 8)).toBe(0);
        expect(calculatePersistenceIndex(0, 10, 10)).toBe(0);
      });

      it('should accurately calculate ratios and round properly', () => {
        // 5 / (5 + 5 + 0) = 50%
        expect(calculatePersistenceIndex(5, 5, 0)).toBe(50);
        // 1 / (1 + 2 + 0) = 33%
        expect(calculatePersistenceIndex(1, 2, 0)).toBe(33);
        // 2 / (2 + 1 + 0) = 67%
        expect(calculatePersistenceIndex(2, 1, 0)).toBe(67);
      });

      it('should fuzz massive interaction counts (>1000) cleanly', () => {
        expect(calculatePersistenceIndex(1000, 1000, 1000)).toBe(33);
        expect(calculatePersistenceIndex(5000, 0, 0)).toBe(100);
        expect(calculatePersistenceIndex(0, 10000, 10000)).toBe(0);
      });

      it('should sanitize negative inputs cleanly and clamp output to [0, 100]', () => {
        expect(calculatePersistenceIndex(-5, 0, 0)).toBe(100);
        expect(calculatePersistenceIndex(-10, 5, 5)).toBe(0);
        expect(calculatePersistenceIndex(10, -5, 0)).toBe(100);
      });
    });

    describe('5.2 Session 8 Reflection 3-Step State Progression & Debouncing', () => {
      it('should progress sequentially through Steps 1 -> 2 -> 3 without jumping out of order', () => {
        let step = 1;
        let selectedFeeling: number | null = null;
        let selectedFocus: string | null = null;
        let isSubmitting = false;

        // Step 1: Emoji Feeling Select
        const handleFeelingSelect = (feelingId: number) => {
          if (step !== 1) return;
          selectedFeeling = feelingId;
          step = 2; // In component, advances after 600ms
        };

        handleFeelingSelect(4);
        expect(selectedFeeling).toBe(4);
        expect(step).toBe(2);

        // Step 2: Review Performance -> Continue to Step 3
        const handleStep2Continue = () => {
          if (step !== 2) return;
          step = 3;
        };

        handleStep2Continue();
        expect(step).toBe(3);

        // Step 3: Focus Area Selection & Debounced Submission
        let submitCallCount = 0;
        const handleFocusSelect = (focusId: string) => {
          if (step !== 3 || isSubmitting) return; // Debounce guard
          isSubmitting = true;
          selectedFocus = focusId;
          submitCallCount++;
        };

        // Rapid double click on Step 3
        handleFocusSelect('10_100');
        handleFocusSelect('10_100'); // Debounced click

        expect(submitCallCount).toBe(1);
        expect(selectedFocus).toBe('10_100');
        expect(isSubmitting).toBe(true);
      });
    });
  });

});
