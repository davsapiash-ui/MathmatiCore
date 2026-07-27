export type UserRole = 'TEACHER' | 'ADMIN';

export type KeyboardState = 'LOCKED' | 'UNLOCKED' | 'SOCRATIC_ONLY';

export type PathType = 'GREEN' | 'REDUCTION';

export type DisplayMode = 'EMBEDDED_COMPACT' | 'FULL_SCREEN_FOCUS' | 'HIDDEN';

export type GridResolution = 'EMPTY_LINE' | 'PARTIAL_GRID' | 'FULL_GRID';

export interface WhitelistDoc {
  id: string; // Hash or Email String
  email: string;
  school_name: string;
  max_classes: number;
  created_at: number;
}

export interface UserDoc {
  uid: string;
  roles: UserRole[];
  email_domain: string;
  school_id: string;
}

export interface CognitiveProfile {
  enhanced_support: boolean;
  scope: 'STUDENT' | 'CLASS';
}

export interface StudentSession {
  session_id: string;
  anonymous_student_id: number; // 1 to 35
  current_session_number: number; // 1 to 8
  assigned_path: PathType;
  cognitive_profile: CognitiveProfile;
  current_state: {
    keyboard_status: KeyboardState;
    hundreds_count: number;
    tens_count: number;
    ones_count: number;
  };
}

export type ActionType = 
  | 'block_split' 
  | 'block_group_success' 
  | 'undo_click' 
  | 'hesitation_timeout' 
  | 'socratic_dialogue';

export interface VectorReplayEvent {
  event_type: 'vector_replay';
  session_id: string;
  timestamp: number;
  interaction_data: {
    action_type: ActionType;
    details: {
      block_type?: 'hundreds_block' | 'tens_block' | 'ones_block';
      target_column?: 'hundreds' | 'tens' | 'ones';
      coordinates?: { x: number; y: number };
      duration_ms?: number;
    };
  };
  somatic_indicators: {
    hesitation_detected: boolean;
    undo_triggered: boolean;
  };
}
