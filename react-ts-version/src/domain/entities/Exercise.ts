export interface DigitalBlockState {
  hundreds: number;
  tens: number;
  ones: number;
}

// Type alias for VRA transition
export type ConcreteState = DigitalBlockState;

export interface Exercise {
  id: string;
  type: 'addition' | 'subtraction';
  minuend_or_addend1: number;
  subtrahend_or_addend2: number;
  requires_regrouping: boolean;
  target_concrete_state?: DigitalBlockState;
  target_block_state?: DigitalBlockState;
}

export type KeyboardState = 'LOCKED' | 'UNLOCKED' | 'SOCRATIC_ONLY' | 'Socratic Only';

