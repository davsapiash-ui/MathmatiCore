export interface ConcreteState {
  hundreds: number;
  tens: number;
  ones: number;
}

export interface Exercise {
  id: string;
  type: 'addition' | 'subtraction';
  minuend_or_addend1: number;
  subtrahend_or_addend2: number;
  requires_regrouping: boolean;
  target_concrete_state: ConcreteState;
}

export type KeyboardState = 'LOCKED' | 'UNLOCKED' | 'SOCRATIC_ONLY' | 'Socratic Only';
