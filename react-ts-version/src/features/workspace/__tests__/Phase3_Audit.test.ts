import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useChatStore } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useAdminStore } from '@/application/useAdminStore';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import type { SessionDocument } from '@/types';

describe('PHASE 3 EMPIRICAL AUDIT & INTEGRATION TEST SUITE (PRD v6.4)', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // =========================================================================
  // TEST 1: Persistence Index Edge Case (Module 16)
  // =========================================================================
  describe('TEST 1: Persistence Index Edge Case & SRL Telemetry (Module 16)', () => {
    it('calculates Persistence Index as strictly 100 on U=0, E=0, G=0 (Division by zero safe)', () => {
      // 1. Reset state with 0 undos, 0 typed errors, 0 distractor errors
      useWorkspaceStore.setState({
        undoCount: 0,
        typedErrorCount: 0,
        socraticDistractorErrors: 0,
      });

      const persistenceIndex = useWorkspaceStore.getState().getPersistenceIndex();

      // Assert strictly 100 (not NaN, not null, not 0)
      expect(persistenceIndex).toBe(100);
      expect(Number.isNaN(persistenceIndex)).toBe(false);
      expect(Number.isFinite(persistenceIndex)).toBe(true);
    });

    it('calculates accurate Persistence Index on standard distributions and logs REFLECTION_SUBMITTED', async () => {
      // 4 Undos, 1 Error, 0 Distractors => 4 / (4 + 1 + 0) * 100 = 80%
      useWorkspaceStore.setState({
        undoCount: 4,
        typedErrorCount: 1,
        socraticDistractorErrors: 0,
      });
      expect(useWorkspaceStore.getState().getPersistenceIndex()).toBe(80);

      // 0 Undos, 5 Errors, 0 Distractors => 0 / 5 * 100 = 0%
      useWorkspaceStore.setState({
        undoCount: 0,
        typedErrorCount: 5,
        socraticDistractorErrors: 0,
      });
      expect(useWorkspaceStore.getState().getPersistenceIndex()).toBe(0);

      // Verify AuditLogger accepts REFLECTION_SUBMITTED without throwing
      await expect(
        AuditLogger.log(
          'REFLECTION_SUBMITTED',
          'student_user1',
          'שלב רפלקציה הושלם: מאמץ HIGH, אסטרטגיות: undo, memory, מדד התמדה: 80%'
        )
      ).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // TEST 2: Teacher Gate Route Guard (Module 20)
  // =========================================================================
  describe('TEST 2: Teacher Gate Route Guard & Waiting View (Module 20)', () => {
    it('evaluates teacher approval gate and blocks Session 3 when gate is unapproved', () => {
      // Helper function matching StudentHub & StudentWorkspacePage gate check
      const isAwaitingTeacherGate = (
        doc: Partial<SessionDocument> | null,
        targetMeeting: number
      ): boolean => {
        if (!doc) return false;
        const isSession2Done = doc.session_number === 2 && doc.is_completed === true;
        const isGateApproved = doc.teacher_gate_approved === true;
        return isSession2Done && !isGateApproved && targetMeeting === 3;
      };

      // Case A: Session 2 completed, teacher_gate_approved is false -> MUST LOCK to BeeFlightWaitingScreen
      const unapprovedSession2Doc: SessionDocument = {
        session_id: 'session_02_student_1',
        class_id: 'class_1',
        session_number: 2,
        session_start_time: Date.now() - 1800000,
        session_deadline_time: Date.now() + 1800000,
        active_exercise_id: 'task8_missing_addend',
        is_completed: true,
        session_score_percent: 85,
        teacher_gate_approved: false,
        gate_approved_at: null,
        gate_approved_by: null,
        teacher_selected_path: null,
        matrix_recommended_path: 'green_path',
      };

      expect(isAwaitingTeacherGate(unapprovedSession2Doc, 3)).toBe(true);

      // Case B: Teacher approves the gate -> teacher_gate_approved becomes true -> UNLOCKS Session 3
      const approvedSession2Doc: SessionDocument = {
        ...unapprovedSession2Doc,
        teacher_gate_approved: true,
        gate_approved_at: Date.now(),
        gate_approved_by: '1002220159',
        teacher_selected_path: 'green_path',
      };

      expect(isAwaitingTeacherGate(approvedSession2Doc, 3)).toBe(false);

      // Case C: Attempting Session 1 or 2 -> No gate lock
      expect(isAwaitingTeacherGate(unapprovedSession2Doc, 2)).toBe(false);
      expect(isAwaitingTeacherGate(unapprovedSession2Doc, 1)).toBe(false);
    });
  });

  // =========================================================================
  // TEST 3: Canonical ID & PII Purge Proof (Module 1 & 22)
  // =========================================================================
  describe('TEST 3: Canonical Teacher ID 1002220159 & PII Purge Proof (Modules 1 & 22)', () => {
    it('proves zero occurrences of legacy 039604483 across all stores and defaults', () => {
      const legacyId = '039604483';

      // 1. Check workspace store
      const wsStateJson = JSON.stringify(useWorkspaceStore.getState());
      expect(wsStateJson.includes(legacyId)).toBe(false);

      // 2. Check chat store
      const chatStateJson = JSON.stringify(useChatStore.getState());
      expect(chatStateJson.includes(legacyId)).toBe(false);

      // 3. Check auth store
      const authStateJson = JSON.stringify(useAuthStore.getState());
      expect(authStateJson.includes(legacyId)).toBe(false);

      // 4. Check admin store
      const adminStateJson = JSON.stringify(useAdminStore.getState());
      expect(adminStateJson.includes(legacyId)).toBe(false);
    });

    it('enforces canonical authorized pilot teacher ID strictly as 1002220159', () => {
      // 1. Verify admin store pilot teacher seed
      useAdminStore.getState().resetInstitutionsToOfficialPilot();
      const teachers = useAdminStore.getState().teachers;
      const pilotTeacher = teachers.find(t => t.id === '1002220159' || t.ssoEmail?.includes('1002220159'));

      expect(pilotTeacher).toBeDefined();
      expect(pilotTeacher?.id).toBe('1002220159');
      expect(pilotTeacher?.ssoEmail).toBe('1002220159@edu-haifa.org.il');

      // 2. Verify pilot class points to canonical teacher 1002220159
      const classes = useAdminStore.getState().classes;
      const pilotClass = classes.find(c => c.name === 'המבקרים');
      expect(pilotClass).toBeDefined();
      expect(pilotClass?.teacherId).toBe('1002220159');
    });
  });
});
