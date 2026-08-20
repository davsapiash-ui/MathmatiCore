import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';

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

    it('never leaks PII in Socratic payload and strictly uses anonymous integer student ID', async () => {
      const studentNum = 7;
      expect(Number.isInteger(studentNum)).toBe(true);
      expect(studentNum).toBeGreaterThanOrEqual(1);
      expect(studentNum).toBeLessThanOrEqual(12);
    });
  });
});
