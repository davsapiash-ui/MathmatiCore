import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';

describe('Verification Suite: Module 12(c) and Module 13(a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().resetWorkspace();
  });

  describe('Module 12(c): 3 Consecutive Undos Trigger Condition', () => {
    it('opens Socratic card on 3 consecutive undos in Session 8', async () => {
      useWorkspaceStore.setState({
        sessionNumber: 8,
        currentState: 'IDLE',
        isSocraticCardLocked: false,
        helpState: 'closed',
        undoStack: [
          { counts: { units: 1, tens: 0, hundreds: 0, thousands: 0 }, actionType: 'BLOCK_DRAG_COMPLETE' },
          { counts: { units: 2, tens: 0, hundreds: 0, thousands: 0 }, actionType: 'BLOCK_DRAG_COMPLETE' },
          { counts: { units: 3, tens: 0, hundreds: 0, thousands: 0 }, actionType: 'BLOCK_DRAG_COMPLETE' },
        ],
        consecutiveUndoCount: 0,
      });

      // 1st Undo
      useWorkspaceStore.getState().undo();
      expect(useWorkspaceStore.getState().consecutiveUndoCount).toBe(1);
      expect(useWorkspaceStore.getState().helpState).toBe('closed');

      // 2nd Undo
      useWorkspaceStore.getState().undo();
      expect(useWorkspaceStore.getState().consecutiveUndoCount).toBe(2);
      expect(useWorkspaceStore.getState().helpState).toBe('closed');

      // 3rd Undo in Session 8 -> Triggers Socratic coach
      useWorkspaceStore.getState().undo();
      expect(useWorkspaceStore.getState().consecutiveUndoCount).toBe(3);

      // Allow setTimeout(..., 0) to execute
      await new Promise((r) => setTimeout(r, 20));
      expect(useWorkspaceStore.getState().helpState).toBe('socratic');
      expect(useWorkspaceStore.getState().currentState).toBe('SOCRATIC_ACTIVE');
    });

    it('does NOT open Socratic card on 3 consecutive undos in Session 3 (or non-8 sessions)', async () => {
      useWorkspaceStore.setState({
        sessionNumber: 3,
        currentState: 'IDLE',
        isSocraticCardLocked: false,
        helpState: 'closed',
        undoStack: [
          { counts: { units: 1, tens: 0, hundreds: 0, thousands: 0 }, actionType: 'BLOCK_DRAG_COMPLETE' },
          { counts: { units: 2, tens: 0, hundreds: 0, thousands: 0 }, actionType: 'BLOCK_DRAG_COMPLETE' },
          { counts: { units: 3, tens: 0, hundreds: 0, thousands: 0 }, actionType: 'BLOCK_DRAG_COMPLETE' },
        ],
        consecutiveUndoCount: 0,
      });

      // 1st Undo
      useWorkspaceStore.getState().undo();
      // 2nd Undo
      useWorkspaceStore.getState().undo();
      // 3rd Undo
      useWorkspaceStore.getState().undo();

      expect(useWorkspaceStore.getState().consecutiveUndoCount).toBe(3);

      // Wait to confirm no timer triggered
      await new Promise((r) => setTimeout(r, 20));
      expect(useWorkspaceStore.getState().helpState).toBe('closed');
      expect(useWorkspaceStore.getState().currentState).not.toBe('SOCRATIC_ACTIVE');
    });
  });

  describe('Module 13(a): Gemini Response Schema Validation for error_category', () => {
    it('rejects response missing error_category and falls back to static hint', async () => {
      const mockMalformedResponse = {
        data: JSON.stringify({
          final_intervention: {
            guiding_question: 'בוא נבדוק את עמודת היחידות',
            options: [
              { id: '1', text: 'אפשרות 1', feedback: 'פידבק 1', is_correct: true },
              { id: '2', text: 'אפשרות 2', feedback: 'פידבק 2', is_correct: false },
              { id: '3', text: 'אפשרות 3', feedback: 'פידבק 3', is_correct: false }
            ]
          }
        })
      };

      vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValueOnce(mockMalformedResponse);

      const request = SocraticEngine.buildGeminiSocraticRequest({
        studentId: 1,
        sessionId: 'session_8_student_1',
        exerciseId: 's8_t1',
        activeColumnIndex: 0,
        workspaceState: { ones_count: 5, tens_count: 2, hundreds_count: 0, memory_circles: {} },
      });

      const result = await SocraticEngine.requestSocraticHintWithFallback(request, { id: 's1_license_test' });

      expect(result).toBeDefined();
      expect(result.questionHe).toBe('כיצד מייצגים את המספר 420 בבית המספרים?');
    });

    it('accepts response containing valid error_category and populates error_category in hint', async () => {
      const mockValidResponse = {
        data: JSON.stringify({
          final_intervention: {
            error_category: 'procedural',
            guiding_question: 'מה הצעד הבא לאחר קיבוץ 10 יחידות?',
            options: [
              { id: '1', text: 'להוסיף עשרת לטור העשרות', feedback: 'נכון מאוד!', is_correct: true },
              { id: '2', text: 'למחוק את טור המאות', feedback: 'לא נכון', is_correct: false },
              { id: '3', text: 'להשאיר את 10 היחידות בטור', feedback: 'לא נכון', is_correct: false }
            ]
          }
        })
      };

      vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValueOnce(mockValidResponse);

      const request = SocraticEngine.buildGeminiSocraticRequest({
        studentId: 1,
        sessionId: 'session_8_student_1',
        exerciseId: 's8_t1',
        activeColumnIndex: 0,
        workspaceState: { ones_count: 5, tens_count: 2, hundreds_count: 0, memory_circles: {} },
      });

      const result = await SocraticEngine.requestSocraticHintWithFallback(request, { id: 's1_license_test' });

      expect(result).toBeDefined();
      expect(result.questionHe).toBe('מה הצעד הבא לאחר קיבוץ 10 יחידות?');
      expect(result.error_category).toBe('procedural');
    });
  });
});
