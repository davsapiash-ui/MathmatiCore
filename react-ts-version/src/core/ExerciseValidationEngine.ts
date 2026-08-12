import type { ConcreteState, Exercise, KeyboardState } from '../domain/entities/Exercise';
import { stateReducer } from '../machines/craMachine';
import type { KeyboardState as CraKeyboardState } from '../types';

export interface TransitionEvent {
  block_group_success?: boolean;
  hesitation_timer_expire?: boolean;
  socratic_success?: boolean;
  undo_click?: boolean;
  blocked_attempts_count?: number;
  inactivity_timer_expired?: boolean;
}

/**
 * Validates the current concrete block values (hundreds, tens, ones) against mathematical/target state.
 */
export function validateConcreteState(
  currentState: ConcreteState,
  targetState: ConcreteState
): boolean {
  return (
    currentState.hundreds === targetState.hundreds &&
    currentState.tens === targetState.tens &&
    currentState.ones === targetState.ones
  );
}

/**
 * Executes state transitions for the Strict CRA Bridge keyboard state machine.
 */
export function transitionKeyboardState(
  currentState: KeyboardState,
  event: TransitionEvent
): KeyboardState {
  const hesitationExpired =
    Boolean(event.hesitation_timer_expire) ||
    Boolean(event.inactivity_timer_expired) ||
    (event.blocked_attempts_count !== undefined && event.blocked_attempts_count >= 3);

  const normalizedState: CraKeyboardState = currentState === 'Socratic Only' ? 'SOCRATIC_ONLY' : (currentState as CraKeyboardState);

  if (event.block_group_success) {
    return stateReducer(normalizedState, { type: 'BLOCK_GROUP_SUCCESS' });
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
 * Evaluates the concrete state against exercise requirements and returns the target KeyboardState.
 */
export function evaluateKeyboardState(
  exercise: Exercise,
  currentConcreteState: ConcreteState,
  currentKeyboardState: KeyboardState = 'LOCKED',
  event: TransitionEvent = {}
): KeyboardState {
  const isConcreteValid = validateConcreteState(
    currentConcreteState,
    exercise.target_concrete_state
  );

  const effectiveEvent: TransitionEvent = {
    ...event,
    block_group_success: event.block_group_success ?? isConcreteValid,
  };

  return transitionKeyboardState(currentKeyboardState, effectiveEvent);
}

/**
 * Pushes updated Q-Matrix diagnostic mastery values directly to Firebase upon task evaluation.
 */
export async function syncQMatrixEvaluation(studentId: string, qMatrixData: Record<string, any>) {
  if (!studentId) return;
  const { syncQMatrix, syncConceptMastery } = await import('../infrastructure/services/FirebaseSyncService');
  await syncQMatrix(studentId, qMatrixData).catch(console.error);
  await syncConceptMastery(studentId, qMatrixData).catch(console.error);
}
