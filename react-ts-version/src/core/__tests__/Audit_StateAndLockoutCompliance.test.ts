import { describe, it, expect, beforeEach, vi } from 'vitest';
import { stateReducer, type SystemEvent } from '@/machines/vraMachine';
import { isWhitelistedTeacherEmail, isWhitelistedTeacherEmailAsync } from '@/infrastructure/services/AuthService';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { evaluateKeyboardState, transitionKeyboardState } from '@/core/ExerciseValidationEngine';

describe('Master PRD v4.2 Rigorous Compliance Suite', () => {

  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
  });

  describe('Module 1 & 25: Dynamic Whitelist Exact Match & Google SSO Authorization', () => {
    it('strictly permits exact authorized pilot email davidsep@edu-haifa.org.il', async () => {
      expect(isWhitelistedTeacherEmail('davidsep@edu-haifa.org.il')).toBe(true);
      const isAuth = await isWhitelistedTeacherEmailAsync('davidsep@edu-haifa.org.il');
      expect(isAuth).toBe(true);
    });

    it('strictly rejects unauthorized emails without wildcard or domain-wide approval', async () => {
      expect(isWhitelistedTeacherEmail('unknown_random_teacher@edu-haifa.org.il')).toBe(false);
      expect(isWhitelistedTeacherEmail('hacker@edu.haifa.org.il')).toBe(false);
      expect(isWhitelistedTeacherEmail('attacker@gmail.com')).toBe(false);
      expect(isWhitelistedTeacherEmail('')).toBe(false);
      expect(isWhitelistedTeacherEmail(null)).toBe(false);
    });
  });

  describe('VRA Digital Model: Pure VRA Machine & Conversion Events', () => {
    it('transitions LOCKED -> UNLOCKED upon PLACE_VALUE_CONVERSION_SUCCESS', () => {
      const next = stateReducer('LOCKED', { type: 'PLACE_VALUE_CONVERSION_SUCCESS' });
      expect(next).toBe('UNLOCKED');
    });

    it('transitions LOCKED -> UNLOCKED upon PLACE_VALUE_CONVERSION', () => {
      const next = stateReducer('LOCKED', { type: 'PLACE_VALUE_CONVERSION' });
      expect(next).toBe('UNLOCKED');
    });

    it('enforces Module 11: maintains UNLOCKED on UNDO_CLICK without penalties', () => {
      const next = stateReducer('UNLOCKED', { type: 'UNDO_CLICK' });
      expect(next).toBe('UNLOCKED');
    });

    it('handles hesitation timeout transition LOCKED -> SOCRATIC_ONLY', () => {
      const next = stateReducer('LOCKED', { type: 'HESITATION_TIMER_EXPIRE' });
      expect(next).toBe('SOCRATIC_ONLY');
    });

    it('transitions SOCRATIC_ONLY -> UNLOCKED on SOCRATIC_SUCCESS', () => {
      const next = stateReducer('SOCRATIC_ONLY', { type: 'SOCRATIC_SUCCESS' });
      expect(next).toBe('UNLOCKED');
    });
  });

  describe('Module 10 & 12: Socratic Mentoring & 30s Distractor Lockout', () => {
    it('triggers a 30-second penalty lockout when a wrong distractor is selected', () => {
      const store = useWorkspaceStore.getState();
      expect(store.getSocraticPenaltyRemaining()).toBe(0);

      store.triggerSocraticPenaltyLockout('רמז בדיקה');
      const state = useWorkspaceStore.getState();
      expect(state.socraticPenaltyLockoutUntil).not.toBeNull();
      expect(state.socraticDistractorErrors).toBe(1);
      expect(store.getSocraticPenaltyRemaining()).toBeGreaterThan(20);
    });

    it('clears penalty lockout cleanly', () => {
      const store = useWorkspaceStore.getState();
      store.triggerSocraticPenaltyLockout();
      expect(store.getSocraticPenaltyRemaining()).toBeGreaterThan(0);

      store.clearSocraticPenaltyLockout();
      expect(store.getSocraticPenaltyRemaining()).toBe(0);
      expect(useWorkspaceStore.getState().socraticPenaltyLockoutUntil).toBeNull();
    });
  });

  describe('Module 16: Persistence Metric Formula [U / (U + E + G) * 100]', () => {
    it('returns 100% when no actions or errors have occurred (denominator = 0)', () => {
      const store = useWorkspaceStore.getState();
      expect(store.getPersistenceIndex()).toBe(100);
    });

    it('correctly calculates persistence index with Undo (U), Typed Errors (E), and Distractor Errors (G)', () => {
      const store = useWorkspaceStore.getState();
      
      // Simulate 3 Undos (U = 3)
      useWorkspaceStore.setState({ undoCount: 3 });
      // Simulate 1 Typed Error (E = 1)
      store.incrementTypedErrorCount();
      // Simulate 1 Socratic Distractor Error (G = 1)
      store.triggerSocraticPenaltyLockout();

      // Persistence = 3 / (3 + 1 + 1) * 100 = 3 / 5 * 100 = 60%
      expect(store.getPersistenceIndex()).toBe(60);
    });

    it('returns 100% when student had pure Undos and no uncorrected errors', () => {
      const store = useWorkspaceStore.getState();
      useWorkspaceStore.setState({ undoCount: 4, typedErrorCount: 0, socraticDistractorErrors: 0 });
      expect(store.getPersistenceIndex()).toBe(100);
    });
  });

  describe('Module 7 & 9: Column Input Locking & Validation', () => {
    it('evaluates keyboard state via VRA evaluation engine', () => {
      const exercise = {
        id: 'test_ex',
        type: 'addition' as const,
        minuend_or_addend1: 27,
        subtrahend_or_addend2: 15,
        requires_regrouping: true,
        target_block_state: { hundreds: 0, tens: 4, ones: 2 }
      };

      const result = evaluateKeyboardState(
        exercise,
        { hundreds: 0, tens: 4, ones: 2 },
        'LOCKED'
      );
      expect(result).toBe('UNLOCKED');
    });
  });
});
