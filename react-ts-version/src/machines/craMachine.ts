import { KeyboardState } from '../types';

export type SystemEvent = 
  | { type: 'BLOCK_GROUP_SUCCESS' }
  | { type: 'BLOCK_SPLIT_SUCCESS' }
  | { type: 'HESITATION_TIMER_EXPIRE' }
  | { type: 'SOCRATIC_SUCCESS' }
  | { type: 'UNDO_CLICK' };

export const stateReducer = (currentState: KeyboardState, event: SystemEvent): KeyboardState => {
  switch (currentState) {
    case 'LOCKED':
      if (event.type === 'BLOCK_GROUP_SUCCESS' || event.type === 'BLOCK_SPLIT_SUCCESS') {
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
        return 'LOCKED'; // Undo Reset Guard - Prevents CRA Bypass
      }
      return 'UNLOCKED';

    default:
      return currentState;
  }
};
