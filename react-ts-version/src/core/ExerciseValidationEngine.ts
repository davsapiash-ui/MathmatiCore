import { ConcreteState, Exercise, KeyboardState } from '../domain/entities/Exercise';

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

  switch (currentState) {
    case 'LOCKED':
      if (event.block_group_success) {
        return 'UNLOCKED';
      }
      if (hesitationExpired) {
        return 'Socratic Only';
      }
      return 'LOCKED';

    case 'Socratic Only':
      if (event.socratic_success) {
        return 'UNLOCKED';
      }
      return 'Socratic Only';

    case 'UNLOCKED':
      if (event.undo_click) {
        return 'LOCKED';
      }
      return 'UNLOCKED';

    default:
      return currentState;
  }
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
