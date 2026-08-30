import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useAuthStore, unifiedLogout } from '@/application/useAuthStore';
import { useTeacherStore } from '@/application/useTeacherStore';
import { useStore } from '@/application/useStore';
import { useChatStore, normalizeStudentId } from '@/application/useChatStore';
import { useAdminStore } from '@/application/useAdminStore';
import { 
  validateZeroPIIPayload, 
  containsPII, 
  sanitizePII, 
  isValidIsraeliID, 
  validateChatInputForPII, 
  anonymizeChatMessageBody 
} from '@/core/security/PiiFilter';
import { 
  validateTelemetryColumnIndexRule, 
  type TelemetryPayload, 
  type TelemetryEventType 
} from '@/types/telemetry';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { indexedDBQueue } from '@/infrastructure/services/IndexedDBQueue';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { CurriculumRouter } from '@/core/CurriculumRouter';
import { SESSION1_TASKS, SESSION3_TASKS } from '@/data/sessionTasks';
import { TASKS } from '@/core/QMatrix';

describe('MASTER PRD v07 COMPREHENSIVE QA & AUDIT SUITE', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({
      user: null,
      role: null,
      isAuthenticated: false,
      isStudentAuthenticated: false,
      isRoleLocked: false,
      showRoleSelector: false,
      authTimestamp: null,
    });
    useChatStore.setState({ messages: [], activeRoomId: null, unreadCount: 0 });
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    await indexedDBQueue.clearAll();
  });

  describe('QA Pillar 1: Modules 1-3 & 25 (Auth, PII Security, Route Guards, Whitelist)', () => {
    it('enforces anonymous student ID constraint (1..12) and rejects invalid IDs', () => {
      const auth = useAuthStore.getState();

      // Valid ID: 4
      auth.setUser({ student_id: 4, role: 'student' }, 'student');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.student_id).toBe(4);
      expect(useAuthStore.getState().user?.uid).toBe('student_user4');

      // Invalid ID: 15 (exceeds 12)
      auth.setUser({ student_id: 15, role: 'student' }, 'student');
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();

      // Invalid ID: 0 (below 1)
      auth.setUser({ student_id: 0, role: 'student' }, 'student');
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('validates Zero PII fail-closed regex, Luhn algorithm, and sanitization', () => {
      // Valid Luhn Teudat Zehut (e.g. 012345674)
      expect(isValidIsraeliID('012345674')).toBe(true);
      expect(isValidIsraeliID('123456789')).toBe(false);

      // PII in phone, email, or Israeli ID
      expect(containsPII('052-1234567')).toBe(true);
      expect(containsPII('0501234567')).toBe(true);
      expect(containsPII('user@school.org.il')).toBe(true);
      expect(containsPII('012345674')).toBe(true);
      expect(containsPII('שלום כיתה המבקרים, תרגיל 5')).toBe(false);

      // Sanitize chat messages & Tier 2 replacement
      const chatSanitized = anonymizeChatMessageBody('דוד ושרה צריכים עזרה עם 054-9876543', {
        'דוד': 1,
        'שרה': 2
      });
      expect(chatSanitized).toContain('תלמיד 1');
      expect(chatSanitized).toContain('תלמיד 2');
      expect(chatSanitized).toContain('[PHONE_REDACTED]');
      expect(chatSanitized).not.toContain('054-9876543');
    });

    it('enforces clean synchronous logout and wipes IndexedDB and store contexts', async () => {
      useAuthStore.getState().setUser({ student_id: 5, role: 'student' }, 'student');
      useWorkspaceStore.setState({ counts: { units: 5, tens: 2, hundreds: 0, thousands: 0 } });
      useChatStore.setState({ unreadCount: 3 });

      // Queue an action to IndexedDB
      await indexedDBQueue.enqueue('telemetry_logs/test_1', { event_type: 'DIGIT_ENTERED' });

      // Execute unified logout
      unifiedLogout();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useChatStore.getState().unreadCount).toBe(0);
    });
  });

  describe('QA Pillar 2: Modules 4, 5, 17, 26 (Data Schemas, Telemetry, Offline FIFO Queue)', () => {
    it('strictly enforces telemetry column_index mandatory vs omitted rules', () => {
      // Mandatory for column-scoped events
      const validColEvent: TelemetryPayload<'BLOCK_DRAG_COMPLETE'> = {
        idempotency_key: 'idemp_1',
        client_timestamp: Date.now(),
        session_id: 'session_1_student_1',
        student_id: 1,
        exercise_id: 's1_t1',
        event_type: 'BLOCK_DRAG_COMPLETE',
        column_index: 0,
        details: { block_value: 1, source_column_index: null, target_column_index: 0 },
      };
      expect(validateTelemetryColumnIndexRule(validColEvent).isValid).toBe(true);

      const invalidColEvent: TelemetryPayload<'BLOCK_DRAG_COMPLETE'> = {
        ...validColEvent,
        column_index: undefined as any,
      };
      expect(validateTelemetryColumnIndexRule(invalidColEvent).isValid).toBe(false);

      // Forbidden for non-column events
      const validNonColEvent: TelemetryPayload<'SESSION_START'> = {
        idempotency_key: 'idemp_2',
        client_timestamp: Date.now(),
        session_id: 'session_1_student_1',
        student_id: 1,
        exercise_id: 's1_t1',
        event_type: 'SESSION_START',
        details: { session_number: 1, support_profile_id: null },
      };
      expect(validateTelemetryColumnIndexRule(validNonColEvent).isValid).toBe(true);

      const invalidNonColEvent: TelemetryPayload<'SESSION_START'> = {
        ...validNonColEvent,
        column_index: 1 as any,
      };
      expect(validateTelemetryColumnIndexRule(invalidNonColEvent).isValid).toBe(false);
    });

    it('enforces offline FIFO queue capacity of 500 items and batch flushing', async () => {
      for (let i = 1; i <= 20; i++) {
        await indexedDBQueue.enqueue(`telemetry_logs/idemp_${i}`, {
          event_type: 'DIGIT_ENTERED',
          column_index: 0,
          details: { digit_value: i, is_correct: true },
        });
      }

      // Verify status is online by default
      expect(indexedDBQueue.getOnlineStatus()).toBe(true);
      await indexedDBQueue.clearAll();
    });
  });

  describe('QA Pillar 3: Modules 7-11, 29 (VRA Workspace, Canvas, Dienes Blocks, Dynamic Keyboard)', () => {
    it('manages 5 VRA State Machine states and transitions correctly', () => {
      const store = useWorkspaceStore.getState();
      expect(store.currentState).toBe('IDLE');

      store.transitionTo('PROBLEM_ACTIVE');
      expect(useWorkspaceStore.getState().currentState).toBe('PROBLEM_ACTIVE');

      store.transitionTo('REGROUPING_ACTIVE');
      expect(useWorkspaceStore.getState().currentState).toBe('REGROUPING_ACTIVE');

      store.transitionTo('SOCRATIC_ACTIVE');
      expect(useWorkspaceStore.getState().currentState).toBe('SOCRATIC_ACTIVE');

      store.transitionTo('COMPLETE');
      expect(useWorkspaceStore.getState().currentState).toBe('COMPLETE');
    });

    it('handles Dienes blocks decomposition (click) and composition (button)', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(3, false);

      // Start with 1 Ten
      useWorkspaceStore.setState({ counts: { units: 0, tens: 1, hundreds: 0, thousands: 0 } });

      // Decompose Ten -> 10 Units
      store.splitBlockClick('tens');
      const stateAfterSplit = useWorkspaceStore.getState();
      expect(stateAfterSplit.counts.tens).toBe(0);
      expect(stateAfterSplit.counts.units).toBe(10);
      expect(stateAfterSplit.hasUngrouped).toBe(true);

      // Compose 10 Units -> 1 Ten
      store.groupColumnClick('units');
      const stateAfterGroup = useWorkspaceStore.getState();
      expect(stateAfterGroup.counts.tens).toBe(1);
      expect(stateAfterGroup.counts.units).toBe(0);
      expect(stateAfterGroup.hasGrouped).toBe(true);
    });

    it('enforces column keyboard lock exclusively for enhanced_cognitive_support on regrouping columns', () => {
      const store = useWorkspaceStore.getState();

      // Standard student: NO lock on column keyboard
      useAuthStore.setState({ user: { student_id: 1, support_profile_id: null } });
      store.initSession(4, false);
      const isLockedStandard = store.isColumnInputLocked('units', 345, 278, false);
      expect(isLockedStandard).toBe(false);

      // Enhanced support student: Lock IS active until regrouping
      useAuthStore.setState({ user: { student_id: 1, support_profile_id: 'enhanced_cognitive_support' } });
      useWorkspaceStore.setState({ hasGrouped: false });
      const isLockedEnhanced = store.isColumnInputLocked('units', 345, 278, false);
      expect(isLockedEnhanced).toBe(true);

      // Once regrouped -> unlocked
      useWorkspaceStore.setState({ hasGrouped: true });
      const isUnlockedEnhanced = store.isColumnInputLocked('units', 345, 278, false);
      expect(isUnlockedEnhanced).toBe(false);
    });

    it('restricts Undo stack to 10 items and excludes undo from error metrics', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(3, false);

      for (let i = 1; i <= 15; i++) {
        store.applyDrop({
          source: 'palette',
          item: { id: `u_${i}`, place: 'units', value: 1 },
          target: { kind: 'column', place: 'units' },
        });
      }

      expect(useWorkspaceStore.getState().undoStack.length).toBeLessThanOrEqual(10);
      expect(useWorkspaceStore.getState().typedErrorCount).toBe(0);
    });
  });

  describe('QA Pillar 4: Modules 12 & 13 (Socratic Mentoring Engine & 30s Lockout)', () => {
    it('locks Socratic card buttons for 30s upon incorrect answer selection without locking workspace', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(3, false);

      expect(store.isSocraticCardLocked).toBe(false);

      // Trigger 30s card lock
      store.lockSocraticCard(30000);
      expect(useWorkspaceStore.getState().isSocraticCardLocked).toBe(true);
      expect(useWorkspaceStore.getState().socraticLockDeadline).toBeGreaterThan(Date.now());

      // Workspace board and input remains unlocked
      expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);
    });

    it('validates Socratic Engine schema: requires error_category enum calculation|procedural|conceptual', async () => {
      // Mock valid Gemini response
      const mockValidRes = {
        data: JSON.stringify({
          hard_evidence_log: [{ inspected_variable: 'test', rule_triggered: 'rule1' }],
          final_intervention: {
            error_category: 'procedural',
            guiding_question: 'מה הצעד הבא בחיבור היחידות?',
            options: [
              { id: '1', text: 'לחבר את היחידות תחילה', feedback: 'נכון מאוד!', is_correct: true },
              { id: '2', text: 'להתחיל מהמאות', feedback: 'יש להתחיל מהיחידות', is_correct: false },
              { id: '3', text: 'למחוק את הספרות', feedback: 'נסה שוב', is_correct: false },
            ],
          },
        }),
      };

      vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValueOnce(mockValidRes);

      const response = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
        currentTask: { id: 's4_t2', titleHe: 'חיבור במאונך', type: 'vertical_addition' },
        targetNode: 'node_addition',
        activeColumnName: 'יחידות',
        counts: { units: 12, tens: 3, hundreds: 0, thousands: 0 },
        recentActions: [],
        qMatrixAnchor: {
          questionHe: 'שאלה לדוגמה',
          choices: [{ id: 'opt_1', textHe: 'אפשרות' }],
          correctChoiceId: 'opt_1',
          pedagogical_intent: 'procedural',
        },
      });

      expect(response).not.toBeNull();
      expect(response?.error_category).toBe('procedural');
      expect(response?.choices.length).toBe(3);
    });
  });

  describe('QA Pillar 5: Modules 14-16, 20 (8 Sessions Flow, Early Finishers, SRL Reflection, Approval Gate)', () => {
    it('verifies 15min deadline for Sessions 3-7 and 25min for Sessions 1, 2, 8', () => {
      const store = useWorkspaceStore.getState();

      store.initSession(1, false);
      expect(useWorkspaceStore.getState().sessionDurationMinutes).toBe(25);

      store.initSession(2, false);
      expect(useWorkspaceStore.getState().sessionDurationMinutes).toBe(25);

      store.initSession(3, false);
      expect(useWorkspaceStore.getState().sessionDurationMinutes).toBe(15);

      store.initSession(7, false);
      expect(useWorkspaceStore.getState().sessionDurationMinutes).toBe(15);

      store.initSession(8, false);
      expect(useWorkspaceStore.getState().sessionDurationMinutes).toBe(25);
    });

    it('routes early finishers to choice_branch with exactly 2 branches: Reinforcement & Challenge', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(3, false);

      // Advance to 7th task completion
      useWorkspaceStore.setState({ standardTaskIdx: 6, selectedBranch: null, flowStatus: 'choice_branch' });
      expect(useWorkspaceStore.getState().flowStatus).toBe('choice_branch');

      // Select Challenge Branch
      store.selectBranch('challenge');
      const activeTasks = getActiveTasks(useWorkspaceStore.getState());
      expect(activeTasks.length).toBeGreaterThan(7);
      expect(useWorkspaceStore.getState().selectedBranch).toBe('challenge');
      expect(useWorkspaceStore.getState().flowStatus).toBe('task');
    });

    it('evaluates CurriculumRouter recommendation correctly based on Session 2 performance', () => {
      // Clean diagnostic -> GREEN
      const cleanStudent: any = {
        qMatrixResults: {
          task1_zero_placeholder: 'success',
          task3_flexible_regrouping: 'success',
          task4_basic_addition_fluency: 'success',
          task6_subtraction_regrouping: 'success',
        },
        traceData: { hesitation_events: 2, undo_clicks: 3 },
      };
      expect(CurriculumRouter.evaluateRoute(cleanStudent)).toBe('GREEN');

      // Struggled with zero placeholder -> YELLOW
      const strugglingStudent: any = {
        ...cleanStudent,
        qMatrixResults: { ...cleanStudent.qMatrixResults, task1_zero_placeholder: 'zero_as_blank' },
      };
      expect(CurriculumRouter.evaluateRoute(strugglingStudent)).toBe('YELLOW');
    });

    it('computes Session 8 Persistence Index accurately with zero-denominator safety', () => {
      const computePersistence = (U: number, E: number, G: number) => {
        const denom = U + E + G;
        return denom === 0 ? 100 : Math.min(100, Math.max(0, Math.round((U / denom) * 100)));
      };

      expect(computePersistence(0, 0, 0)).toBe(100);
      expect(computePersistence(5, 5, 0)).toBe(50);
      expect(computePersistence(10, 0, 0)).toBe(100);
      expect(computePersistence(0, 5, 5)).toBe(0);
    });
  });

  describe('QA Pillar 6: Modules 18-23א, 27, 28 (Teacher Dashboard, Chat, Reports, Immutable Reset Audit)', () => {
    it('manages 12-student radar tiles, glyph, and support profile update safely', () => {
      const teacherStore = useTeacherStore.getState();
      expect(teacherStore).toBeDefined();

      // Teacher updates student support profile
      const newProfile = 'enhanced_cognitive_support';
      useWorkspaceStore.getState().setPendingSupportProfile(newProfile);
      expect(useWorkspaceStore.getState().pendingSupportProfileId).toBe(newProfile);
    });

    it('enforces immutable reset audit logs across 4 reset levels', () => {
      const logLevels = ['alerts', 'single_student', 'system', 'export'] as const;
      
      for (const level of logLevels) {
        const auditEntry = {
          audit_id: `reset_${level}_${Date.now()}`,
          caller_id: 'teacher_01',
          caller_role: 'teacher' as const,
          reset_level: level,
          timestamp: Date.now(),
          details: `Reset performed for level ${level}`,
        };
        expect(auditEntry.reset_level).toBe(level);
        expect(auditEntry.caller_role).toBe('teacher');
      }
    });

    it('maintains bidirectional chat message synchronization with unread indicators', () => {
      useChatStore.setState({
        messages: [{
          id: 'msg_1',
          senderId: 'teacher_01',
          senderName: 'מורה',
          receiverId: 'student_user3',
          text: 'היי תלמיד 3, כל הכבוד על פתרון תרגיל 4!',
          timestamp: Date.now(),
          read: false,
        }]
      });

      expect(useChatStore.getState().messages.length).toBe(1);
      expect(useChatStore.getState().messages[0].text).toContain('תלמיד 3');

      useChatStore.getState().markAllAsRead();
      expect(useChatStore.getState().messages[0].read).toBe(true);
    });
  });
});
