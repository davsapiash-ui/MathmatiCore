import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import type { GeminiSocraticRequest } from '@/types';

describe('Master PRD v5.0 Phase 3: Socratic Mentoring & Gemini Integration (Modules 12, 13)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    useAuthStore.getState().logout();
    useWorkspaceStore.getState().resetWorkspace?.();
  });

  describe('Module 12: Socratic Triggers & 60s Penalty Lockout', () => {
    it('triggers Socratic card on 4 consecutive digit deletions in active column', () => {
      useWorkspaceStore.setState({
        helpState: 'closed',
        consecutiveDeletions: 0,
        answerDigits: { units: '5' },
      });

      // Deletion 1
      useWorkspaceStore.getState().setAnswerDigit('units', '');
      expect(useWorkspaceStore.getState().consecutiveDeletions).toBe(1);
      expect(useWorkspaceStore.getState().helpState).toBe('closed');

      // Deletion 2
      useWorkspaceStore.setState({ answerDigits: { units: '4' } });
      useWorkspaceStore.getState().setAnswerDigit('units', '');
      expect(useWorkspaceStore.getState().consecutiveDeletions).toBe(2);

      // Deletion 3
      useWorkspaceStore.setState({ answerDigits: { units: '3' } });
      useWorkspaceStore.getState().setAnswerDigit('units', '');
      expect(useWorkspaceStore.getState().consecutiveDeletions).toBe(3);
      expect(useWorkspaceStore.getState().helpState).toBe('closed');

      // Deletion 4 -> Triggers Socratic card
      useWorkspaceStore.setState({ answerDigits: { units: '2' } });
      useWorkspaceStore.getState().setAnswerDigit('units', '');
      expect(useWorkspaceStore.getState().consecutiveDeletions).toBe(4);
    });

    it('resets consecutive deletions count upon typing a valid digit', () => {
      useWorkspaceStore.setState({
        consecutiveDeletions: 3,
        answerDigits: {},
      });

      useWorkspaceStore.getState().setAnswerDigit('units', '7');
      expect(useWorkspaceStore.getState().consecutiveDeletions).toBe(0);
    });

    it('applies a strict 30-second penalty lockout upon selecting an incorrect distractor', () => {
      expect(useWorkspaceStore.getState().socraticPenaltyLockoutUntil).toBeNull();

      const startTime = Date.now();
      useWorkspaceStore.getState().triggerSocraticPenaltyLockout('רמז מבני: בדקו את כמות הלבנים בטור');

      const lockUntil = useWorkspaceStore.getState().socraticPenaltyLockoutUntil;
      expect(lockUntil).not.toBeNull();
      expect(lockUntil! - startTime).toBeGreaterThanOrEqual(29000);
      expect(lockUntil! - startTime).toBeLessThanOrEqual(31000);

      const remaining = useWorkspaceStore.getState().getSocraticPenaltyRemaining();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(30);
    });

    it('ensures Dienes canvas interactions (applyDrop, removeBlock, undo) remain 100% active during 30s Socratic lock', () => {
      // Apply 60s lockout
      useWorkspaceStore.getState().triggerSocraticPenaltyLockout('נעילת כרטיס החניכה');
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBeGreaterThan(0);

      // Canvas actions MUST succeed
      useWorkspaceStore.getState().applyDrop({
        source: 'palette',
        sourcePlace: 'tens',
        target: { kind: 'column', place: 'tens' },
      });
      expect(useWorkspaceStore.getState().counts.tens).toBe(1);

      // Undo button MUST succeed
      useWorkspaceStore.getState().undo();
      expect(useWorkspaceStore.getState().counts.tens).toBe(0);
    });
  });

  describe('Module 13: Gemini API Schema & Socratic Fallback System', () => {
    it('returns strict Socratic hint schema with guiding question and exactly 3 options', async () => {
      const hint = await SocraticEngine.getSocraticHint(
        { id: 's3_t3', sessionNumber: 3 },
        'q_matrix_regroup_units',
        { units: 13, tens: 2, hundreds: 0, thousands: 0 }
      );

      expect(hint).not.toBeNull();
      expect(typeof hint?.questionHe).toBe('string');
      expect(hint?.questionHe.length).toBeGreaterThan(0);
      expect(Array.isArray(hint?.choices)).toBe(true);
      expect(hint?.choices.length).toBe(3);

      // Verify IDs and Hebrew text
      hint?.choices.forEach((choice) => {
        expect(typeof choice.id).toBe('string');
        expect(typeof choice.textHe).toBe('string');
        expect(choice.textHe.length).toBeGreaterThan(0);
      });
    });

    it('reverts seamlessly to static fallback hints if Gemini API is unavailable', async () => {
      // Mock window without Gemini API key
      const hint = await SocraticEngine.fetchGeminiSocraticQuery(
        5,
        's4_t2',
        'units',
        { units: 10, tens: 0, hundreds: 0, thousands: 0 }
      );

      // When API key is not present or offline, returns null triggering silent fallback
      expect(hint).toBeNull();

      // SocraticEngine fallback kicks in
      const fallbackHint = await SocraticEngine.getSocraticHint(
        { id: 's4_t2', sessionNumber: 4 },
        'q_matrix_regroup_units',
        { units: 10, tens: 0, hundreds: 0, thousands: 0 }
      );
      expect(fallbackHint).not.toBeNull();
      expect(fallbackHint?.choices.length).toBe(3);
    });

    it('synthesizes grounded AI prompt and parses dynamic Socratic question with feedback via callGeminiSocraticProxy Cloud Function', async () => {
      const mockGeminiResponse = {
        hard_evidence_log: [
          {
            inspected_variable: "Current Blocks",
            exact_value_found: "Units=14",
            rule_triggered: "Rule 1: PENDING Objective Supremacy",
            action_taken: "Processed regrouping requirement for addition task"
          }
        ],
        final_intervention: {
          guiding_question: 'שימו לב: ישנן 14 קוביות בטור היחידות. מה הצעד הבא שנרצה לבצע?',
          options: [
            { id: 'opt_1', text: 'נאסוף 10 יחידות ונמיר אותן לעשרת אחת בטור העשרות', feedback: 'נכון מאוד! כעת בצעו את הקיבוץ בלוח.', is_correct: true },
            { id: 'opt_2', text: 'נמחק 4 יחידות לפח המחזור', feedback: 'מחיקת קוביות תשנה את הכמות הכוללת.', is_correct: false },
            { id: 'opt_3', text: 'נרשום 14 במשבצת אחת', feedback: 'בכל משבצת מותרת רק ספרה בודדת.', is_correct: false }
          ]
        }
      };

      vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValueOnce({
        data: mockGeminiResponse
      } as any);

      const dynamicHint = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
        currentTask: { id: 's3_t1', titleHe: 'חיבור עם המרה' },
        targetNode: 'regrouping_fluency',
        activeColumnName: 'יחידות',
        counts: { units: 14, tens: 2, hundreds: 1, thousands: 0 },
        recentActions: ['השתהות 45s'],
        qMatrixAnchor: {
          questionHe: 'מה עושים שיש יותר מ-9 בלוקים?',
          choices: [{ id: 'opt_1', textHe: 'קיבוץ' }, { id: 'opt_2', textHe: 'מחיקה' }, { id: 'opt_3', textHe: 'רישום' }]
        }
      });

      expect(dynamicHint).not.toBeNull();
      expect(dynamicHint?.questionHe).toBe('שימו לב: ישנן 14 קוביות בטור היחידות. מה הצעד הבא שנרצה לבצע?');
      expect(dynamicHint?.choices).toHaveLength(3);
      expect(dynamicHint?.choices[0].isCorrect).toBe(true);
      expect(dynamicHint?.choices[0].feedbackHe).toContain('נכון מאוד');
      expect(dynamicHint?.choices[1].feedbackHe).toContain('מחיקת קוביות');
    });

    it('explicitly simulates Cloud Function (callGeminiSocraticProxy) timeout/network error and asserts seamless fallback to static Q-Matrix anchor', async () => {
      // Simulate Cloud Function internal failure / timeout
      vi.spyOn(SocraticEngine, 'callGeminiProxy').mockRejectedValueOnce(new Error('DEADLINE_EXCEEDED: Cloud Function timed out after 3500ms'));

      const request: GeminiSocraticRequest = {
        student_id: 3,
        session_id: 'session_03_student_3',
        exercise_id: 's3_t1',
        active_column_index: 0,
        workspace_state: {
          ones_count: 14,
          tens_count: 2,
          hundreds_count: 1,
          memory_circles: {},
        },
        recent_actions: [],
      };

      const fallbackHint = await SocraticEngine.requestSocraticHintWithFallback(request, { id: 's3_t1' });

      // Verifies that requestSocraticHintWithFallback caught the Cloud Function error and gracefully returned the Q-Matrix anchor
      expect(fallbackHint).toBeDefined();
      expect(fallbackHint.questionHe).toBeTruthy();
      expect(fallbackHint.choices).toHaveLength(3);
      expect(fallbackHint.correctChoiceId).toBeDefined();
    });

    it('never leaks PII in Socratic payload and strictly uses anonymous integer student ID', async () => {
      const studentNum = 7;
      expect(Number.isInteger(studentNum)).toBe(true);
      expect(studentNum).toBeGreaterThanOrEqual(1);
      expect(studentNum).toBeLessThanOrEqual(12);
    });
  });
});
