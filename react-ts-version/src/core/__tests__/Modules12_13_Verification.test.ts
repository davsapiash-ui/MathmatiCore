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

    it('enforces the Holistic Pedagogical Triad across exercise context, workspace state, and student progress', async () => {
      const callSpy = vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValueOnce({
        data: JSON.stringify({
          hard_evidence_log: [
            {
              inspected_variable: 'Exercise numbers and live blocks in active column',
              exact_value_found: '425 - 162, Tens column, 2 tens on board',
              rule_triggered: 'Deficit in subtraction column requires decomposition',
              action_taken: 'Formulate decomposition guiding question'
            }
          ],
          final_intervention: {
            error_category: 'procedural',
            guiding_question: 'בתרגיל חיסור 425 פחות 162, בעמודת העשרות יש 2 עשרות וצריך להחסיר 6. כיצד נקבל עוד עשרות בבית המספרים?',
            options: [
              { id: '1', text: 'נפרוט מאה אחת מטור המאות ל-10 עשרות', feedback: 'נכון מאוד!', is_correct: true },
              { id: '2', text: 'נחסיר הפוך 6 פחות 2', feedback: 'לא נכון', is_correct: false },
              { id: '3', text: 'נמחק את טור המאות לפח', feedback: 'לא נכון', is_correct: false }
            ]
          }
        })
      });

      const request = SocraticEngine.buildGeminiSocraticRequest({
        studentId: 3,
        sessionId: 'session_4_student_3',
        exerciseId: 's4_t2',
        activeColumnIndex: 1,
        exerciseContext: {
          operation: 'subtraction',
          number_a: 425,
          number_b: 162,
          session_id: 'session_4',
          session_topic: 'חיסור עם פריטת עשרות',
          active_column: 'tens',
          active_column_index: 1,
          target_sub_problem: '2 - 6',
        },
        workspaceState: {
          ones_count: 5,
          tens_count: 2,
          hundreds_count: 4,
          thousands_count: 0,
          memory_circles: {},
          is_regrouped_in_canvas: false,
        },
        studentProgressState: {
          completed_columns: ['units'],
          current_column_input: null,
          memory_circles_state: {},
          trigger_reason: 'hesitation_45s',
          consecutive_errors_count: 0,
          recent_actions: [],
        },
      });

      expect(request.student_id).toBe(3);
      expect(request.exercise_context?.number_a).toBe(425);
      expect(request.exercise_context?.number_b).toBe(162);
      expect(request.exercise_context?.active_column).toBe('tens');
      expect(request.student_progress_state?.completed_columns).toContain('units');
      expect(request.workspace_state.is_regrouped_in_canvas).toBe(false);

      const result = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
        currentTask: {
          id: 's4_t2',
          titleHe: 'חיסור פריטת עשרות',
          numberA: 425,
          numberB: 162,
          requiresUngrouping: true,
        },
        targetNode: 'subtraction_regrouping',
        activeColumnName: 'עשרות',
        counts: { units: 5, tens: 2, hundreds: 4, thousands: 0 },
        recentActions: ['השלמת יחידות בהצלחה', 'השתהות 45 שניות בטור עשרות'],
        qMatrixAnchor: {
          pedagogical_intent: 'procedural',
          error_category: 'procedural',
          questionHe: 'מה הצעד הבא בחיסור?',
          choices: [
            { id: 'opt_1', textHe: 'לפרוט מאה לעשרות', isCorrect: true },
            { id: 'opt_2', textHe: 'להחסיר הפוך', isCorrect: false },
            { id: 'opt_3', textHe: 'למחוק בלוקים', isCorrect: false },
          ],
          correctChoiceId: 'opt_1',
        },
      });

      expect(callSpy).toHaveBeenCalled();
      const passedPrompt = (callSpy.mock.calls[0][0] as any).prompt;
      expect(passedPrompt).toContain('425');
      expect(passedPrompt).toContain('162');
      expect(passedPrompt).toContain('עשרות');
      expect(passedPrompt).toContain('HOLISTIC PEDAGOGICAL TRIAD');

      expect(result).toBeDefined();
      expect(result?.questionHe).toContain('425 פחות 162');
      expect(result?.error_category).toBe('procedural');
      expect(result?.choices).toHaveLength(3);
    });
  });
});
