import { describe, it, expect } from 'vitest';
import type { Exercise, ConcreteState } from '../../domain/entities/Exercise';
import {
  validateConcreteState,
  transitionKeyboardState,
  evaluateKeyboardState,
} from '../ExerciseValidationEngine';

describe('ExerciseValidationEngine', () => {
  const mockExercise: Exercise = {
    id: 'ex_sub_01',
    type: 'subtraction',
    minuend_or_addend1: 524,
    subtrahend_or_addend2: 268,
    requires_regrouping: true,
    target_concrete_state: {
      hundreds: 4,
      tens: 11,
      ones: 14,
    },
  };

  describe('validateConcreteState', () => {
    it('should return true when concrete block values match mathematical targets', () => {
      const currentState: ConcreteState = { hundreds: 4, tens: 11, ones: 14 };
      expect(validateConcreteState(currentState, mockExercise.target_concrete_state)).toBe(true);
    });

    it('should return false when concrete block values do not match mathematical targets', () => {
      const currentState: ConcreteState = { hundreds: 5, tens: 2, ones: 4 };
      expect(validateConcreteState(currentState, mockExercise.target_concrete_state)).toBe(false);
    });
  });

  describe('transitionKeyboardState', () => {
    it('should transition LOCKED -> UNLOCKED upon valid regrouping / block_group_success', () => {
      const nextState = transitionKeyboardState('LOCKED', { block_group_success: true });
      expect(nextState).toBe('UNLOCKED');
    });

    it('should transition LOCKED -> Socratic Only upon hesitation timeout (hesitation_timer_expire)', () => {
      const nextState = transitionKeyboardState('LOCKED', { hesitation_timer_expire: true });
      expect(nextState).toBe('Socratic Only');
    });

    it('should transition LOCKED -> Socratic Only upon 3 blocked attempts', () => {
      const nextState = transitionKeyboardState('LOCKED', { blocked_attempts_count: 3 });
      expect(nextState).toBe('Socratic Only');
    });

    it('should transition Socratic Only -> UNLOCKED upon Socratic question success', () => {
      const nextState = transitionKeyboardState('Socratic Only', { socratic_success: true });
      expect(nextState).toBe('UNLOCKED');
    });

    it('should transition UNLOCKED -> LOCKED upon undo_click revert', () => {
      const nextState = transitionKeyboardState('UNLOCKED', { undo_click: true });
      expect(nextState).toBe('LOCKED');
    });

    it('should remain LOCKED if no transition conditions are met', () => {
      const nextState = transitionKeyboardState('LOCKED', {});
      expect(nextState).toBe('LOCKED');
    });
  });

  describe('evaluateKeyboardState', () => {
    it('should evaluate state transition from LOCKED to UNLOCKED when concrete state matches target', () => {
      const validState: ConcreteState = { hundreds: 4, tens: 11, ones: 14 };
      const nextState = evaluateKeyboardState(mockExercise, validState, 'LOCKED');
      expect(nextState).toBe('UNLOCKED');
    });

    it('should evaluate state transition from LOCKED to Socratic Only when hesitation occurs', () => {
      const invalidState: ConcreteState = { hundreds: 5, tens: 2, ones: 4 };
      const nextState = evaluateKeyboardState(mockExercise, invalidState, 'LOCKED', {
        hesitation_timer_expire: true,
      });
      expect(nextState).toBe('Socratic Only');
    });

    it('should transition UNLOCKED back to LOCKED when undo_click is performed on invalid concrete state', () => {
      const invalidState: ConcreteState = { hundreds: 5, tens: 2, ones: 4 };
      const nextState = evaluateKeyboardState(mockExercise, invalidState, 'UNLOCKED', {
        undo_click: true,
      });
      expect(nextState).toBe('LOCKED');
    });
  });
});
