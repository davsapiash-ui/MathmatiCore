import type { KeyboardState } from '../types';

export type SystemEvent = 
  | { type: 'PLACE_VALUE_CONVERSION_SUCCESS' }
  | { type: 'PLACE_VALUE_CONVERSION' }
  | { type: 'BLOCK_GROUP_SUCCESS' }
  | { type: 'BLOCK_SPLIT_SUCCESS' }
  | { type: 'HESITATION_TIMER_EXPIRE' }
  | { type: 'SOCRATIC_SUCCESS' }
  | { type: 'UNDO_CLICK' };

/**
 * VRA Digital Pedagogical State Machine.
 * Manages transitions between LOCKED, UNLOCKED, and SOCRATIC_ONLY states
 * based strictly on VRA digital manipulations and logical conversion events.
 */
export const stateReducer = (currentState: KeyboardState, event: SystemEvent): KeyboardState => {
  switch (currentState) {
    case 'LOCKED':
      if (
        event.type === 'PLACE_VALUE_CONVERSION_SUCCESS' ||
        event.type === 'PLACE_VALUE_CONVERSION' ||
        event.type === 'BLOCK_GROUP_SUCCESS' ||
        event.type === 'BLOCK_SPLIT_SUCCESS'
      ) {
        return 'UNLOCKED';
      }
      if (event.type === 'HESITATION_TIMER_EXPIRE') {
        return 'SOCRATIC_ONLY';
      }
      return 'LOCKED';

    case 'SOCRATIC_ONLY':
      if (event.type === 'SOCRATIC_SUCCESS') {
        return 'UNLOCKED';
      }
      return 'SOCRATIC_ONLY';

    case 'UNLOCKED':
      if (event.type === 'UNDO_CLICK') {
        return 'LOCKED'; // Undo Reset Guard - Prevents VRA Bypass
      }
      return 'UNLOCKED';

    default:
      return currentState;
  }
};
