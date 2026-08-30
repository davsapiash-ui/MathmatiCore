// Core TypeScript Interfaces & Data Contracts — Master PRD v07 (Appendix A)

export * from './telemetry';
export * from './dashboard';

// --- 1. Auth & User Identity Schemas (Appendix A §1) ---

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface AnonymousStudent {
  student_id: number; // Strictly 1 to 12
  class_id: string;
  school_id: string;
  created_at: number; // Client/Server timestamp
  support_profile_id: 'enhanced_cognitive_support' | null;
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
  teacher_selected_path: 'green_path' | 'remediation_path' | null;
  matrix_recommended_path: 'green_path' | 'remediation_path' | null;
}

export interface ExerciseTemplate {
  exercise_template_id: string;
  session_number: number; // 1 to 8
  order_index: number; // 1 to 7 for compulsory
  learning_path: 'green_path' | 'remediation_path';
  path_type: 'compulsory' | 'consolidation' | 'challenge';
  operation: 'addition' | 'subtraction' | 'representation' | 'inquiry';
  operand_a: number;
  operand_b: number | null;
  expected_result: number;
  required_regroupings: number; // 0 to 3
  regrouping_columns: number[]; // column indices requiring regrouping
  label: string;
  blocks_visible: boolean;
  socratic_enabled: boolean;
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
  activeColumnIndex: number; // 0: Ones, 1: Tens, 2: Hundreds, 3: Thousands
  onesCount: number;
  tensCount: number;
  hundredsCount: number;
  thousandsCount: number;
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
  exercise_context?: {
    operation: 'addition' | 'subtraction';
    number_a: number;
    number_b: number;
    session_id: string;
    session_topic: string;
    active_column: 'units' | 'tens' | 'hundreds' | 'thousands';
    active_column_index: number;
    target_sub_problem: string;
  };
  workspace_state: {
    ones_count: number;
    tens_count: number;
    hundreds_count: number;
    thousands_count: number;
    memory_circles: Record<string, number>;
    is_regrouped_in_canvas?: boolean;
  };
  student_progress_state?: {
    completed_columns: string[];
    current_column_input: string | null;
    memory_circles_state: Record<string, number>;
    trigger_reason: 'hesitation_45s' | 'consecutive_errors_4' | 'consecutive_undos_3';
    consecutive_errors_count: number;
    recent_actions: TelemetryPayload<TelemetryEventType>[];
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
  error_category: 'calculation' | 'procedural' | 'conceptual';
  guiding_question: string;
  options: [GeminiSocraticOption, GeminiSocraticOption, GeminiSocraticOption];
}

// --- 6. Gemini Pedagogical Report Contract (Appendix A §7 & Module 23) ---

export interface GeminiReportRequest {
  student_id: number; // Strictly 1-12
  session_id: string;
  session_number: number;
  session_score_percent: number;
  recommendation_tier: 'below_50' | 'between_50_75' | 'above_75';
  failed_exercises: ExerciseTemplate[];
  telemetry_summary: TelemetryPayload<TelemetryEventType>[];
}

export interface GeminiReportResponse {
  knowledge_gaps: string[];
  teaching_recommendations: string[];
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

// --- 7. Data Reset, Backup & Audit Trail Schemas (Module 23א) ---

export const VALID_RESET_REASONS = [
  'technical_fault',
  'student_stuck',
  'restart_session',
  'test_run',
  'other',
] as const;

export type ResetReason = typeof VALID_RESET_REASONS[number];

export interface ResetAuditEntry {
  reset_id: string;
  reset_level: 'alerts' | 'single_student' | 'system' | 'export';
  performed_by_teacher_id: string;
  performed_at: number;
  class_id: string;
  affected_student_ids: number[];
  backup_file_url: string | null;
  backup_status: 'success' | 'failed' | 'not_required';
  reset_reason: ResetReason;
  reason_note: string | null;
  records_deleted_count: number;
}
