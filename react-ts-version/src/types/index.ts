// Core TypeScript Interfaces & Data Contracts — Master PRD v6.3 (Appendix A)

export * from './telemetry';
export * from './dashboard';

// --- 1. Auth & User Identity Schemas (Appendix A §1) ---

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface AnonymousStudent {
  student_id: number; // Strictly 1 to 12
  class_id: string;
  school_id: string;
  created_at: number; // Client/Server timestamp
  support_profile_id: string | null;
  support_profile_version: number;
  support_profile_updated_at: number | null; // required by Module 19
  support_profile_updated_by: string | null; // teacher_id; required by Module 19
  active_session_id: string | null;
}

// --- 2. Firestore Document Schemas (Appendix A §2) ---

export interface ClassDocument {
  class_id: string;
  school_id: string;
  class_name: 'המבקרים'; // Strictly set for pilot
  class_type: string;
  active_session_id: string | null;
  projector_mode: boolean;
  projector_mode_updated_at: number;
  updated_by_teacher_id: string | null;
}

export type PedagogicalPath = 'green_path' | 'remediation_path';

export interface SessionDocument {
  session_id: string;
  class_id: string;
  session_number: number; // 1 to 8
  session_start_time: number;
  session_deadline_time: number;
  active_exercise_id: string;
  is_completed: boolean;
  session_score_percent: number | null; // (compulsory exercises correct on first attempt / 7) * 100
  teacher_gate_approved: boolean;
  gate_approved_at: number | null;
  gate_approved_by: string | null;
  teacher_selected_path: PedagogicalPath | null;
  matrix_recommended_path: PedagogicalPath | null;
}

// --- 3. SRL Reflection Board Schemas (Appendix A §4) ---

export interface SRLReflectionState {
  session_id: string;
  student_id: number;
  reflection_step: 1 | 2 | 3;
  effort_score: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  selected_strategies: Array<'UNDO_BUTTON' | 'MEMORY_CIRCLES' | 'SOCRATIC_CARD'>;
  persistence_index: number; // Calculated value 0-100: (U / (U + E + G)) * 100
  reflection_completed: boolean;
  reflection_updated_at: number;
  idempotency_key: string;
}

// --- 4. VRA Workspace State Machine Types (Appendix A §5) ---

export type VRAWorkspaceState =
  | 'IDLE'
  | 'PROBLEM_ACTIVE'
  | 'REGROUPING_ACTIVE'
  | 'SOCRATIC_ACTIVE'
  | 'COMPLETE';

export interface VRAWorkspaceStore {
  currentState: VRAWorkspaceState;
  activeColumnIndex: number; // 0: Ones, 1: Tens, 2: Hundreds
  onesCount: number;
  tensCount: number;
  hundredsCount: number;
  memoryCircles: Record<number, number>;
  undoStack: Array<Record<string, unknown>>; // Restricted to max 10
  hesitationTimerSeconds: number;
  consecutiveErrorCount: number;
  isSocraticCardLocked: boolean;
  socraticLockDeadline: number | null;
  // Action Handlers
  transitionTo: (newState: VRAWorkspaceState) => void;
  resetHesitationTimer: () => void;
  pushUndoSnapshot: (snapshot: Record<string, unknown>) => void;
  popUndoSnapshot: () => Record<string, unknown> | null;
}

// --- 5. Gemini Socratic Contract (Appendix A §6 & Module 13) ---

import type { TelemetryEventType, TelemetryPayload } from './telemetry';

export interface GeminiSocraticRequest {
  student_id: number; // Strictly 1-12
  session_id: string;
  exercise_id: string;
  active_column_index: number;
  workspace_state: {
    ones_count: number;
    tens_count: number;
    hundreds_count: number;
    memory_circles: Record<string, number>;
  };
  recent_actions: TelemetryPayload<TelemetryEventType>[];
}

export interface GeminiSocraticOption {
  id: 'opt_1' | 'opt_2' | 'opt_3';
  option_text: string;
  feedback_text: string;
  is_correct: boolean;
}

export interface GeminiSocraticResponse {
  guiding_question: string;
  options: [GeminiSocraticOption, GeminiSocraticOption, GeminiSocraticOption];
}

// --- Legacy / Compatibility Helpers for Existing Stores ---

export type KeyboardState = 'LOCKED' | 'UNLOCKED' | 'SOCRATIC_ONLY';
export type PathType = 'GREEN' | 'REDUCTION';
export type DisplayMode = 'EMBEDDED_COMPACT' | 'FULL_SCREEN_FOCUS' | 'HIDDEN';
export type GridResolution = 'EMPTY_LINE' | 'PARTIAL_GRID' | 'FULL_GRID';

export interface WhitelistDoc {
  id: string;
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
