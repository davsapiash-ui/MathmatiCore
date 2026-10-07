// Telemetry and Offline Queue Contracts per Master PRD v7.0 (Appendix A §3 & Module 5)

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
  | 'REFLECTION_SUBMITTED'
  // Scaffold events beyond Appendix A §3 (owner, 16.9.2026 — register deviation 19):
  // the three supports the research needs to see fade.
  | 'ADAPTIVE_GRID_TOGGLED'
  | 'KEYBOARD_LOCK_BLOCKED'
  | 'HELP_REQUESTED'
  | 'BOARD_CLEARED'
  // Owner, 30.9.2026 (register deviation 28): the result row's place cues shown
  // as a scaffold after a digit in the wrong place (stations 3–7).
  | 'PLACE_CUES_SHOWN'
  // Owner, 30.9.2026: the learner took the silent help call back (research data only).
  | 'HELP_WITHDRAWN'
  // Owner, 1.10.2026: a request for help from the chat, with its exercise; help in measure 2א.
  | 'CHAT_HELP_REQUESTED';

// --- Per-event-type details schemas (Master PRD v7.0 Appendix A §3) ---

export interface SessionStartDetails {
  session_number: number; // 1 to 8
}

export interface ProblemLoadDetails {
  exercise_template_id: string;
  path_type: 'compulsory' | 'consolidation' | 'challenge';
}

export interface BlockDragCompleteDetails {
  block_value: number; // Strictly 1, 10, 100, or 1000
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
  is_correct: boolean | null; // null when the exercise defines no target digit for that column
  /** Set when the digit was typed in a carry (memory) circle; absent for the result and operand rows. */
  input_target?: DigitInputTarget;
}

export interface DigitDeletedDetails {
  deleted_digit_value: number | null;
  /** Set when the digit was deleted from a carry (memory) circle. */
  input_target?: DigitInputTarget;
}

/** Where a digit event happened when it was not a row of the exercise (PRD Module 21: "הזנה בעיגולי זיכרון"). */
export type DigitInputTarget = 'carry_circle';

export interface UndoExecutedDetails {
  undo_stack_depth_before: number; // 1-10
  reverted_event_type: TelemetryEventType;
}

export interface HesitationDetectedDetails {
  hesitation_seconds: number; // >= 45
}

export interface SocraticCardShownDetails {
  trigger_reason: 'hesitation_45s' | 'consecutive_errors_4' | 'consecutive_undos_3' | 'conversion_not_performed' | 'repeated_errors';
  error_category: 'calculation' | 'procedural' | 'conceptual' | null;
  /**
   * 1.10.2026: whether the AI engine wrote the card or the static card was
   * shown (timeout, failure, a refused card, no network), and which model
   * wrote it. Until that day every card was static (the model id was
   * retired); the research export must tell them apart from now on.
   * Absent on events recorded before the field existed.
   */
  card_source?: 'ai' | 'static';
  model_id?: string | null;
  /** The situation the static selection recognised — the card's frame, shared by the AI card written inside it. */
  card_situation?: string;
  /** The frame's level: 1 general, 2 names the column, 3 names the action. */
  card_level?: 1 | 2 | 3;
  /**
   * 2.10.2026: the card's text as the child saw it — the guiding question and
   * the three options in id order (opt_1, opt_2, opt_3) — so the pilot's real
   * cards can be reviewed. Generated text (the engine's or the static card),
   * never the learner's. Absent on events recorded before the field existed.
   */
  card_question_he?: string;
  card_options_he?: string[];
  /**
   * 7.10.2026, owner: on a static card, why the engine's card was not shown
   * (SocraticEngine.SocraticFallbackReason), and a short code beside it (the
   * server's error code or the refused content rule). Absent on the engine's
   * card and on events recorded before the field existed.
   */
  card_fallback_reason?: 'offline' | 'timeout' | 'server_failed' | 'schema_rejected' | 'rule_rejected' | 'board_changed' | 'not_coached' | 'error';
  card_fallback_detail?: string;
  /** How long the hourglass turned before the card appeared, in ms. */
  card_wait_ms?: number;
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

/** Module 10 grid: opened by the 30s hesitation stage, or brought back by the learner (מסמך 03 §1.3 ב'); closed by the learner's X. */
export interface AdaptiveGridToggledDetails {
  action: 'opened' | 'closed';
  source: 'hesitation_30s' | 'learner';
}

/** Module 9: the learner tried to type a result digit in a column whose conversion has not been made on the canvas. */
export interface KeyboardLockBlockedDetails {
  conversion_required: 'composition' | 'decomposition';
}

/** The silent call to the teacher (Module 18 blue signal). */
export interface HelpRequestedDetails {
  help_count: number; // this learner's count in the current session, 1-based
}

/**
 * The learner took the silent call back with a second press (owner,
 * 30.9.2026). Research data only: the call still counts as help in measure 2א.
 */
export interface HelpWithdrawnDetails {
  help_count: number; // this exercise's count of calls (0 when the call was made in an earlier exercise)
}

/**
 * A request for help from the chat (owner, 1.10.2026): "קראו למורה" or the
 * ready message "אפשר עזרה בתרגיל?". The exercise is the event's exercise_id.
 * Help in measure 2א, like the silent help button (owner, 1.10.2026).
 */
export interface ChatHelpRequestedDetails {
  kind: 'call' | 'ready_message';
}

/**
 * מודול 8 §א: לחיצה על פח האשפה מנקה את כל הלוח. האירוע תקני ומסונכרן,
 * ומוחרג ממדדי השגיאות והשחיקה — בדיוק כמו ביטול פעולה.
 */
export interface BoardClearedDetails {
  /** כמה לבנים נמחקו מכל טור, כדי שציר הזמן יראה מה בדיוק ירד מהלוח. */
  units: number;
  tens: number;
  hundreds: number;
  thousands: number;
  /** סך הלבנים שנמחקו — הנתון שמסכם את הפעולה בשורה אחת. */
  blocks_removed: number;
}

/** Register deviation 28: which profile saw the scaffold (regular: colours + labels; enhanced: labels). */
export interface PlaceCuesShownDetails {
  profile: 'regular' | 'enhanced';
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
  ADAPTIVE_GRID_TOGGLED: AdaptiveGridToggledDetails;
  KEYBOARD_LOCK_BLOCKED: KeyboardLockBlockedDetails;
  HELP_REQUESTED: HelpRequestedDetails;
  HELP_WITHDRAWN: HelpWithdrawnDetails;
  CHAT_HELP_REQUESTED: ChatHelpRequestedDetails;
  BOARD_CLEARED: BoardClearedDetails;
  PLACE_CUES_SHOWN: PlaceCuesShownDetails;
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
  'KEYBOARD_LOCK_BLOCKED',
] as const;

// Session / Exercise / Global event types where column_index must be OMITTED
export const NON_COLUMN_EVENTS: readonly TelemetryEventType[] = [
  'SESSION_START',
  'PROBLEM_LOAD',
  'SOCRATIC_OPTION_SELECTED',
  'PROBLEM_COMPLETE',
  'REFLECTION_SUBMITTED',
  'ADAPTIVE_GRID_TOGGLED',
  'HELP_REQUESTED',
  'HELP_WITHDRAWN',
  'CHAT_HELP_REQUESTED',
  // ניקוי הלוח אינו שייך לטור אחד — הוא מוחק את כולם.
  'BOARD_CLEARED',
  // The scaffold lights the whole result row, not one column.
  'PLACE_CUES_SHOWN',
] as const;

export interface TelemetryPayload<T extends TelemetryEventType = TelemetryEventType> {
  idempotency_key: string; // Unique UUID used directly as Firestore Document ID
  client_timestamp: number;
  session_id: string;
  student_id: number; // Strictly 1-12
  exercise_id: string;
  event_type: T;
  column_index?: number; // 0: Ones, 1: Tens, 2: Hundreds, 3: Thousands — required for column-scoped events, omitted otherwise
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
      reason: `Event type '${payload.event_type}' requires a valid column_index (0, 1, 2, or 3).`,
    };
  }

  if (isNonColumn && payload.column_index !== undefined) {
    return {
      isValid: false,
      reason: `Event type '${payload.event_type}' must not include column_index.`,
    };
  }

  if (payload.column_index !== undefined && ![0, 1, 2, 3].includes(payload.column_index)) {
    return {
      isValid: false,
      reason: `column_index must be strictly 0 (Ones), 1 (Tens), 2 (Hundreds), or 3 (Thousands). Received: ${payload.column_index}`,
    };
  }

  return { isValid: true };
}
