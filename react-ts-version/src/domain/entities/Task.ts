export interface TaskChoice {
  id: string;
  textHe: string;
  correct?: boolean;
}

export interface MathTask {
  id: string;
  type: string; // 'session1_intro', 'addition_simple', 'place_value_zero', 'number_line', 'flexible_decomp', 'vertical_addition', 'small_change'
  titleHe: string;
  instructionHe: string;
  
  // Basic math fields
  numberA?: number;
  numberB?: number;
  correctAnswer?: number | string;
  isSubtraction?: boolean;
  
  // Specific to certain tasks
  number?: number;
  thoughtQuestionHe?: string;
  choices?: TaskChoice[];
  correctChoice?: string;
  hintHe?: string;
  scaffoldLevel?: number;

  // Q-Matrix backward diagnosis
  backwardDiagnosis?: any;
  
  // Added fields
  expectedResult?: number | string;
  initialBlocks?: {
    thousands: number;
    hundreds: number;
    tens: number;
    ones: number;
  };
}
