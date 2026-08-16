import type { DigitalBlockState, Exercise, KeyboardState } from '../domain/entities/Exercise';
import { stateReducer } from '../machines/vraMachine';
import type { KeyboardState as VraKeyboardState } from '../types';

export interface TransitionEvent {
  place_value_conversion_success?: boolean;
  block_group_success?: boolean;
  hesitation_timer_expire?: boolean;
  socratic_success?: boolean;
  undo_click?: boolean;
  blocked_attempts_count?: number;
  inactivity_timer_expired?: boolean;
}

/**
 * Validates the current digital block values (hundreds, tens, ones) against mathematical/target state in the VRA model.
 */
export function validateBlockState(
  currentState: DigitalBlockState,
  targetState?: DigitalBlockState
): boolean {
  if (!targetState) return false;
  return (
    currentState.hundreds === targetState.hundreds &&
    currentState.tens === targetState.tens &&
    currentState.ones === targetState.ones
  );
}

// Alias for backward compatibility
export const validateConcreteState = validateBlockState;

/**
 * Executes state transitions for the Strict VRA Bridge keyboard state machine.
 */
export function transitionKeyboardState(
  currentState: KeyboardState,
  event: TransitionEvent
): KeyboardState {
  const hesitationExpired =
    Boolean(event.hesitation_timer_expire) ||
    Boolean(event.inactivity_timer_expired) ||
    (event.blocked_attempts_count !== undefined && event.blocked_attempts_count >= 3);

  const normalizedState: VraKeyboardState = currentState === 'Socratic Only' ? 'SOCRATIC_ONLY' : (currentState as VraKeyboardState);

  if (event.place_value_conversion_success || event.block_group_success) {
    return stateReducer(normalizedState, { type: 'PLACE_VALUE_CONVERSION_SUCCESS' });
  }
  if (event.socratic_success) {
    return stateReducer(normalizedState, { type: 'SOCRATIC_SUCCESS' });
  }
  if (event.undo_click) {
    return stateReducer(normalizedState, { type: 'UNDO_CLICK' });
  }
  if (hesitationExpired) {
    return stateReducer(normalizedState, { type: 'HESITATION_TIMER_EXPIRE' });
  }
  return normalizedState;
}

/**
 * Evaluates the digital block state against exercise requirements and returns the target KeyboardState.
 */
export function evaluateKeyboardState(
  exercise: Exercise,
  currentBlockState: DigitalBlockState,
  currentKeyboardState: KeyboardState = 'LOCKED',
  event: TransitionEvent = {}
): KeyboardState {
  const target = exercise.target_block_state || exercise.target_concrete_state || { hundreds: 0, tens: 0, ones: 0 };
  const isBlockValid = validateBlockState(currentBlockState, target);

  const effectiveEvent: TransitionEvent = {
    ...event,
    place_value_conversion_success: event.place_value_conversion_success ?? event.block_group_success ?? isBlockValid,
  };

  return transitionKeyboardState(currentKeyboardState, effectiveEvent);
}

import { syncQMatrix, syncConceptMastery } from '../infrastructure/services/FirebaseSyncService';

/**
 * Pushes updated Q-Matrix diagnostic mastery values directly to Firebase upon task evaluation.
 */
export async function syncQMatrixEvaluation(studentId: string, qMatrixData: Record<string, any>) {
  if (!studentId) return;
  await syncQMatrix(studentId, qMatrixData).catch(console.error);
  await syncConceptMastery(studentId, qMatrixData).catch(console.error);
}

/**
 * Enforces a 60-second penalty lockout timer when a student chooses a wrong distractor option.
 */
export function executeDistractorPenaltyLockout(
  onLock: () => void,
  onUnlock: () => void,
  durationMs: number = 60000
): () => void {
  onLock();
  const timer = setTimeout(() => {
    onUnlock();
  }, durationMs);
  return () => clearTimeout(timer);
}
