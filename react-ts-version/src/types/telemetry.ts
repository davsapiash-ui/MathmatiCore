// Telemetry and Offline Queue Contracts per Master PRD v6.3 (Appendix A §3 & Module 5)

export type TelemetryEventType =
  | 'SESSION_START'
  | 'PROBLEM_LOAD'
  | 'BLOCK_DRAG_COMPLETE'
  | 'REGROUPING_TRIGGERED'
  | 'REGROUPING_SUCCESS'
  | 'DIGIT_ENTERED'
  | 'DIGIT_DELETED'
  | 'UNDO_EXECUTED'
  | 'HESITATION_DETECTED'
  | 'SOCRATIC_CARD_SHOWN'
  | 'SOCRATIC_OPTION_SELECTED'
  | 'PROBLEM_COMPLETE'
  | 'REFLECTION_SUBMITTED';

// --- Per-event-type details schemas (Master PRD v6.3 Appendix A §3) ---

export interface SessionStartDetails {
  session_number: number; // 1 to 8
}

export interface ProblemLoadDetails {
  exercise_template_id: string;
  path_type: 'compulsory' | 'consolidation' | 'challenge';
}

export interface BlockDragCompleteDetails {
  block_value: number; // 1, 10, or 100
  source_column_index: number | null; // populated only for cross-column drags (regrouping)
}

export interface RegroupingTriggeredDetails {
  regrouping_type: 'decomposition' | 'composition';
}

export interface RegroupingSuccessDetails {
  regrouping_type: 'decomposition' | 'composition';
  duration_ms: number;
}

export interface DigitEnteredDetails {
  digit_value: number; // 0-9
  is_correct: boolean; // required — sole source for computing E in Persistence Index (Module 16)
}

export interface DigitDeletedDetails {
  deleted_digit_value: number | null;
}

export interface UndoExecutedDetails {
  undo_stack_depth_before: number; // 1-10
  reverted_event_type: TelemetryEventType;
}

export interface HesitationDetectedDetails {
  hesitation_seconds: number; // >= 45
}

export interface SocraticCardShownDetails {
  trigger_reason: 'hesitation_45s' | 'consecutive_errors_4';
}

export interface SocraticOptionSelectedDetails {
  option_id: 'opt_1' | 'opt_2' | 'opt_3';
  is_correct: boolean; // sole source for computing G in Persistence Index (Module 16)
}

export interface ProblemCompleteDetails {
  total_duration_ms: number;
  undo_count: number;
  error_count: number;
}

export interface ReflectionSubmittedDetails {
  reflection_step: 1 | 2 | 3;
  effort_score: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  selected_strategies: Array<'UNDO_BUTTON' | 'MEMORY_CIRCLES' | 'SOCRATIC_CARD'> | null;
  persistence_index: number | null; // 0-100
}

export interface TelemetryDetailsMap {
  SESSION_START: SessionStartDetails;
  PROBLEM_LOAD: ProblemLoadDetails;
  BLOCK_DRAG_COMPLETE: BlockDragCompleteDetails;
  REGROUPING_TRIGGERED: RegroupingTriggeredDetails;
  REGROUPING_SUCCESS: RegroupingSuccessDetails;
  DIGIT_ENTERED: DigitEnteredDetails;
  DIGIT_DELETED: DigitDeletedDetails;
  UNDO_EXECUTED: UndoExecutedDetails;
  HESITATION_DETECTED: HesitationDetectedDetails;
  SOCRATIC_CARD_SHOWN: SocraticCardShownDetails;
  SOCRATIC_OPTION_SELECTED: SocraticOptionSelectedDetails;
  PROBLEM_COMPLETE: ProblemCompleteDetails;
  REFLECTION_SUBMITTED: ReflectionSubmittedDetails;
}

// Column-scoped event types where column_index is MANDATORY
export const COLUMN_SCOPED_EVENTS: readonly TelemetryEventType[] = [
  'BLOCK_DRAG_COMPLETE',
  'REGROUPING_TRIGGERED',
  'REGROUPING_SUCCESS',
  'DIGIT_ENTERED',
  'DIGIT_DELETED',
  'HESITATION_DETECTED',
  'SOCRATIC_CARD_SHOWN',
] as const;

// Session / Exercise / Global event types where column_index must be OMITTED
export const NON_COLUMN_EVENTS: readonly TelemetryEventType[] = [
  'SESSION_START',
  'PROBLEM_LOAD',
  'SOCRATIC_OPTION_SELECTED',
  'PROBLEM_COMPLETE',
  'REFLECTION_SUBMITTED',
] as const;

export interface TelemetryPayload<T extends TelemetryEventType = TelemetryEventType> {
  idempotency_key: string; // Unique UUID used directly as Firestore Document ID
  client_timestamp: number;
  session_id: string;
  student_id: number; // Strictly 1-12
  exercise_id: string;
  event_type: T;
  column_index?: number; // 0: Ones, 1: Tens, 2: Hundreds — required for column-scoped events, omitted otherwise
  details: TelemetryDetailsMap[T];
}

export interface OfflineQueueItem {
  idempotency_key: string; // Unique UUID
  client_timestamp: number;
  session_id: string;
  student_id: number;
  exercise_id: string;
  operation_type: TelemetryEventType;
  payload: TelemetryDetailsMap[TelemetryEventType];
  retry_count: number;
}

/**
 * Validates whether a given telemetry payload adheres to the column_index rule (Module 5 §C / Module 27)
 */
export function validateTelemetryColumnIndexRule<T extends TelemetryEventType>(
  payload: TelemetryPayload<T>
): { isValid: boolean; reason?: string } {
  const isColumnScoped = COLUMN_SCOPED_EVENTS.includes(payload.event_type);
  const isNonColumn = NON_COLUMN_EVENTS.includes(payload.event_type);

  if (isColumnScoped && (payload.column_index === undefined || payload.column_index === null)) {
    return {
      isValid: false,
      reason: `Event type '${payload.event_type}' requires a valid column_index (0, 1, or 2).`,
    };
  }

  if (isNonColumn && payload.column_index !== undefined) {
    return {
      isValid: false,
      reason: `Event type '${payload.event_type}' must not include column_index.`,
    };
  }

  if (payload.column_index !== undefined && ![0, 1, 2].includes(payload.column_index)) {
    return {
      isValid: false,
      reason: `column_index must be strictly 0 (Ones), 1 (Tens), or 2 (Hundreds). Received: ${payload.column_index}`,
    };
  }

  return { isValid: true };
}
