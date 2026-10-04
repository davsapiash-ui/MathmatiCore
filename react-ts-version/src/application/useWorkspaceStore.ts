/**
 * useWorkspaceStore — single source of truth for the student workspace session.
 * Faithful port of the vanilla behavior (vanilla_audit/js/app.js + manipulatives.js):
 * board counts + undo snapshots, standard task flow (sessions 1/3/4), the Q-Matrix
 * two-phase flow (session 2), overlays (feedback / help), and scaffold effects.
 * All math rules live in core/placeValue.ts; all flow rules in core/qmatrixFlow.ts.
 */

import { PROCEED_HE } from '@/core/toolbarNames';
import { create } from 'zustand';
import {
  EMPTY_COUNTS,
  getValue,
  removeBlock,
  resolveDrop,
  splitBlockClick,
  groupBlocksManually,
  PLACE_ORDER,
  PLACE_VALUES,
  PLACE_NAMES_HE,
  type DropInput,
  type Place,
  type PlaceCounts,
  countsEqual,
  digitAt,
} from '@/core/placeValue';
import { BLOCK_NAME_HE, NO_UNIT_BLOCKS_SUB_HE, NO_UNIT_BLOCKS_TITLE_HE } from '@/data/taskBuilders';
import { session1Checklist, session1DoneNoteHe, session1NextStep } from '@/core/session1Checklist';
import {
  advance,
  getCurrentQTask,
  getEffectiveChoices,
  getEffectiveNumber,
  getExpectedBlocks,
  initQFlow,
  hasProbeExercise,
  isSubtaskActive,
  qMatrixValue,
  recordResult,
  restoredQFlow,
  settlePendingQResults,
  type QFlowEvent,
  type QMatrixFlowState,
} from '@/core/qmatrixFlow';
import { stateReducer } from '@/machines/vraMachine';
import { computeCognitiveMastery, TASKS } from '@/core/QMatrix';
import { useStore } from '@/application/useStore';
import { announceRegroup, REGROUP_ANIMATION_MS } from '@/application/useRegroupAnimationStore';
import { useAuthStore, currentStudentUid } from '@/application/useAuthStore';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { useTeacherGenderStore } from '@/application/useTeacherGender';
import { teacherSentenceHe } from '@/core/teacherGender';
import { syncQMatrixEvaluation } from '@/core/ExerciseValidationEngine';
import { getSessionTasks, SESSION1_TASKS, type SessionTask, type LearningPath } from '@/data/sessionTasks';
import { boardStaysOpen } from '@/core/boardVisibility';
import { isPlaceError, resultBoxCount } from '@/core/placeCues';
import { heldFromNumber } from '@/core/columnFocus';
import { curriculumCatalog } from '@/infrastructure/services/CurriculumCatalogService';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { SocraticEngine, SOCRATIC_PROXY_TIMEOUT_MS, type SocraticHintResponse, type SocraticMonitoringSnapshot } from '@/infrastructure/services/SocraticEngine';
import { STATIC_CARD_KINDS, cardFamilyOf, type StaticCardContext, type StaticCardKind } from '@/infrastructure/services/staticSocraticCards';
import { ref, update } from 'firebase/database';
import { database, serverNow } from '@/infrastructure/firebase';
import { throttledRtdbUpdate } from '@/infrastructure/services/ThrottledRtdbWriter';
import { normalizeStudentId } from '@/application/useChatStore';
import { firebaseSyncService, emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import { readStoredMeetingDeadline, storeMeetingDeadline } from '@/application/meetingDeadline';
import type { TelemetryEventType } from '@/types/telemetry';
import { REPRESENTATION_LOCKS, buildsAnyWay, builtAnyWay } from '@/data/representationLocks';
export { buildsAnyWay, builtAnyWay };
import type { VRAWorkspaceState } from '@/types';
import { workspaceSavedAt, startedWithoutRecord } from '@/core/workspaceSnapshot';
import { mirrorReflectionStep } from '@/core/srlReflection';
import {
  EMPTY_PERSISTENCE_COUNTS,
  addPersistenceEvent,
  hasClosingSentence,
  meetingOfSessionId,
  persistenceEventKind,
  type PersistenceCounts,
  type PersistenceEventLike,
} from '@/core/persistenceEncouragement';

/**
 * Appendix A §3 scaffold events (owner, 16.9.2026 — register deviation 19).
 * One emitter so the three carry the same session/exercise identity as
 * every other event and go through the same offline queue.
 */
function emitScaffoldEvent(
  s: WorkspaceState,
  eventType: 'ADAPTIVE_GRID_TOGGLED' | 'KEYBOARD_LOCK_BLOCKED' | 'HELP_REQUESTED' | 'HELP_WITHDRAWN' | 'PLACE_CUES_SHOWN' | 'CHAT_HELP_REQUESTED',
  details: Record<string, unknown>,
  columnIndex?: number
): void {
  const studentId = currentStudentUid();
  const task = getActiveTasks(s)[s.standardTaskIdx] || null;
  emitTelemetry({
    session_id: `session_${s.sessionNumber}_student_${studentId}`,
    student_id: studentId,
    exercise_id: activeExerciseId(s),
    event_type: eventType,
    ...(columnIndex !== undefined ? { column_index: columnIndex } : {}),
    details,
  } as any).catch(console.error);
}

export function placeToColumnIndex(place: Place | string): number {
  switch (place) {
    case 'units': return 0;
    case 'tens': return 1;
    case 'hundreds': return 2;
    case 'thousands': return 3;
    default: return 0;
  }
}

const UNDO_STACK_CAP = 10;

/**
 * One coaching-card request at a time. Each opening takes a new number; a
 * reply, a deadline or a failure of an older request finds the number moved
 * on and does nothing, so a card closed during the hourglass, or a task left
 * behind, never gets a card or a SOCRATIC_CARD_SHOWN later (X22).
 */
let socraticRequestSeq = 0;
let socraticDeadline: ReturnType<typeof setTimeout> | null = null;
function cancelSocraticRequest(): void {
  socraticRequestSeq++;
  if (socraticDeadline) clearTimeout(socraticDeadline);
  socraticDeadline = null;
}

export type SessionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Module 17: the learner and meeting the workspace was last started
 * (initSession) or restored (restoreSession) for on this device. Until then
 * the store holds defaults, and the sync saves nothing — neither on this
 * device nor on the learner record — until this names the signed-in learner
 * and the meeting in the store (FirebaseSyncService).
 */
export interface WorkspaceInitialization {
  /** currentStudentUid() when the meeting was started or restored; '' for no learner. */
  learner: string;
  meeting: SessionNumber;
  /**
   * The stamp (WORKSPACE_SAVED_AT_KEY) of the saved copy it was restored from
   * (0: unstamped); null when started afresh, or restored from a copy of a
   * fresh start made without the record (WORKSPACE_STARTED_WITHOUT_RECORD_KEY).
   */
  restoredSavedAt: number | null;
}

/**
 * U, E and G of the meeting in progress (owner decision E1, 27.9.2026,
 * register deviation 24): counted exactly as the server counts them
 * (core/persistenceEncouragement.ts), for this meeting only, so the closing
 * sentence can be chosen on the child's device. Never shown as a number.
 */
export interface MeetingPersistenceTally extends PersistenceCounts {
  /** The meeting these counts belong to; an event of another meeting is not counted. */
  sessionNumber: number;
}

const freshMeetingPersistence = (sessionNumber: number): MeetingPersistenceTally => ({
  sessionNumber,
  ...EMPTY_PERSISTENCE_COUNTS,
});

/** A saved tally, if it is a tally of this meeting; otherwise a fresh one. */
function restoredMeetingPersistence(saved: unknown, sessionNumber: number): MeetingPersistenceTally {
  const s = saved as Partial<MeetingPersistenceTally> | null | undefined;
  if (!s || Number(s.sessionNumber) !== sessionNumber) return freshMeetingPersistence(sessionNumber);
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { sessionNumber, undos: n(s.undos), wrongDigits: n(s.wrongDigits), wrongOptions: n(s.wrongOptions) };
}

/** PRD Module 12: the only in-task help is the Socratic card ('socratic'), reached through a short 'friction' beat. */
export type HelpState = 'closed' | 'friction' | 'socratic';
export type FlowStatus = 'task' | 'choice_branch' | 'reflection' | 'sessionDone';

/**
 * מסמך 03 §3.3–3.8 names three triggers for the coaching card: 45 seconds of
 * hesitation in the active column, four consecutive deletions, and a required
 * conversion the learner did not perform. PRD Appendix A lists only the first
 * two plus session 8's three consecutive undos; 'conversion_not_performed' is
 * the fourth value that carries מסמך 03's third trigger (see the deviations
 * register). PRD Module 12: none of them may fire in session 2.
 */
export type SocraticTriggerReason =
  | 'hesitation_45s'
  | 'consecutive_errors_4'
  | 'consecutive_undos_3'
  | 'conversion_not_performed'
  // מסמך 03 §1.3 ד' "שגיאות חוזרות": a second wrong answer submitted in a
  // row on the same exercise (owner, 16.9.2026 — see the deviations register).
  | 'repeated_errors';
export type KeyboardState = 'LOCKED' | 'UNLOCKED' | 'SOCRATIC_ONLY';

/**
 * One coaching card opened in the exercise on screen (1.10.2026). The cards
 * of one exercise are kept so that the same trigger does not reopen the very
 * same card again and again, and so that the next card's request can say what
 * the child already saw and whether the option chosen there was right.
 */
export interface SocraticCardRecord {
  reason: SocraticTriggerReason;
  /** The column the card is about (socraticCardPlace when it opened); null in an exercise with no columns. */
  place: Place | null;
  /** The static card's kind (staticSocraticCards.StaticCardKind), when it has one. */
  kind: StaticCardKind | null;
  /**
   * The static card's situation family (staticSocraticCards.cardFamilyOf) —
   * with the trigger and the column, the card's identity (coordinator's
   * decision, 2.10.2026): a new level of the same family is the next step of
   * the same card, not a new card. Null on a record saved before it existed.
   */
  family: string | null;
  /**
   * The static card's question when the card opened — which LEVEL of its
   * family it was. The engine's card may word it otherwise; this stays the
   * static one, which is fixed for a given exercise, column and board.
   */
  staticQuestionHe: string;
  /** The question the child saw (the engine's card or the static one); null until the card settled. */
  questionHe: string | null;
  /** The card settled and was on the screen (not closed during the hourglass). */
  shown: boolean;
  /** The option the child chose last was right (true) or wrong (false); null while none was chosen. */
  answeredCorrect: boolean | null;
  openedAt: number;
}

/**
 * How many times the very same card may open in one exercise. A card is
 * (trigger, column, situation family); its levels follow one another, and the
 * family's last level — the identical card — opens twice at most in all, then
 * no more (coordinator's decision, 2.10.2026).
 */
export const MAX_IDENTICAL_SOCRATIC_CARDS = 2;

/**
 * A wrong digit in a column whose conversion was not done opens the card once
 * per column within this time: every further wrong digit there used to reopen
 * it at once (1.10.2026). The "four errors" streak of the column still counts.
 */
export const CONVERSION_CARD_COOLDOWN_MS = 60_000;

/**
 * After the right option (owner, 1.10.2026, D1): "נכון מאוד!" stays on the
 * card for this long, and then the card closes by itself.
 */
export const SOCRATIC_CORRECT_AUTO_CLOSE_MS = 4_000;

export interface FeedbackState {
  correct: boolean;
  title: string;
  sub?: string;
  nonce?: number | string;
  /**
   * מפגש 2 הוא אבחון: הילד אינו אמור לדעת אם צדק, ולכן כל תשובה קיבלה
   * `correct: true`. אבל `correct` הוא גם מה שמפעיל את הקונפטי ואת המסגרת
   * הירוקה — כך שילד שטעה קיבל חגיגה של 150 חלקיקים. `neutral` מפריד בין
   * השניים: אישור שקט שהתשובה נקלטה, בלי לחגוג ובלי לשפוט.
   */
  neutral?: boolean;
}

export interface UndoFrame {
  counts: PlaceCounts;
  actionType?: TelemetryEventType | null;
  /**
   * PRD Module 11 §א: the snapshot restores the VRA state — "קואורדינטות,
   * כמויות, קלט". Only the board counts were kept, so typing was not undoable
   * at all. In meetings 2 and 8 the blocks are not on screen and typing is the
   * only action there is, which left the undo button with nothing to undo —
   * and Module 12's third trigger ("שלוש פעולות ביטול רצופות במפגש 8")
   * unreachable. Absent on frames saved before this existed.
   */
  answerDigits?: Partial<Record<Place, string>>;
  carryDigits?: Partial<Record<Place, string>>;
  operandDigits?: { a: Partial<Record<Place, string>>; b: Partial<Record<Place, string>> };
  /**
   * The per-column conversions as they were BEFORE a conversion action
   * (see ColumnConversions). Undoing the grouping or decomposition takes the
   * column's conversion back with it, so the column locks again until it is
   * redone. Absent on frames of other actions and on frames saved before this
   * existed; undoing those leaves the conversions as they are.
   */
  conversionsByColumn?: ColumnConversions;
  /**
   * PRD Module 5 §ג: UNDO_EXECUTED omits column_index "unless the undone
   * action was confined to a specific column". The column the action's own
   * event carried; absent for an action with no column (the trash reset) and
   * on frames saved before this existed.
   */
  columnIndex?: number;
  /**
   * Subtraction with blocks: the take-away record as it was BEFORE the action
   * (WorkspaceState.takeAwayTrack). Undo brings it back with the board, so
   * undoing past the first number takes "taking away has started" back too
   * (verification, 2.10.2026: 53 − 18 built, a ten thrown away, then undo run
   * back to 30 — "you took out too much, press undo"). Absent when there was
   * no record yet, and on frames saved before this existed: undo then leaves
   * no record.
   */
  takeAwayTrack?: TakeAwayTrack;
  /**
   * Column dimming only: the held-from record as it was BEFORE the action
   * (WorkspaceState.heldFromTrack), brought back with the board on undo.
   */
  heldFromTrack?: HeldFromTrack;
}

/**
 * Module 9 §א, מסמכים 01 ו-03: the enhanced-support keyboard lock and the
 * "wrong digit before the conversion was done with the blocks" coaching
 * trigger are both PER COLUMN. A column's conversion is done when the blocks
 * performed it for that column:
 *  - addition — ten blocks of the column grouped into one block of the next
 *    ("קבצו 10" on the column): `composed[place]`;
 *  - subtraction — a block of the next column decomposed into ten blocks of
 *    this column (a click on it, or a drag to the right): `decomposed[place]`.
 * Chained conversions are just several columns: 403 − 128 decomposes a hundred
 * into the tens (tens done) and then a ten into the units (units done).
 * `hasGrouped`/`hasUngrouped` stay per exercise for meeting 1's checklist and
 * the board checks; they no longer open a column.
 */
export interface ColumnConversions {
  composed: Partial<Record<Place, boolean>>;
  decomposed: Partial<Record<Place, boolean>>;
  /**
   * How many times each column converted — s7_g_t1 groups ten hundreds twice
   * (REPRESENTATION_LOCKS lists the column twice). Absent until the first
   * conversion; a saved value without it counts a done column once.
   */
  times?: { composed?: Partial<Record<Place, number>>; decomposed?: Partial<Record<Place, number>> };
}

export function emptyColumnConversions(): ColumnConversions {
  return { composed: {}, decomposed: {} };
}

/** A saved value back into shape; the database drops empty objects. */
export function normalizeColumnConversions(raw: unknown): ColumnConversions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out: ColumnConversions = { composed: { ...(r.composed ?? {}) }, decomposed: { ...(r.decomposed ?? {}) } };
  const t = r.times && typeof r.times === 'object' ? r.times : null;
  if (t) out.times = { composed: { ...(t.composed ?? {}) }, decomposed: { ...(t.decomposed ?? {}) } };
  return out;
}

/** Was the conversion this column needs performed with the blocks? */
export function conversionDoneInColumn(conv: ColumnConversions, place: Place, isSubtraction: boolean | undefined): boolean {
  return Boolean(isSubtraction ? conv.decomposed[place] : conv.composed[place]);
}

/** How many times the blocks performed this column's conversion. */
export function conversionTimesInColumn(conv: ColumnConversions, place: Place, isSubtraction: boolean | undefined): number {
  const kind = isSubtraction ? 'decomposed' : 'composed';
  const times = conv.times?.[kind]?.[place];
  return typeof times === 'number' ? times : conv[kind][place] ? 1 : 0;
}

/** The conversions after one board event (a grouping from `from`, or a decomposition into `to`). */
function withColumnConversion(conv: ColumnConversions, kind: 'composed' | 'decomposed', place: Place): ColumnConversions {
  const times = conversionTimesInColumn(conv, place, kind === 'decomposed') + 1;
  return {
    ...conv,
    [kind]: { ...conv[kind], [place]: true },
    times: { ...conv.times, [kind]: { ...conv.times?.[kind], [place]: times } },
  };
}

export interface WorkspaceState {
  // canonical VRA state machine (Module 29 / Appendix A §5)
  currentState: VRAWorkspaceState;
  activeColumnIndex: number; // 0: Ones, 1: Tens, 2: Hundreds
  /** The teacher's projector board (ProjectorSandboxPage): it demonstrates, so the column digits always show. */
  projectorBoard: boolean;
  /** The result-row place cues shown as a scaffold after a digit in the wrong place (core/placeCues.ts, owner 30.9.2026); per exercise. */
  placeCuesShown: boolean;
  /**
   * The coaching cards of 30.9.2026 already shown in the exercise `taskId`
   * (staticSocraticCards.StaticCardKind): a card that comes in levels is
   * shown once, then the next level (C5 before the column's card; C4 once).
   */
  socraticCardKinds: { taskId: string | null; kinds: StaticCardKind[] };
  isSocraticCardLocked: boolean;
  socraticLockDeadline: number | null;
  hesitationTimerSeconds: number;
  consecutiveErrorCount: number;
  consecutiveUndoCount: number;
  genericUndoStack: Array<Record<string, unknown>>;

  // session / flow
  sessionNumber: SessionNumber;
  isASD: boolean;
  standardTaskIdx: number;
  qflow: QMatrixFlowState;
  flowStatus: FlowStatus;
  awaitingNext: boolean;
  sessionStartTimeMs: number;
  isTimeExceeded: boolean;
  sessionDeadlineTime: number | null;
  sessionDurationMinutes: number;
  selectedBranch: 'reinforcement' | 'challenge' | null;

  // board
  counts: PlaceCounts;
  undoStack: UndoFrame[];
  regroupTriggerTimestamps: Record<number, number>;
  undoCount: number;
  /** Covert hesitation counter (radar) — mirrored to traceData at reflection. */
  hesitationCount: number;
  boardOpen: boolean;
  scaffoldFadeLevel: number;
  errorPlace: Place | null;
  errorNonce: number;
  focusedPlace: Place | null;

  // per-task interaction
  taskStartTime: number;
  undoTimestamps: number[];
  isBoardLocked: boolean;
  /** Module 19 §ב Safe Application Boundary: a teacher-queued differentiation
   * change (path/scaffold/addition-helper), staged from RTDB
   * users/students/{id}/pendingAdaptation and applied only in startTask(),
   * never mid-exercise. */
  pendingAdaptation: {
    pedagogicalPath?: 'green_path' | 'remediation_path';
    currentPath?: string;
    scaffoldLevel?: 0 | 1 | 2;
    forceAdditionHelper?: boolean;
    queuedAt?: number;
  } | null;
  hasRequestedBasicHelp: boolean;
  hasInteracted: boolean;
  hasDeletedBlock: boolean;
  /**
   * Subtraction with blocks, in the exercise `taskId`: the board has held the
   * first number at least once (`held`), and a block left the board after
   * that (`started`: taking away has started). A board emptied to 0 starts
   * over. Kept by nextTakeAwayTrack on every change of the board (final
   * review, 2.10.2026: the undo history was read instead, and its cap made a
   * child still building the first number "took out too much").
   */
  takeAwayTrack: TakeAwayTrack | null;
  /**
   * VIEW ONLY — the column dimming reads it (core/columnFocus.ts), nothing
   * else: not the coaching cards (blocksRemoved stays takeAwayTrack's), no
   * telemetry event; the workspace snapshot keeps it only so a reload keeps
   * the dimming. A skeleton worked on the
   * board as a subtraction from a number other than the first one (a + ▢ = r
   * and ▢ + b = r are found as r − a, r − b): the board has held that number
   * in the exercise `taskId`. Kept by nextHeldFromTrack on every change of the
   * board, like takeAwayTrack's `held`; null elsewhere.
   */
  heldFromTrack: HeldFromTrack | null;
  /** The trash was pressed this task (clearBoard) — meeting 1 step 5. Dragging one block into it does not count. */
  hasClearedBoard: boolean;
  blocksAddedCount: number; // Added to enforce the 5 block rule in Sandbox
  /**
   * The "four errors" streak (מסמך 03: "ארבע מחיקות או הקלדות שגויות רצופות
   * באותו טור"; 28.9.2026): wrong result-row or missing-digit entries and
   * deletions in a row, in ONE column (`digitErrorStreakPlace`). See
   * `nextDigitErrorStreak` and `nextDigitErrorStreakOnDelete`.
   */
  digitErrorStreak: number;
  digitErrorStreakPlace: Place | null;
  hasUngrouped: boolean;
  hasGrouped: boolean;
  /** Which columns' conversions the blocks performed in this exercise (Module 9 §א, per column). */
  conversionsByColumn: ColumnConversions;
  selectedChoiceId: string | null;
  answerDigits: Partial<Record<Place, string>>;
  carryDigits: Partial<Record<Place, string>>;
  probeAnswer: string;
  q3Reps: PlaceCounts[];
  /**
   * Meeting 8's reflection board as the child left it: the stage on screen
   * and the answers chosen so far (PRD Module 16 §ב, reflection_step 1–3).
   * In the snapshot, so a reload returns to the same stage with the same
   * answers. The srl_reflections document is still written once, at "סיום התחנה".
   */
  reflectionDraft: ReflectionDraft;
  /** Which of מסמך 03's triggers opened the coaching card (null when it is closed). */
  socraticTriggerReason: SocraticTriggerReason | null;
  /**
   * The column the open coaching card is about, set for every trigger when the
   * card opens (cardFocusPlace): the streak's column, the column just typed in,
   * the lowest wrong (or empty) box after a wrong "התקדם", the focused box or
   * the first unsolved column after a pause, the undone action's column. Null
   * only in an exercise that has no columns (a choice question). The request
   * for the engine's card and SOCRATIC_CARD_SHOWN.column_index read it.
   */
  socraticCardPlace: Place | null;
  /** The coaching cards opened in the exercise `taskId` (see SocraticCardRecord). */
  socraticCardHistory: { taskId: string | null; cards: SocraticCardRecord[] };
  /**
   * The card shown before the one now opening, in the same exercise — its
   * kind, its question, and whether the option the child chose there was
   * right — for the request of the card now opening. Null when this is the
   * exercise's first card.
   */
  previousSocraticCard: (SocraticCardRecord & { taskId: string }) | null;
  /**
   * The teacher's projector, pause or close screen covers the workspace
   * (StudentWorkspacePage). A card that settles under it is not seen, so
   * SOCRATIC_CARD_SHOWN waits until the screen is gone.
   */
  classScreenUp: boolean;
  /** Skeleton exercises (מסמך 03): digits the learner types into hidden operand cells. */
  operandDigits: { a: Partial<Record<Place, string>>; b: Partial<Record<Place, string>> };
  aiSocraticHint: SocraticHintResponse | null;
  /**
   * The coaching card is open and waiting for the engine (at most
   * SOCRATIC_PROXY_TIMEOUT_MS): the card shows an hourglass and no text. When
   * it settles, exactly one card appears and stays (owner, 28.9.2026; X22).
   */
  socraticPending: boolean;
  socraticPenaltyLockoutUntil: number | null;
  socraticDistractorHint: string | null;
  typedErrorCount: number;
  hasDigitErrorInTask: boolean;
  socraticDistractorErrors: number;
  /** U, E and G of the meeting in progress (E1); reset when a meeting starts, kept across a reload. */
  meetingPersistence: MeetingPersistenceTally;
  /**
   * Stations 2 and 8 open with one quiet screen before their first task
   * (owner, 27.9.2026). Set once the learner pressed "מתחילים" in the meeting
   * in progress; kept across a reload, so the screen never returns mid-meeting.
   */
  openingScreenSeen: boolean;
  lastInteractionTime: number;

  // overlays
  feedback: FeedbackState | null;
  feedbackNonce: number;
  helpState: HelpState;
  frictionTriggerSource: 'mistake' | null;
  /** Wrong answers submitted in a row on the current exercise (מסמך 03 "שגיאות חוזרות"). */
  wrongAnswerStreak: number;
  wrongAnswerTaskId: string | null;
  /**
   * PRD 7.3 Module 23 §ב, measure 3: in a representation exercise, error_count
   * of PROBLEM_COMPLETE "סופר כל בדיקת לוח שנכשלה". Counted per exercise — the
   * consecutive-error counter is shared with digit entry and was never that.
   */
  boardCheckFailures: number;
  boardCheckFailuresTaskId: string | null;
  /**
   * The single answer box of a representation exercise with a kind (stations
   * 3 and 7, owner 30.9.2026): its digits as they were at the last press of
   * "התקדם" in this exercise, so a press records only the digits that changed
   * (recordSubmittedAnswer). Null until the first press.
   */
  lastSubmittedAnswer: string | null;

  /** Teacher-approved AI-generated task list (Socratic Engine); overrides session tasks when set. */
  /** Dynamically injected tasks for the current session (Micro-Agility engine). Takes precedence if length > 0. */
  dynamicTasks: SessionTask[] | null;
  /**
   * מודול 26 §ב/§ד: המסלול שממנו נטען המאגר הפעיל, ננעץ בתחילת כל תרגיל.
   *
   * `getActiveTasks` נהג לקרוא את המסלול של הלומד בכל רינדור. מורה ששינתה
   * מסלול בזמן שהילד עמד באמצע תרגיל החליפה לו את המאגר תחת הידיים: אותו
   * אינדקס, מספרים אחרים. האפיון אומר ההפך — "עדכוני תרגילים… מוחלים בצד
   * התלמיד אך ורק על תרגילים שטרם נפתחו בפועל. תרגיל פעיל שפתרונו החל אינו
   * מופרע." המסלול החדש נכנס לתוקף בתרגיל הבא, באותו גבול החלה בטוח של
   * מודול 19. `null` = טרם ידוע מה אושר, ואז נקראת ההכרעה החיה.
   */
  activeBankPath: 'green_path' | 'remediation_path' | null;
  keyboardState: KeyboardState;
  /**
   * The Module 10 grid is on screen. Register decision ב: nothing closes it
   * automatically — only the learner does — so an open grid stays open across
   * an exercise change and a reload (it travels with the snapshot).
   */
  isAdditionHelperOpen: boolean;
  /**
   * The system offered the Module 10 grid at least once this meeting — it
   * opened, or its 30 seconds came due while the coaching card was open — so
   * the learner may open it from its tab (register deviation 18, מסמך 03 §1.3
   * ב'). Reset only when a meeting starts; saved with the snapshot.
   */
  additionHelperOffered: boolean;
  /**
   * The grid was offered while the coaching card was open and has not been
   * opened yet this meeting: its tab says "הצגת לוח החיבור", not "הצגה חוזרת".
   * Not saved: after a reload the tab speaks of a return.
   */
  additionHelperOfferedUnopened: boolean;
  helpRequested: boolean;
  /**
   * Module 19 §ב, Pending Adaptation: a support profile the teacher changed
   * while an exercise was on screen. It waits here; the next task start
   * (standard, branch, meeting start or restore) applies it.
   */
  pendingSupportProfileId: string | null;
  /** A change waits in pendingSupportProfileId (whose null is a real value: "profile off"). */
  hasPendingSupportProfile: boolean;
  /**
   * The support profile in force for the exercise on screen — the only value
   * the Module 9 keyboard lock, the Module 10 grid gate and the hesitation
   * radar read.
   */
  activeSupportProfileId: string | null;
  /** activeSupportProfileId was set from the learner record at least once since the store was reset. */
  supportProfileApplied: boolean;
  activeDeviceId: string | null;
  isSupersededByOtherDevice: boolean;
  /** Which learner and meeting the workspace was started or restored for; null until then and after resetWorkspace. */
  workspaceInitializedFor: WorkspaceInitialization | null;

  // actions
  setActiveDeviceId: (id: string) => void;
  setSupersededByOtherDevice: (superseded: boolean) => void;
  setPendingSupportProfile: (profileId: string | null) => void;
  /**
   * The learner record's support profile, as the student listener read it.
   * Applied at once while no exercise is in progress; otherwise staged for
   * the next task start (Module 19 §ב).
   */
  receiveSupportProfile: (profileId: string | null) => void;
  setHelpRequested: (val: boolean) => void;
  toggleHelpRequested: () => void;
  /** Owner, 1.10.2026: a request for help from the chat, recorded with its exercise (research data). */
  logChatHelpRequest: (kind: 'call' | 'ready_message') => void;
  /** 'learner' when the learner brings the grid back (מסמך 03 §1.3 ב'); default is the Module 10 hesitation stage. */
  openAdditionHelper: (source?: 'hesitation_30s' | 'learner') => void;
  /**
   * The 30-second stage came due while the coaching card was open: the grid is
   * offered — its tab appears beside the card — and not opened. No event: the
   * grid did not appear (ADAPTIVE_GRID_TOGGLED is written when it opens).
   */
  offerAdditionHelper: () => void;
  /** Module 9: a digit key pressed on a locked result cell. Logged, never acted on. */
  recordBlockedKeystroke: (place: Place) => void;
  closeAdditionHelper: () => void;
  toggleAdditionHelper: () => void;
  injectTask: (task: SessionTask, position: 'next' | 'end') => void;
  startSession: (meeting: number) => void;
  initSession: (meeting: SessionNumber, isASD: boolean, startingTaskIdx?: number, existingDeadline?: number | null) => void;
  restoreSession: (savedState: any) => void;
  getSessionRemainingSeconds: () => number;
  selectBranch: (branch: 'reinforcement' | 'challenge') => void;
  applyDrop: (input: DropInput) => void;
  clearBoard: () => void;
  removeBlockClick: (place: Place) => void;
  splitBlockClick: (place: Place) => void;
  groupColumnClick: (place: Place) => void;
  undo: () => void;
  recordUserInteraction: () => void;
  incrementTypedErrorCount: () => void;
  getPersistenceIndex: () => number;
  /**
   * Counts one telemetry event toward this meeting's U, E or G (E1). Called
   * by the one telemetry emitter for every event it sends, so the child's
   * device counts exactly what the server will count.
   */
  recordPersistenceEvent: (event: PersistenceEventLike & { session_id?: string }) => void;
  /** The learner pressed "מתחילים" on the opening screen of station 2 or 8. */
  markOpeningScreenSeen: () => void;
  toggleBoard: () => void;
  setFocusedPlace: (place: Place | null) => void;
  selectChoice: (id: string) => void;
  setAnswerDigit: (place: Place, val: string) => void;
  setCarryDigit: (place: Place, val: string) => void;
  setProbeAnswer: (v: string) => void;
  setOperandDigit: (which: 'a' | 'b', place: Place, val: string) => void;
  /** representation tasks, enhanced profile only: the result row opens once the board shows the prescribed blocks. */
  isRepresentationColumnLocked: (place: Place) => boolean;
  /**
   * The single answer box of a representation exercise with a kind (stations
   * 3 and 7): what the child types, kept as the digits of the result row,
   * right-aligned ("340" → hundreds 3, tens 4, units 0). Typing is an action
   * undo takes back (Module 11 §א); its digits are recorded when the child
   * presses "התקדם" (Module 23 §ב), not keystroke by keystroke.
   */
  setRepresentationAnswer: (text: string) => void;
  /** The single answer box, enhanced profile only: locked until the exercise's conversion is done with the blocks (REPRESENTATION_LOCKS). */
  isRepresentationAnswerLocked: () => boolean;
  /** Module 9: a digit key pressed on the locked single answer box. Logged (KEYBOARD_LOCK_BLOCKED), never acted on. */
  recordBlockedAnswerKeystroke: () => void;
  checkTimeExceeded: () => void;
  /** "החזרת עזרים" — bidirectional scaffold fading per spec: temporarily restore faded aids. */
  restoreScaffolds: () => void;
  addRepresentation: () => void;
  demoUngroup: () => void;
  proceed: () => void;
  /** "סיום המפגש כעת" from the early-finisher screen; records completion like every other exit. */
  finishMeetingEarly: () => void;
  /**
   * Meeting 8's reflection board is done. PRD Module 16 §ג gives "כפתור סיום
   * מפגש סופי"; Module 14 §ג gives the quiet waiting screen ("ממתין במסך סיום
   * שקט"). The rest is the implementer's reading: the finish button leads to
   * that quiet end screen, and the state is synced like every other, so a
   * reload or a new sign-in does not bring the board back while the teacher
   * keeps meeting 8 open.
   */
  finishReflection: () => void;
  /** Moves the reflection board to a stage, and mirrors reflection_step to the learner record (Module 16 §ב). */
  setReflectionStep: (step: ReflectionStep) => void;
  /** Stage 1 of the reflection board: the effort level chosen. */
  setReflectionEffort: (level: ReflectionEffortId) => void;
  /** Stage 2 of the reflection board: a strategy ticked or unticked. */
  toggleReflectionStrategy: (id: string) => void;
  /**
   * מסמך 04 §2א/§5: the silent help button — "שליחת אות מצוקה חרישי למורה ללא
   * תיוג חברתי בכיתה". It signals the teacher and nothing else: no overlay, no
   * coaching card, no interruption to the learner's work.
   */
  requestSilentHelp: () => void;
  helpRequestCount: number;
  helpFrictionDone: () => void;
  closeHelp: () => void;
  showFeedback: (feedback: FeedbackState, ms: number, then?: () => void) => void;
  fetchSocraticHint: () => Promise<void>;
  unlockKeyboard: () => void;
  lockKeyboard: () => void;
  setKeyboardSocratic: () => void;
  /**
   * מסמך 03: open the coaching card, recording which trigger did it. `place`:
   * the column the trigger itself belongs to; without it the card's column is
   * worked out from the exercise (cardFocusPlace).
   */
  openSocraticCard: (reason: SocraticTriggerReason, place?: Place) => void;
  /** The child chose an option on the open card: right or wrong (SocraticCardRecord.answeredCorrect). */
  recordSocraticAnswer: (isCorrect: boolean) => void;
  /** StudentWorkspacePage: whether a class screen (projector, pause, close) covers the workspace. */
  setClassScreenUp: (up: boolean) => void;
  triggerSocraticPenaltyLockout: (hintText?: string) => void;
  clearSocraticPenaltyLockout: () => void;
  getSocraticPenaltyRemaining: () => number;
  isColumnInputLocked: (place: Place, numberA: number, numberB: number, isSubtraction?: boolean) => boolean;
  resetWorkspace: () => void;

  // Canonical VRA handlers (Module 29 / Appendix A §5)
  transitionTo: (newState: VRAWorkspaceState) => void;
  resetHesitationTimer: () => void;
  pushUndoSnapshot: (snapshot: Record<string, unknown>) => void;
  popUndoSnapshot: () => Record<string, unknown> | null;
  lockSocraticCard: (durationMs?: number) => void;
  unlockSocraticCard: () => void;
  setActiveColumnIndex: (colIndex: number) => void;
  incrementConsecutiveErrors: () => void;
  resetConsecutiveErrors: () => void;
}

const SOCRATIC_PENALTY_STORAGE_KEY = 'mc_socratic_penalty_until';

function getStoredSocraticLockDeadline(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const val = localStorage.getItem(SOCRATIC_PENALTY_STORAGE_KEY);
    if (val) {
      const parsed = parseInt(val, 10);
      if (parsed > Date.now()) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read socratic penalty from storage', e);
  }
  return null;
}

/** This learner's own saved progress in this meeting on this device (the Module 17 cache), or null. */
function ownSavedProgress(learnerUid: string, meeting: number) {
  if (!learnerUid || typeof firebaseSyncService?.getLocalSessionProgress !== 'function') return null;
  return firebaseSyncService.getLocalSessionProgress(learnerUid, meeting);
}

/**
 * Catch-up (2.10.2026): the learner finished this meeting —
 * completedMeetings/m{N} on the record (FirebaseSyncService.markMeetingCompleted,
 * both spellings of the id, once per meeting). Not from a device another
 * device took over, like highestCompletedMeeting.
 */
function markMeetingFinished(studentId: string | null | undefined, meeting: number, supersededByOtherDevice: boolean) {
  if (!studentId || supersededByOtherDevice) return;
  if (typeof firebaseSyncService?.markMeetingCompleted !== 'function') return;
  firebaseSyncService.markMeetingCompleted(studentId, meeting);
}

/* ── Pure helpers ── */

/**
 * Undo frames back from a saved snapshot (FirebaseSyncService). The database
 * drops empty objects, so a frame saved before the first digit returns without
 * its empty input; `hasInput` marks the frames that had one. Frames saved
 * before typing was undoable carry no input and stay that way.
 */
export function restoreUndoFrames(raw: unknown): UndoFrame[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, any> => Boolean(f) && typeof f === 'object' && typeof (f as any).counts === 'object')
    .map((f) => {
      const frame: UndoFrame = { counts: { ...EMPTY_COUNTS, ...f.counts }, actionType: f.actionType ?? null };
      if (f.hasInput || f.answerDigits !== undefined) {
        frame.answerDigits = { ...(f.answerDigits ?? {}) };
        frame.carryDigits = { ...(f.carryDigits ?? {}) };
        frame.operandDigits = { a: { ...(f.operandDigits?.a ?? {}) }, b: { ...(f.operandDigits?.b ?? {}) } };
      }
      // A conversion frame saved with no conversion before it comes back empty.
      if (f.hasConversions || f.conversionsByColumn !== undefined) {
        frame.conversionsByColumn = normalizeColumnConversions(f.conversionsByColumn);
      }
      if ([0, 1, 2, 3].includes(f.columnIndex)) frame.columnIndex = f.columnIndex;
      const track = restoredTakeAwayTrack(f.takeAwayTrack);
      if (track) frame.takeAwayTrack = track;
      const fromTrack = restoredHeldFromTrack(f.heldFromTrack);
      if (fromTrack) frame.heldFromTrack = fromTrack;
      return frame;
    });
}

/**
 * The "four errors" coaching trigger — מסמך 03: "ארבע מחיקות או הקלדות שגויות
 * רצופות באותו טור"; PRD Module 12: "4 consecutive digit deletions/errors in
 * the active column" (register, deviation 2). One streak per exercise, tied to
 * one column:
 *  - a wrong digit (is_correct === false) in a result-row or missing-digit box
 *    counts at the moment it is typed, into an empty box or over a digit;
 *    in another column than the streak's, the streak restarts there at 1;
 *  - a deletion counts the same way (nextDigitErrorStreakOnDelete), except
 *    the erasure of a wrong digit;
 *  - a correct digit in any of those boxes resets the streak to 0;
 *  - is_correct === null, memory circles and undo leave it as is.
 * The card opens at 4, for the streak's column (openSocraticCard resets it).
 */
export function nextDigitErrorStreak(
  s: Pick<WorkspaceState, 'digitErrorStreak' | 'digitErrorStreakPlace'>,
  place: Place,
  isCorrect: boolean | null
): { digitErrorStreak: number; digitErrorStreakPlace: Place | null } {
  if (isCorrect === true) return { digitErrorStreak: 0, digitErrorStreakPlace: null };
  if (isCorrect === false) {
    const same = s.digitErrorStreakPlace === place;
    return { digitErrorStreak: same ? s.digitErrorStreak + 1 : 1, digitErrorStreakPlace: place };
  }
  return { digitErrorStreak: s.digitErrorStreak, digitErrorStreakPlace: s.digitErrorStreakPlace };
}

/**
 * A deletion in the "four errors" streak. The documents count deletions
 * ("ארבע מחיקות"), so erasing a digit counts in its column like a wrong digit —
 * except erasing a WRONG digit: that failed attempt was already counted when it
 * was typed, and one failed attempt counts once (register, deviation 2).
 */
export function nextDigitErrorStreakOnDelete(
  s: Pick<WorkspaceState, 'digitErrorStreak' | 'digitErrorStreakPlace'>,
  place: Place,
  deletedWasCorrect: boolean | null
): { digitErrorStreak: number; digitErrorStreakPlace: Place | null } {
  if (deletedWasCorrect === false) return { digitErrorStreak: s.digitErrorStreak, digitErrorStreakPlace: s.digitErrorStreakPlace };
  const same = s.digitErrorStreakPlace === place;
  return { digitErrorStreak: same ? s.digitErrorStreak + 1 : 1, digitErrorStreakPlace: place };
}

/**
 * The column the open coaching card is about (SOCRATIC_CARD_SHOWN.column_index,
 * the engine's active column): the column set when the card opened
 * (socraticCardPlace, every trigger — the "four errors" card keeps the streak's
 * column even after the cursor auto-advanced). An exercise with no columns
 * falls back to the focused box, else 0 (the event needs a column).
 */
export function socraticCardColumnIndex(
  s: Pick<WorkspaceState, 'socraticTriggerReason' | 'socraticCardPlace' | 'focusedPlace' | 'activeColumnIndex'>
): number {
  if (s.socraticCardPlace) return placeToColumnIndex(s.socraticCardPlace);
  return s.focusedPlace ? placeToColumnIndex(s.focusedPlace) : (s.activeColumnIndex || 0);
}

/** The board and every digit the child typed — what a coaching card is built on. */
function cardStateSignature(s: Pick<WorkspaceState, 'counts' | 'answerDigits' | 'carryDigits' | 'operandDigits'>): string {
  return JSON.stringify([s.counts, s.answerDigits, s.carryDigits, s.operandDigits]);
}

/** A vertical exercise (addition_simple / vertical_addition, skeletons included). */
function isVerticalTask(task: SessionTask | null | undefined): boolean {
  return task?.type === 'addition_simple' || task?.type === 'vertical_addition';
}

/**
 * An addition exercise — the only kind the Module 10 grid belongs to (owner,
 * 1.10.2026, D7): not a subtraction, not a station-3 representation.
 */
export function isAdditionExercise(task: Pick<SessionTask, 'type' | 'isSubtraction'> | null | undefined): boolean {
  return (task?.type === 'addition_simple' || task?.type === 'vertical_addition') && !task.isSubtraction;
}

type ColumnStatus = 'wrong' | 'empty' | 'ok';

/**
 * Each column of a vertical exercise: a wrong digit in any of its boxes (the
 * result row, a hidden operand digit), else an empty box, else done. A box to
 * the left of the answer (the thousands box over 917, stations 3–7) holds no
 * digit: empty or 0 is right there.
 */
function verticalColumnStatus(
  s: Pick<WorkspaceState, 'sessionNumber' | 'isASD' | 'answerDigits' | 'operandDigits'>,
  task: SessionTask
): Array<{ place: Place; status: ColumnStatus }> {
  const { a, b, target } = effectiveArithmetic(task, s.isASD);
  const typed = effectiveAnswerDigits(s, task, target);
  const resultPlaces = PLACE_ORDER.slice(0, resultBoxCount(s.sessionNumber, a, b, target));
  return PLACE_ORDER.map((place) => {
    const boxes: Array<{ typed: string; expected: number | null }> = [];
    if (resultPlaces.includes(place) && !task.revealedResultDigits?.includes(place)) {
      const beyond = place !== 'units' && Math.abs(target) < PLACE_VALUES[place];
      boxes.push({ typed: typed[place] ?? '', expected: beyond ? null : digitAt(target, place) });
    }
    for (const which of ['a', 'b'] as const) {
      if (task.hiddenDigits?.[which]?.includes(place)) {
        boxes.push({ typed: s.operandDigits[which][place] ?? '', expected: digitAt(which === 'a' ? a : b, place) });
      }
    }
    let status: ColumnStatus = 'ok';
    for (const box of boxes) {
      if (box.expected === null) {
        if (box.typed !== '' && box.typed !== '0') status = 'wrong';
        continue;
      }
      if (box.typed === '') {
        if (status === 'ok') status = 'empty';
      } else if (parseInt(box.typed, 10) !== box.expected) {
        status = 'wrong';
      }
    }
    return { place, status };
  });
}

/**
 * The column whose blocks do not show what the exercise's board check wants
 * (the lowest): 10 or more blocks in a column, or a column whose blocks are
 * not the result's digit. Null when the board passes, and in meeting 8 (no
 * blocks on the screen).
 */
function verticalBoardPlace(s: Pick<WorkspaceState, 'sessionNumber' | 'isASD' | 'counts'>, task: SessionTask): Place | null {
  if (s.sessionNumber === 8) return null;
  const { a, b, target } = effectiveArithmetic(task, s.isASD);
  const value = getValue(s.counts);
  const discovered = (task.hiddenDigits?.a?.length ? [a] : []).concat(task.hiddenDigits?.b?.length ? [b] : []);
  const shows = value === target || (s.sessionNumber >= 3 && s.sessionNumber <= 7 && discovered.includes(value)) ? value : target;
  const crowded = PLACE_ORDER.find((p) => s.counts[p] >= 10);
  if (value === shows && !crowded) return null;
  return crowded ?? PLACE_ORDER.find((p) => s.counts[p] !== digitAt(shows, p)) ?? null;
}

/**
 * The column a coaching card is about, for every trigger (1.10.2026). The
 * request for the engine's card and SOCRATIC_CARD_SHOWN.column_index read it
 * through socraticCardPlace.
 *  - A pause, an undo run (and any trigger opened without its own column):
 *    the box the child stands in, else — meeting 8, which records its
 *    conversions there — the memory circle the child stands in, else the
 *    first unsolved column from the units: a wrong or empty box, else the
 *    column whose blocks the board check still wants.
 *  - A second wrong "התקדם" ('repeated_errors'): the press took the focus
 *    away, so the box says nothing — the lowest column with a WRONG digit,
 *    else the lowest empty one, else the blocks' column.
 *  - The "four errors" streak and a conversion not performed pass their own
 *    column (the streak's, the one just typed in): the cursor has already
 *    moved on to the next box by then.
 * A representation exercise: the column of the conversion still to do, else
 * the lowest column whose blocks differ from the instruction, else the lowest
 * wrong or empty digit of the answer. Null when the exercise has no columns.
 */
export function cardFocusPlace(
  s: Pick<WorkspaceState, 'sessionNumber' | 'isASD' | 'focusedPlace' | 'answerDigits' | 'operandDigits' | 'counts' | 'conversionsByColumn'>,
  task: SessionTask | null | undefined,
  reason: SocraticTriggerReason,
  focusedMemoryCircle: Place | null = null
): Place | null {
  // The box the child stands in comes first, with or without a lesson task:
  // meeting 2's diagnostic exercises have none, and their HESITATION_DETECTED
  // still names the focused column.
  if (reason !== 'repeated_errors') {
    if (s.focusedPlace) return s.focusedPlace;
    // Meeting 8 records its conversions in the memory circles. Elsewhere the
    // circle stays out of what is recorded (register gap יט).
    if (focusedMemoryCircle && s.sessionNumber === 8) return focusedMemoryCircle;
  }
  if (!task) return null;
  if (isVerticalTask(task)) {
    const columns = verticalColumnStatus(s, task);
    const first = (wanted: ColumnStatus[]) => columns.find((c) => wanted.includes(c.status))?.place ?? null;
    const typed = reason === 'repeated_errors' ? first(['wrong']) ?? first(['empty']) : first(['wrong', 'empty']);
    return typed ?? verticalBoardPlace(s, task);
  }
  if (task.type === 'representation' || task.type === 'flexible_decomp') {
    const pending = pendingRepresentationConversion(s, task);
    if (pending) return pending;
    // A board worth the number is right where any build is (owner, 4.10.2026).
    if (task.requiredCounts && !builtAnyWay(task, s.counts)) {
      const required = requiredCountsOf(task);
      const board = PLACE_ORDER.find((p) => (s.counts[p] ?? 0) !== required[p]);
      if (board) return board;
    }
    if (task.type === 'representation' && typeof task.correctAnswer === 'number') {
      const answer = task.correctAnswer;
      const width = String(Math.abs(answer)).length;
      const wrongOrEmpty = PLACE_ORDER.slice(0, width).find((p) => {
        const d = s.answerDigits[p] ?? '';
        return d === '' || parseInt(d, 10) !== digitAt(answer, p);
      });
      if (wrongOrEmpty) return wrongOrEmpty;
    }
    return null;
  }
  return null;
}

/** The store fields the static card chooser reads (staticCardContextFor). */
export type StaticCardStoreState = Pick<WorkspaceState, 'placeCuesShown' | 'socraticCardKinds'> &
  Partial<Pick<WorkspaceState,
    | 'conversionsByColumn' | 'hasGrouped' | 'hasUngrouped' | 'counts'
    | 'sessionNumber' | 'isASD' | 'socraticTriggerReason' | 'socraticCardPlace'
    | 'answerDigits' | 'carryDigits' | 'operandDigits' | 'boardOpen' | 'hasDeletedBlock' | 'takeAwayTrack'>>;

/** Subtraction with blocks, one exercise: the board held the first number (`held`); a block left it after that (`started`). */
export interface TakeAwayTrack {
  taskId: string;
  held: boolean;
  started: boolean;
}

/**
 * The take-away record after the board went from `before` to `after` in the
 * exercise `taskId` whose first number is `a` (final review, 2.10.2026):
 *  - a board emptied (the trash button, or every block thrown away) starts
 *    over — it is not taking away;
 *  - taking away starts when a block leaves the board after the board held
 *    `a` and the board is then worth less than `a` — never while the child
 *    is still building it (806 − 351 built as 9 hundreds, one thrown away,
 *    then units added; 54 built for 53 and one unit thrown away);
 *  - a board worth `a` or more again has not started taking away (blocks
 *    put back, or a slip while building);
 *  - the board holding `a` is recorded.
 * Undo does not come through here: it restores the record its frame kept
 * (UndoFrame.takeAwayTrack), so undoing the building of `a` is not taking away.
 */
export function nextTakeAwayTrack(prev: TakeAwayTrack | null | undefined, taskId: string, a: number, before: number, after: number): TakeAwayTrack {
  if (after === 0) return { taskId, held: false, started: false };
  const t = prev && prev.taskId === taskId ? prev : { taskId, held: false, started: false };
  const held = t.held || after === a;
  return { taskId, held, started: held && after < a && (t.started || after < before) };
}

/** A saved take-away record back into shape (the database drops false and null alike). */
function restoredTakeAwayTrack(raw: unknown): TakeAwayTrack | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!r || typeof r.taskId !== 'string') return null;
  return { taskId: r.taskId, held: r.held === true, started: r.started === true };
}

/** View only (WorkspaceState.heldFromTrack): the board has held the number the board work starts from. */
export interface HeldFromTrack {
  taskId: string;
  held: boolean;
}

/**
 * The held-from record after the board went to `after` in the exercise
 * `taskId` whose board work starts from `from` — `held` exactly as
 * nextTakeAwayTrack keeps it for the first number: a board emptied starts
 * over, and the board worth `from` once is recorded.
 */
export function nextHeldFromTrack(prev: HeldFromTrack | null | undefined, taskId: string, from: number, after: number): HeldFromTrack {
  if (after === 0) return { taskId, held: false };
  return { taskId, held: (prev?.taskId === taskId && prev.held) || after === from };
}

/** A saved held-from record back into shape (the database drops false and null alike). */
function restoredHeldFromTrack(raw: unknown): HeldFromTrack | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!r || typeof r.taskId !== 'string') return null;
  return { taskId: r.taskId, held: r.held === true };
}

/** Subtraction with blocks: taking away has started in this exercise (takeAwayTrack). */
function takingAwayStarted(s: StaticCardStoreState, taskId: string): boolean {
  const t = s.takeAwayTrack;
  return Boolean(t && t.taskId === taskId && t.started);
}

/**
 * What the static card chooser needs beyond the board, for the exercise
 * `taskId` (2.10.2026, audit D1 — every field the cards read, from the store):
 * the cards already shown, how far a break or grouping has gone, the trigger
 * and the column of the card, the digits typed (result row, memory circles,
 * hidden operand digits), the conversions done per column, whether the
 * number house is hidden, and whether taking away has started. `opening` is the trigger and the column of a card that is opening
 * now: socraticCardRefusal and openSocraticCard compute the card before the
 * store records them (socraticTriggerReason, socraticCardPlace).
 */
export function staticCardContextFor(
  s: StaticCardStoreState,
  taskId: string | undefined,
  task?: SessionTask | null,
  opening?: { reason: SocraticTriggerReason; place: Place | null }
): StaticCardContext {
  const shown = s.socraticCardKinds;
  const sameTask = Boolean(task && task.id === taskId);
  const conversions = sameTask
    ? conversionContextFor({
        conversionsByColumn: s.conversionsByColumn ?? emptyColumnConversions(),
        counts: s.counts,
        hasGrouped: s.hasGrouped === true,
        hasUngrouped: s.hasUngrouped === true,
      }, task)
    : {};
  const out: StaticCardContext = {
    placeCuesShown: s.placeCuesShown === true,
    shownKinds: shown && taskId && shown.taskId === taskId ? shown.kinds : [],
    ...conversions,
  };
  const trigger = opening?.reason ?? s.socraticTriggerReason ?? null;
  if (trigger) out.trigger = trigger;
  const focus = opening ? opening.place : s.socraticCardPlace ?? null;
  if (focus) out.focusColumn = focus;
  if (s.answerDigits) out.answerDigits = s.answerDigits;
  if (s.carryDigits) out.memoryCircles = s.carryDigits;
  if (s.operandDigits) out.operandDigits = s.operandDigits;
  if (!sameTask || !task) return out;
  // The conversions done per column — the same reading as the engine's
  // request (fetchSocraticHint): the blocks, or meeting 8's memory circles.
  if (typeof task.numberA === 'number' && typeof task.numberB === 'number' && s.sessionNumber !== undefined) {
    const { a, b } = effectiveArithmetic(task, s.isASD === true);
    const sub = task.isSubtraction;
    out.conversionsDone = PLACE_ORDER.filter((p) => columnRequiresConversion(p, a, b, sub) &&
      conversionRecordedInColumn({
        sessionNumber: s.sessionNumber as SessionNumber,
        carryDigits: s.carryDigits ?? {},
        conversionsByColumn: s.conversionsByColumn ?? emptyColumnConversions(),
      }, p, sub));
  }
  // Stations 3–7: the child hid the number house with the top-bar button.
  if (s.sessionNumber !== undefined && s.boardOpen !== undefined && s.sessionNumber >= 3 && s.sessionNumber <= 7) {
    out.boardHidden = !s.boardOpen && !boardStaysOpen(s.sessionNumber);
  }
  if (task.isSubtraction && typeof task.numberA === 'number') {
    if (s.takeAwayTrack !== undefined) out.blocksRemoved = takingAwayStarted(s, task.id);
  } else if (s.hasDeletedBlock !== undefined) {
    out.blocksRemoved = s.hasDeletedBlock === true;
  }
  // No previous card here (audit D18): the levels follow the kinds already
  // shown, and the card identity is the store's (socraticCardRefusal).
  return out;
}

function withCardKind(
  shown: WorkspaceState['socraticCardKinds'] | undefined,
  taskId: string,
  kind: StaticCardKind
): WorkspaceState['socraticCardKinds'] {
  const kinds = shown && shown.taskId === taskId ? shown.kinds : [];
  return { taskId, kinds: kinds.includes(kind) ? kinds : [...kinds, kind] };
}

/** A saved record back into shape: the database drops an empty list and a null id. */
function restoredCardKinds(raw: unknown): WorkspaceState['socraticCardKinds'] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { taskId?: unknown; kinds?: unknown };
  const list = Array.isArray(r.kinds) ? r.kinds : r.kinds && typeof r.kinds === 'object' ? Object.values(r.kinds) : [];
  const kinds = list.filter((k): k is StaticCardKind => (STATIC_CARD_KINDS as readonly unknown[]).includes(k));
  return { taskId: typeof r.taskId === 'string' ? r.taskId : null, kinds };
}

const TRIGGER_REASONS: readonly SocraticTriggerReason[] = ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4', 'conversion_not_performed', 'consecutive_undos_3'];
const PLACES: readonly Place[] = ['units', 'tens', 'hundreds', 'thousands'];

/** A saved card history back into shape: the database drops empty lists, null fields and false booleans' absence alike. */
export type ReflectionStep = 1 | 2 | 3;
export type ReflectionEffortId = 'EASY' | 'MEDIUM' | 'HARD';
export interface ReflectionDraft {
  step: ReflectionStep;
  effortLevel: ReflectionEffortId | null;
  strategies: string[];
}

export function freshReflectionDraft(): ReflectionDraft {
  return { step: 1, effortLevel: null, strategies: [] };
}

/**
 * The reflection board from a snapshot. The database drops null and an empty
 * list, so a draft saved on stage 1 with nothing chosen comes back as
 * { step: 1 } — and a snapshot from before the draft was saved, as nothing.
 */
export function restoredReflectionDraft(raw: unknown): ReflectionDraft {
  if (!raw || typeof raw !== 'object') return freshReflectionDraft();
  const r = raw as Record<string, unknown>;
  const step: ReflectionStep = r.step === 2 || r.step === 3 ? r.step : 1;
  const effortLevel = r.effortLevel === 'EASY' || r.effortLevel === 'MEDIUM' || r.effortLevel === 'HARD' ? r.effortLevel : null;
  const list: unknown[] = Array.isArray(r.strategies) ? r.strategies : (r.strategies && typeof r.strategies === 'object' ? Object.values(r.strategies) : []);
  const strategies = Array.from(new Set(list.filter((x): x is string => typeof x === 'string')));
  // Stages 2 and 3 come after a level was chosen: without one the board starts at stage 1.
  return { step: effortLevel ? step : 1, effortLevel, strategies };
}

function restoredCardHistory(raw: unknown): WorkspaceState['socraticCardHistory'] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { taskId?: unknown; cards?: unknown };
  const list = Array.isArray(r.cards) ? r.cards : r.cards && typeof r.cards === 'object' ? Object.values(r.cards) : [];
  const cards: SocraticCardRecord[] = [];
  for (const item of list) {
    const c = (item && typeof item === 'object' ? item : null) as Record<string, unknown> | null;
    if (!c || !(TRIGGER_REASONS as readonly unknown[]).includes(c.reason) || typeof c.staticQuestionHe !== 'string') continue;
    cards.push({
      reason: c.reason as SocraticTriggerReason,
      place: (PLACES as readonly unknown[]).includes(c.place) ? (c.place as Place) : null,
      kind: (STATIC_CARD_KINDS as readonly unknown[]).includes(c.kind) ? (c.kind as StaticCardKind) : null,
      family: typeof c.family === 'string' ? c.family : null,
      staticQuestionHe: c.staticQuestionHe,
      questionHe: typeof c.questionHe === 'string' ? c.questionHe : null,
      shown: c.shown === true,
      answeredCorrect: typeof c.answeredCorrect === 'boolean' ? c.answeredCorrect : null,
      openedAt: typeof c.openedAt === 'number' ? c.openedAt : 0,
    });
  }
  return { taskId: typeof r.taskId === 'string' ? r.taskId : null, cards };
}

function resetTaskInteraction(_isASD = false) {
  return {
    counts: { ...EMPTY_COUNTS },
    undoStack: [] as UndoFrame[],
    regroupTriggerTimestamps: {} as Record<number, number>,
    hasInteracted: false,
    placeCuesShown: false,
    socraticCardKinds: { taskId: null as string | null, kinds: [] as StaticCardKind[] },
    socraticCardHistory: { taskId: null as string | null, cards: [] as SocraticCardRecord[] },
    previousSocraticCard: null as (SocraticCardRecord & { taskId: string }) | null,
    hasDeletedBlock: false,
    takeAwayTrack: null as TakeAwayTrack | null,
    heldFromTrack: null as HeldFromTrack | null,
    hasClearedBoard: false,
    blocksAddedCount: 0,
    hasUngrouped: false,
    hasGrouped: false,
    conversionsByColumn: emptyColumnConversions(),
    selectedChoiceId: null as string | null,
    answerDigits: {} as Partial<Record<Place, string>>,
    carryDigits: {} as Partial<Record<Place, string>>,
    probeAnswer: '',
    lastSubmittedAnswer: null as string | null,
    q3Reps: [] as PlaceCounts[],
    operandDigits: { a: {}, b: {} } as { a: Partial<Record<Place, string>>; b: Partial<Record<Place, string>> },
    socraticTriggerReason: null as SocraticTriggerReason | null,
    focusedPlace: null as Place | null,
    undoCount: 0,
    digitErrorStreak: 0,
    digitErrorStreakPlace: null as Place | null,
    socraticCardPlace: null as Place | null,
    hesitationCount: 0,
    hesitationTimerSeconds: 0,
    consecutiveErrorCount: 0,
    consecutiveUndoCount: 0,
    undoTimestamps: [],
    isBoardLocked: false,
    // Not here: hasRequestedBasicHelp. The call-teacher button follows the
    // record's helpRequested (PRD 29 §ב, "מיתוג דו-כיווני"; מסמך 03 §3.1,
    // "ניתנת לביטול בכל עת"), so a call made in one exercise can be taken
    // back in the next. Clearing it here lost the call at every exercise.
    // Nor isAdditionHelperOpen / additionHelperOffered: the grid and its
    // return tab belong to the meeting (register 18, decision ב) — initSession
    // clears them when a meeting starts.
    helpRequestCount: 0,
    taskStartTime: Date.now(),
    keyboardState: 'UNLOCKED' as KeyboardState,
    hasDigitErrorInTask: false,
  };
}

/**
 * Effective operands + result for an arithmetic task, ASD-aware.
 * The result is DERIVED from the displayed operands so the shown exercise and the
 * validated answer can never diverge.
 */
export function effectiveArithmetic(
  task: { numberA?: number; numberB?: number; asdNumberA?: number; asdNumberB?: number; isSubtraction?: boolean },
  isASD: boolean
): { a: number; b: number; target: number } {
  const a = isASD && task.asdNumberA !== undefined ? task.asdNumberA : task.numberA ?? 0;
  const b = isASD && task.asdNumberB !== undefined ? task.asdNumberB : task.numberB ?? 0;
  const target = task.isSubtraction ? a - b : a + b;
  return { a, b, target };
}

/** Concatenated per-place answer digits → number (vanilla joins input values in DOM order). */
export function answerDigitsToNumber(digits: Partial<Record<Place, string>>): number | null {
  const order: Place[] = ['thousands', 'hundreds', 'tens', 'units'];
  const str = order.map((p) => digits[p] ?? '').join('');
  if (!str) return null;
  const n = parseInt(str, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * The single answer box (stations 3 and 7, owner 30.9.2026) holds a free
 * number of up to four digits — every answer of the green path is below
 * 10,000. It is kept as the result row's digits, right-aligned: "340" →
 * hundreds 3, tens 4, units 0; anything but a digit is dropped.
 */
/**
 * A one-digit box after a keystroke: the digit just typed. The boxes have no
 * maxLength, so a child who clicks a box with a wrong digit can write over it
 * (they select their digit on focus, too). Whichever side of the old digit
 * the caret was on, the old digit is dropped and the new one kept — taking
 * the last character kept the old digit when the caret stood before it.
 */
export function digitJustTyped(value: string, previous: string): string {
  const raw = value.replace(/[^0-9]/g, '');
  const prev = previous.replace(/[^0-9]/g, '');
  // An empty box keeps the first digit of what arrived (a paste of "123" → "1").
  if (!prev) return raw.slice(0, 1);
  let typed = raw;
  if (raw.length > 1) {
    if (raw.startsWith(prev)) typed = raw.slice(prev.length);
    else if (raw.endsWith(prev)) typed = raw.slice(0, raw.length - prev.length);
  }
  return typed.slice(-1);
}

export function answerDigitsFromText(text: string): Partial<Record<Place, string>> {
  const digits = text.replace(/[^0-9]/g, '').slice(0, PLACE_ORDER.length);
  const out: Partial<Record<Place, string>> = {};
  [...digits].reverse().forEach((d, i) => {
    out[PLACE_ORDER[i]] = d;
  });
  return out;
}

/** …and back, as the box shows it: the digits from the highest place written. */
export function answerTextFromDigits(digits: Partial<Record<Place, string>>): string {
  return [...PLACE_ORDER].reverse().map((p) => digits[p] ?? '').join('');
}

/**
 * The first conversion a representation exercise asks for that the blocks
 * have not performed yet (REPRESENTATION_LOCKS: the receiving column of a
 * decomposition, the source column of a composition), or null when every one
 * is done — or the exercise lists none. A column listed twice (s7_g_t1 groups
 * ten hundreds twice) waits for its second conversion. A save from before the
 * count (no `times`) knows only that the column converted: when the board
 * already shows the exercise's final blocks, the column counts as done, so no
 * child is stuck after a reload.
 */
export function pendingRepresentationConversion(
  s: Pick<WorkspaceState, 'conversionsByColumn'> & Partial<Pick<WorkspaceState, 'counts'>>,
  task: (Pick<SessionTask, 'id'> & Partial<Pick<SessionTask, 'requiredCounts'>>) | null | undefined
): Place | null {
  const lock = task ? REPRESENTATION_LOCKS[task.id] : undefined;
  if (!lock) return null;
  const decomposition = lock.conversion === 'decomposition';
  const conv = s.conversionsByColumn;
  const kind = decomposition ? 'decomposed' : 'composed';
  const finalBoard = Boolean(s.counts && task?.requiredCounts) &&
    countsEqual({ ...EMPTY_COUNTS, ...s.counts }, { ...EMPTY_COUNTS, ...task!.requiredCounts });
  return lock.columns.find((p, i) => {
    const listed = lock.columns.filter((q) => q === p).length;
    const olderSave = listed > 1 && typeof conv.times?.[kind]?.[p] !== 'number' && conversionDoneInColumn(conv, p, decomposition);
    if (olderSave && finalBoard) return false;
    const nth = lock.columns.slice(0, i + 1).filter((q) => q === p).length;
    return conversionTimesInColumn(conv, p, decomposition) < nth;
  }) ?? null;
}

/**
 * A break or grouping exercise (station 3's compose_break, station 7's
 * compose_group): whether its conversions are done, which one is next, and
 * whether the next repeats a column already converted ("קבצו שוב"). The
 * static card waits with C1/C7 until they are done (owner, 30.9.2026).
 */
function conversionContextFor(
  s: Pick<WorkspaceState, 'conversionsByColumn' | 'hasGrouped' | 'hasUngrouped'> & Partial<Pick<WorkspaceState, 'counts'>>,
  task: SessionTask | null | undefined
): Pick<StaticCardContext, 'conversionDone' | 'pendingConversion' | 'conversionAgain'> {
  const kind = task?.representationKind;
  // Meeting 1's 347 (break a ten) and 26 (group the units) have no kind but
  // a lock (REPRESENTATION_LOCKS): the board can show their final blocks
  // built by hand, with nothing broken or grouped (audit D16, 2.10.2026).
  // Station 7's 2,730 (owner, 4.10.2026) opens with its blocks too, and groups twice.
  const meeting1Lock = Boolean(task && !kind && (task.id.startsWith('s1_') || task.initialCounts) && REPRESENTATION_LOCKS[task.id]);
  if (!task || (kind !== 'compose_break' && kind !== 'compose_group' && !meeting1Lock)) return {};
  const lock = REPRESENTATION_LOCKS[task.id];
  if (!lock) return { conversionDone: kind === 'compose_group' ? s.hasGrouped === true : s.hasUngrouped === true };
  const pending = pendingRepresentationConversion(s, task);
  return {
    conversionDone: pending === null,
    pendingConversion: pending,
    conversionAgain: pending !== null && conversionTimesInColumn(s.conversionsByColumn, pending, lock.conversion === 'decomposition') > 0,
  };
}

const placeAbove = (p: Place): Place | undefined => PLACE_ORDER[PLACE_ORDER.indexOf(p) + 1];

/**
 * Station 3's "do the break yourselves" (owner, 30.9.2026). It used to say
 * "לחצו על לבנת עשרת" in every exercise, also where a hundred or a thousand is
 * broken; it names the block above the column still waiting for its ten.
 */
export function breakItYourselvesHe(receiving: Place | null): string {
  return `הלבנים מסודרות נכון, אבל המשימה היא לפרוט בעצמכם. בנו את הלבנים שבהנחיה. ${breakClickHe(receiving)}`;
}

/** Station 7's "do the grouping yourselves": the button of the column to group, in its own words (PlaceColumn). */
export function groupItYourselvesHe(source: Place | null): string {
  return `הלבנים מסודרות נכון, אבל המשימה היא לקבץ בעצמכם. בנו את הלבנים שבהנחיה. ${groupClickHe(source)}`;
}

/**
 * A break or grouping exercise whose board still shows the blocks the
 * instruction's first sentence builds — the conversion not yet made (A4-F01).
 * "בדקו כמה לבנים יש בכל טור" pointed the child at counts that were right; the
 * step still missing is the break / the grouping. The board before the
 * conversions is requiredCounts with every listed conversion undone
 * (REPRESENTATION_LOCKS: the receiving column of a break, the source column of
 * a grouping) — the same fact functions reads as built_before_conversion.
 */
export function boardBeforeConversion(task: SessionTask): PlaceCounts | null {
  const lock = REPRESENTATION_LOCKS[task.id];
  if (!lock || !task.requiredCounts) return null;
  const board: PlaceCounts = { ...EMPTY_COUNTS, ...task.requiredCounts };
  for (const p of lock.columns) {
    const above = placeAbove(p);
    if (!above) return null;
    if (lock.conversion === 'decomposition') {
      board[p] -= 10;
      board[above] += 1;
    } else {
      board[p] += 10;
      board[above] -= 1;
    }
  }
  return PLACE_ORDER.every((p) => board[p] >= 0) ? board : null;
}

/** The click that makes the pending break, as breakItYourselvesHe names it. */
function breakClickHe(receiving: Place | null): string {
  const above = receiving ? placeAbove(receiving) : undefined;
  return above
    ? `לחצו על לבנת ${BLOCK_NAME_HE[above]} כדי לפרוט אותה.`
    : 'לחצו על הלבנה שההנחיה מבקשת לפרוט.';
}

/** The button that makes the pending grouping, in its own words (PlaceColumn). */
function groupClickHe(source: Place | null): string {
  const above = source ? placeAbove(source) : undefined;
  return source && above
    ? `לחצו על הכפתור "קבצו 10 ל${BLOCK_NAME_HE[above]}" שבראש טור ה${PLACE_NAMES_HE[source]}.`
    : 'קבצו 10 לבנים בעזרת הכפתור שבראש הטור.';
}

/** The board shows the blocks the instruction builds; the break is still to come. */
export function breakNowHe(receiving: Place | null): string {
  return `בניתם את הלבנים שבהנחיה. עכשיו ${breakClickHe(receiving)}`;
}

/** The board shows the blocks the instruction builds; the grouping is still to come. */
export function groupNowHe(source: Place | null): string {
  return `בניתם את הלבנים שבהנחיה. עכשיו ${groupClickHe(source)}`;
}

/** The block a decomposition exercise is built from (450 → the tens). */
function decomposeBlockPlace(task: SessionTask): Place {
  return PLACE_ORDER.find((p) => (task.requiredCounts?.[p] ?? 0) > 0) ?? 'units';
}

/**
 * The number the result row of a vertical exercise shows, read by place. A box
 * left empty to the right of a digit makes it no number (NaN): in stations 3–7
 * the row has a box for every place of the longest number (owner, 30.9.2026),
 * and 9, 1, 7 in the thousands, hundreds and tens boxes over 917 is not 917 —
 * joined, it was. Empty boxes on the left are leading zeros; null when nothing
 * is typed.
 */
export function resultRowValue(digits: Partial<Record<Place, string>>): number | null {
  let value: number | null = null;
  for (const p of ['thousands', 'hundreds', 'tens', 'units'] as Place[]) {
    const d = digits[p] ?? '';
    if (d === '') {
      if (value !== null) return NaN;
      continue;
    }
    const n = parseInt(d, 10);
    if (Number.isNaN(n)) return NaN;
    value = (value ?? 0) * 10 + n;
  }
  return value;
}

/** Effective scaffold level of the current task (correction subtasks scaffold at 1). */
function sanitizeSessionNumber(n: any): SessionNumber {
  const parsed = parseInt(n, 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 8) return 1;
  return parsed as SessionNumber;
}

/**
 * Whether the number house is on screen. In station 1 it always is (owner,
 * 27.9.2026): even a boardOpen:false left in the store by another meeting, or
 * by anything else, cannot hide it there.
 */
export function selectBoardOpen(s: WorkspaceState): boolean {
  return s.boardOpen || boardStaysOpen(s.sessionNumber);
}

export function selectScaffoldLevel(s: WorkspaceState): number {
  if (s.sessionNumber === 2) {
    if (isSubtaskActive(s.qflow)) return 1;
    return getCurrentQTask(s.qflow)?.scaffoldLevel ?? 1;
  }
  const task = getActiveTasks(s)[s.standardTaskIdx];
  return task?.scaffoldLevel ?? 1;
}

/**
 * The exercise the learner is on, for telemetry. Meeting 2 runs on the Q-matrix
 * flow and has no task list, so every drag, digit, deletion, undo and hesitation
 * of the diagnostic was filed under one invented exercise "ex_2_01": the
 * teacher's timeline had a single chapter for the whole meeting, and the server
 * could never pair a wrong digit with its task.
 */
export function activeExerciseId(s: WorkspaceState): string {
  const id = s.sessionNumber === 2 ? getCurrentQTask(s.qflow)?.id : getActiveTasks(s)[s.standardTaskIdx]?.id;
  return id || `ex_${s.sessionNumber}_01`;
}

/**
 * What a typed digit of meeting 2 is judged against: the diagnostic task on
 * the screen (QMatrix), in the shape computeExpectedDigitForColumn reads.
 *
 * The digit setters used to look the task up in the meetings 3–7 task list,
 * which is empty in meeting 2, so every digit of the diagnostic was sent with
 * is_correct: null. PRD Module 23 §ב counts a task as solved on the first
 * attempt only when no DIGIT_ENTERED with is_correct === false came before its
 * PROBLEM_COMPLETE — so a wrong digit the child then corrected never counted,
 * and the diagnostic score (server: sessionTrigger → computeFirstAttemptScore)
 * was higher than the formula gives.
 *
 * Owner's rulings, 28.9.2026:
 *  1. Task 2 (one answer box) is judged by the value in the box when "התקדם"
 *     is pressed (proceedQ). Its keystrokes are not judged — null — because
 *     "4" on the way to "40" is not a wrong answer.
 *  2. Every other task: each typed digit is judged against its column, and a
 *     wrong digit counts even if the child corrects it later (PRD 23).
 *
 * In the correction round's simpler exercise the probe is the exercise, and
 * proceedQ grades against its answer, so the digits are judged against it too.
 */
export function diagnosticDigitTask(
  qflow: QMatrixFlowState,
  isASD: boolean
): { numberA?: number; numberB?: number; isSubtraction?: boolean; correctAnswer?: number } | null {
  const task = getCurrentQTask(qflow);
  if (!task || task.type === 'digit_value') return null;
  if (isSubtaskActive(qflow)) {
    const d = task.backwardDiagnosis;
    const answer = isASD && d?.asdProbeAnswer !== undefined ? d.asdProbeAnswer : d?.probeAnswer;
    if (answer === undefined) return null;
    const a = isASD && d?.asdProbeA !== undefined ? d.asdProbeA : d?.probeA;
    const b = isASD && d?.asdProbeB !== undefined ? d.asdProbeB : d?.probeB;
    return { numberA: a, numberB: b, isSubtraction: task.isSubtraction, correctAnswer: answer };
  }
  // proceedQ grades against task.correctAnswer; the digits follow the same answer.
  return { numberA: task.numberA, numberB: task.numberB, isSubtraction: task.isSubtraction, correctAnswer: task.correctAnswer };
}

/**
 * The bank a saved branch choice ran on: the compulsory exercises plus that
 * branch's tasks, both from the path the meeting was pinned to (Module 26: a
 * restored branch used to be rebuilt from the green bank and stayed green for
 * the rest of the meeting). No known path, no tasks.
 */
function restoredBranchTasks(
  sessionNumber: number,
  branch: 'reinforcement' | 'challenge' | null,
  path: LearningPath | null
): SessionTask[] | null {
  if (!branch || sessionNumber < 3 || sessionNumber > 7) return null;
  if (!path) return null;
  const extra = getSessionBranchTasks(sessionNumber as any, branch, path);
  if (extra.length === 0) return null;
  return [...(getSessionTasks(sessionNumber as any, path) ?? []), ...extra];
}

/**
 * Meeting 1 as it ran until the owner's decision of 27.9.2026 (register,
 * decision י): the target task 347 came before the grouping exercise.
 *
 * The saved workspace records the exercise by its place in the list
 * (standardTaskIdx) and by its id (activeTask.id). A learner who was in the
 * middle of meeting 1 when the new order reached them — with this deploy, or
 * later when the catalog is published again (Module 26) — has a place counted
 * in this old order. Neither place in the new order is right for them: one
 * standing on the target task would skip the grouping exercise, and one
 * standing on the grouping exercise would do the target task again. So they
 * finish the meeting in the order they started it; the next meeting 1 they
 * start is in the new order.
 */
export const SESSION1_ORDER_BEFORE_27_9: readonly string[] = [
  's1_sandbox_controlled',
  's1_decompose_hundred',
  's1_build_305',
  's1_undo_trash',
  's1_target_347',
  's1_r_group26',
  's1_t8',
  's1_r_sub61',
  's1_r_sub806',
];

/**
 * Meeting 1 before the two refresh exercises of 29.9.2026 (owner: the value of
 * a digit, and a number written in words — diagnostic tasks 2 and 4 had none).
 */
export const SESSION1_ORDER_BEFORE_29_9: readonly string[] = [
  's1_sandbox_controlled',
  's1_decompose_hundred',
  's1_build_305',
  's1_undo_trash',
  's1_r_group26',
  's1_target_347',
  's1_t8',
  's1_r_sub61',
  's1_r_sub806',
];

/** Meeting 1 on 29.9.2026 before the refresh exercise for diagnostic task 1 (703) was added. */
export const SESSION1_ORDER_29_9_MIDDAY: readonly string[] = [
  's1_sandbox_controlled',
  's1_decompose_hundred',
  's1_build_305',
  's1_undo_trash',
  's1_r_value368',
  's1_r_words482',
  's1_r_group26',
  's1_target_347',
  's1_t8',
  's1_r_sub61',
  's1_r_sub806',
];

/**
 * The list a restored meeting 1 goes on with, or null for the meeting's bank
 * as usual. When the saved place and id disagree with the bank, the place was
 * counted in another order of the same exercises: the one before 27.9.2026
 * (SESSION1_ORDER_BEFORE_27_9), or — on a device whose cached catalog is
 * still the old one — the new order of this code. The learner goes on in the
 * order the place was counted in.
 */
function restoredSession1Order(saved: { standardTaskIdx?: number; activeTask?: { id?: unknown } | null }): SessionTask[] | null {
  const idx = saved.standardTaskIdx ?? 0;
  const savedId = saved.activeTask?.id;
  const bank = getSessionTasks(1) ?? [];
  // The place and the id agree with the bank, or there is no id to compare
  // (a snapshot trimmed to its minimal core): nothing to translate.
  if (typeof savedId !== 'string' || bank[idx]?.id === savedId) return null;
  // The exercises this device knows: the cached bank, and this code's own (a
  // place counted in a newer order can reach a device whose cached catalog is older).
  const byId = new Map([...SESSION1_TASKS, ...bank].map((t) => [t.id, t]));
  const codeIds = SESSION1_TASKS.map((t) => t.id);
  const withAdded = (ids: readonly string[]) => [...ids, ...codeIds.filter((id) => !ids.includes(id))];
  // Each known order as it was, and as it goes on once the exercises added
  // since are put at its end (a second reload on one of those lands here).
  const knownOrders = [SESSION1_ORDER_BEFORE_27_9, SESSION1_ORDER_BEFORE_29_9, SESSION1_ORDER_29_9_MIDDAY, codeIds].flatMap((ids) => [ids, withAdded(ids)]);
  const order = knownOrders.find((ids) => ids[idx] === savedId && ids.every((id) => byId.has(id)));
  if (!order) return null;
  // Exercises of the bank the order does not hold come at its end.
  const rest = bank.filter((t) => !order.includes(t.id));
  return [...order.map((id) => byId.get(id)!), ...rest];
}

export function getActiveTasks(s: WorkspaceState): SessionTask[] {
  // Session 2 runs through the Q-Matrix flow — it has no standard task list.
  if (s.sessionNumber === 2) return [];
  if (s.dynamicTasks) return s.dynamicTasks;
  // מודול 26 §ב: המאגר נקבע לפי המסלול שננעץ בתחילת התרגיל, לא לפי הערך
  // החי. שינוי מסלול באמצע תרגיל נכנס לתוקף רק בתרגיל הבא (ראו activeBankPath).
  const path = s.activeBankPath ?? resolveLearningPath();
  // מודול 26: "Never load, prefetch, or fall back to an exercise from the
  // non-matching bank under any circumstance." A meeting whose bank is split
  // by path has no exercises until a path is known — never the green bank by
  // default (owner, 28.9.2026: a learner without an approved path waits).
  if (!path && isPathSplitMeeting(s.sessionNumber)) return [];
  return getSessionTasks(s.sessionNumber as any, path ?? undefined) ?? [];
}

/** Meetings 3–8 load their exercises from a bank chosen by the learner's path (sessionTasks.ts). */
export function isPathSplitMeeting(sessionNumber: number): boolean {
  return sessionNumber >= 3 && sessionNumber <= 8;
}

function asLearningPath(raw: unknown): LearningPath | null {
  return raw === 'remediation_path' || raw === 'green_path' ? raw : null;
}

/**
 * The learner's approved learning path (PRD Module 20/26): the teacher-selected
 * path on the student record, or null while the record has not said which path
 * was approved — before it loads, before the gate, or after an absolute reset.
 * An unknown path is "no path", never green by default: a learner without one
 * waits (owner, 28.9.2026: "ילד לא יתחיל שלב לפני שהוא עשה את השלבים הקודמים").
 *
 * A signed-in teacher or admin with no learner number is previewing the
 * workspace, not learning in it: there is no learner path to mismatch, and the
 * preview shows the green bank as it always did.
 */
export function resolveLearningPath(): LearningPath | null {
  const auth = useAuthStore.getState();
  const authUser = auth.user;
  const students = useStore.getState().students;
  const canonical = currentStudentUid();
  const student = (canonical ? students[canonical] : null) ?? (authUser?.uid ? students[authUser.uid] : null);
  const path = recordLearningPath(student as Record<string, unknown> | null);
  if (path) return path;
  if (!canonical && isStaffViewer(auth.role ?? authUser?.role)) return 'green_path';
  return null;
}

/**
 * The path a learner record carries: `pedagogicalPath`, the field the engine
 * reads and the gate has mirrored since 2.9.2026 (#18). A learner approved
 * before that carries only `teacher_selected_path`; it counts only together
 * with the gate's approval (`teacher_gate_approved` or routeStatus APPROVED),
 * so a stale value on an unapproved record never opens a bank.
 */
export function recordLearningPath(record: Record<string, unknown> | null | undefined): LearningPath | null {
  if (!record) return null;
  const path = asLearningPath(record.pedagogicalPath);
  if (path) return path;
  const approved = record.teacher_gate_approved === true || record.routeStatus === 'APPROVED';
  return approved ? asLearningPath(record.teacher_selected_path) : null;
}

function isStaffViewer(role: unknown): boolean {
  const roles = Array.isArray(role) ? role : [role];
  return roles.some((r) => r === 'teacher' || r === 'admin');
}

/**
 * The path to pin for the coming exercise, or null when the learner record has
 * not yet said which path was approved. Pinning nothing leaves getActiveTasks
 * on the live resolution, which is itself "no path" until the record says one.
 */
export function pinnableLearningPath(): LearningPath | null {
  return resolveLearningPath();
}

/** A path saved with the workspace snapshot, or null. */
export function savedBankPath(saved: { activeBankPath?: unknown } | null | undefined): LearningPath | null {
  return asLearningPath(saved?.activeBankPath);
}

/* ── מסמך 03 exercise-shape helpers (skeletons, representations) ── */

/** Digits the learner must type into hidden operand cells, and whether each is right. */
export function hiddenDigitsStatus(
  s: Pick<WorkspaceState, 'operandDigits'>,
  task: SessionTask | null,
  a: number,
  b: number
): { complete: boolean; correct: boolean } {
  if (!task?.hiddenDigits) return { complete: true, correct: true };
  let complete = true;
  let correct = true;
  const check = (which: 'a' | 'b', value: number) => {
    for (const place of task.hiddenDigits?.[which] ?? []) {
      const typed = s.operandDigits[which][place];
      if (typed === undefined || typed === '') { complete = false; correct = false; continue; }
      if (parseInt(typed, 10) !== digitAt(value, place)) correct = false;
    }
  };
  check('a', a);
  check('b', b);
  return { complete, correct };
}

/** A skeleton exercise whose hidden digits are operand digits (not missingResultDigit). */
export function hasHiddenDigits(task: SessionTask | null): boolean {
  return Boolean(task?.hiddenDigits?.a?.length || task?.hiddenDigits?.b?.length);
}

/** Answer digits with the exercise's revealed result digits overlaid (skeleton exercises). */
export function effectiveAnswerDigits(
  s: Pick<WorkspaceState, 'answerDigits'>,
  task: SessionTask | null,
  target: number
): Partial<Record<Place, string>> {
  if (!task?.revealedResultDigits?.length) return s.answerDigits;
  const out: Partial<Record<Place, string>> = { ...s.answerDigits };
  for (const place of task.revealedResultDigits) out[place] = String(digitAt(target, place));
  return out;
}

/**
 * An exercise that is already solved has nothing left to coach: a learner who
 * typed the right result and paused before pressing "התקדם" was getting a card
 * about a regrouping the exercise never needed. Checked when the card opens
 * and again when it settles after the hourglass — a child who answered while
 * it turned gets no card (X22).
 *
 * "Solved" is exactly what "התקדם" accepts (judgeStandardTask, 1.10.2026): a
 * skeleton whose hidden boxes are all filled is not solved while a hidden
 * digit is wrong, and in stations 3–7 a right answer over blocks that do not
 * show it is not solved either — the card opens there, about the blocks (owner,
 * D4). It used to be "the result row is right and every hidden box holds a
 * digit": every card of a skeleton exercise was declined once its boxes were
 * filled (the child saw "נסו לחשוב…" and then nothing), and a representation or
 * choice exercise had no check at all — a card opened on a finished exercise.
 */
function exerciseSolvedForCard(s: WorkspaceState, task: SessionTask | null | undefined): boolean {
  if (!task || s.sessionNumber === 2) return false;
  return judgeStandardTask(s, task).kind === 'success';
}

/**
 * מסמך 03: a column "requires a conversion" when the vertical algorithm cannot
 * be completed there without one — a carry in addition, a decomposition in
 * subtraction. Shared by the keyboard lock (Module 9) and by the third coaching
 * trigger, so both agree on what a required conversion is.
 *
 * The carry or borrow coming INTO the column is the exercise's own, walked up
 * from the units — not what the child happened to write in a memory circle.
 * With the typed circle as the carry, 85 + 17 left the tens (8 + 1 + 1 = 10)
 * open until the child wrote the 1, and 512 − 13 never counted the tens
 * (1 − 1 < 1) as needing a decomposition at all.
 */
export function columnRequiresConversion(
  place: Place,
  numberA: number,
  numberB: number,
  isSubtraction: boolean | undefined
): boolean {
  let carry = 0;
  for (const p of PLACE_ORDER) {
    const da = digitAt(numberA, p);
    const db = digitAt(numberB, p);
    const needs = isSubtraction ? da - carry < db : da + db + carry >= 10;
    if (p === place) return needs;
    carry = needs ? 1 : 0;
  }
  return false;
}

/**
 * The third coaching trigger's "the conversion was done in this column".
 * Meetings with blocks (מסמכים 01–03: "לפני שההמרה בוצעה בלבנים") — the
 * blocks performed this column's conversion, the same notion that opens the
 * keyboard lock. Meeting 8 has no blocks (מסמך 03 §3.8: "בלי רישום ההמרה
 * בעיגול הזיכרון") — the conversion is recorded in a memory circle: the
 * carried 1 above the next column in addition, the new digit above the next
 * column (or the regrouped value above this one) in subtraction.
 */
export function conversionRecordedInColumn(
  s: Pick<WorkspaceState, 'sessionNumber' | 'carryDigits' | 'conversionsByColumn'>,
  place: Place,
  isSubtraction: boolean | undefined
): boolean {
  if (s.sessionNumber === 8) {
    const next = PLACE_ORDER[PLACE_ORDER.indexOf(place) + 1];
    // Addition carries one ten into the next column: one digit, 1–9. Two digits
    // in that circle (12) are not a recorded carry (1.10.2026). Subtraction
    // notes are the learner's own (the 4 above the tens, the 13 above the units).
    if (!isSubtraction) return Boolean(next && /^[1-9]$/.test(s.carryDigits[next] ?? ''));
    return Boolean((next && s.carryDigits[next]) || s.carryDigits[place]);
  }
  return conversionDoneInColumn(s.conversionsByColumn, place, isSubtraction);
}

/** Exact board a representation task prescribes (places it does not list must be empty). */
export function requiredCountsOf(task: SessionTask): PlaceCounts {
  return { ...EMPTY_COUNTS, ...(task.requiredCounts ?? {}) };
}

export function selectStandardTask(s: WorkspaceState): SessionTask | null {
  if (s.sessionNumber === 2) return null;
  return getActiveTasks(s)[s.standardTaskIdx] ?? null;
}

export function selectBoardValue(s: WorkspaceState): number {
  return getValue(s.counts);
}

/** Vanilla updateProceedButton: interaction required (intro exempt); choice tasks need a selection. */
export function selectCanProceed(s: WorkspaceState): boolean {
  if (s.awaitingNext || s.flowStatus !== 'task') return false;
  if (s.sessionNumber === 8) {
    const task = selectStandardTask(s);
    if (!task) return false;

    if (task.type === 'addition_simple' || task.type === 'vertical_addition') {
      const { a, b, target } = effectiveArithmetic(task, s.isASD);
      return answerDigitsToNumber(effectiveAnswerDigits(s, task, target)) !== null && hiddenDigitsStatus(s, task, a, b).complete;
    }
    return s.hasInteracted;
  }
  if (s.sessionNumber === 2) {
    const task = getCurrentQTask(s.qflow);
    if (!task) return false;
    const hasDigits = answerDigitsToNumber(s.answerDigits) !== null;
    const hasSingleValue = Boolean(s.probeAnswer && s.probeAnswer.trim().length > 0);
    const hasPartialDigits = Boolean(s.answerDigits.tens || s.answerDigits.units || s.answerDigits.hundreds);
    return Boolean(hasDigits || hasSingleValue || hasPartialDigits || s.hasInteracted);
  }
  const task = selectStandardTask(s);
  if (!task) return false;
  if (task.type === 'session1_intro') {
    // Meeting 1 tool steps (מסמך 03 §3.1): done when every checklist item is.
    const checklist = session1Checklist(task.id, s);
    if (checklist) return checklist.every((item) => item.done);
    if (task.correctAnswer === 'proceed_any' || !task.choices?.length) {
      return true;
    }
    return s.selectedChoiceId !== null;
  }
  if (task.type === 'flexible_decomp') {
    return s.q3Reps.length >= 2;
  }
  if (task.type === 'addition_simple' || task.type === 'vertical_addition') {
    const { a, b } = effectiveArithmetic(task, s.isASD);
    // What the child typed, not the result digits the exercise reveals: with
    // those (s4_r_t7, s6_r_t7) "התקדם" was open before any action, and each
    // press counted as a wrong answer (register 17: an empty answer is not one).
    // The verdict still reads the revealed digits (effectiveAnswerDigits).
    const hasDigits = answerDigitsToNumber(s.answerDigits) !== null;
    const hasBoardBlocks = selectBoardValue(s) > 0;
    return (hasBoardBlocks || hasDigits || s.hasInteracted) && hiddenDigitsStatus(s, task, a, b).complete;
  }
  if (task.type === 'representation') {
    // Meeting 1's target task is a guided step with a checklist (מסמך 03 §3.1 step 6).
    const checklist = session1Checklist(task.id, s);
    if (checklist) return checklist.every((item) => item.done);
    // Blocks the task itself put on the board (the 26 cubes) are not the
    // learner's work: "התקדם" waits for an answer to check.
    if (task.initialCounts) return answerDigitsToNumber(s.answerDigits) !== null;
    return selectBoardValue(s) > 0 || answerDigitsToNumber(s.answerDigits) !== null || s.hasInteracted;
  }
  if (!s.hasInteracted) return false;
  return true;
}

/**
 * What "התקדם" makes of the exercise on screen (meetings 1 and 3–8): solved,
 * a failure (with its detail and message), or a notice that asks for an
 * answer without counting a wrong one. One source for the press itself
 * (proceedStandard) and for "is this exercise already solved?" — the coaching
 * card never opens on an exercise the press would accept, and always may on
 * one it would not (exerciseSolvedForCard, 1.10.2026). The checks, their
 * order and their messages are the ones proceedStandard had.
 */
export type StandardVerdict =
  | { kind: 'success'; title: string; sub: string; ms: number }
  | {
      kind: 'failure';
      detail: string;
      title: string;
      sub: string;
      ms: number;
      /** Stations 3–7: a digit in the wrong place (core/placeCues.ts) — the press may turn the place cues on. */
      placeError?: boolean;
      /** flexible_decomp: the representations recorded so far are dropped. */
      clearReps?: boolean;
    }
  | { kind: 'notice'; title: string; sub: string; ms: number };

/** How many digits a skeleton exercise hides in its numbers. */
function hiddenDigitCount(task: SessionTask): number {
  return (task.hiddenDigits?.a?.length ?? 0) + (task.hiddenDigits?.b?.length ?? 0);
}

/** A skeleton exercise's empty boxes: one digit or several, as the instruction says ("בתיבות הריקות"). */
export function missingHiddenDigitsHe(task: SessionTask): string {
  return hiddenDigitCount(task) > 1
    ? 'כתבו את הספרות החסרות בתיבות הריקות כדי להמשיך.'
    : 'כתבו את הספרה החסרה בתיבה הריקה כדי להמשיך.';
}

/**
 * A skeleton exercise's digits, typed but not right. With several hidden
 * digits the sentence stays true when two are wrong, and does not say which.
 * Meeting 8 has no blocks to check with.
 */
export function wrongHiddenDigitsHe(task: SessionTask, meeting: number): string {
  const which = hiddenDigitCount(task) > 1 ? 'לא כל הספרות שכתבתם נכונות.' : 'הספרה החסרה שכתבתם אינה נכונה.';
  return meeting === 8 ? `${which} בדקו שוב.` : `${which} בדקו שוב בעזרת הלבנים בבית המספרים.`;
}

/** An exercise that opens with the blocks to group (meeting 1's 26, station 7's 2,730): the final blocks, built without grouping. */
const GROUP_YOURSELVES_HE = 'הלבנים מסודרות נכון, אבל המשימה היא לקבץ בעצמכם: 10 לבנים בכל פעם, בעזרת הכפתור שבראש הטור.';

export function judgeStandardTask(s: WorkspaceState, task: SessionTask): StandardVerdict {
  const success = (title: string, sub: string, ms: number): StandardVerdict => ({ kind: 'success', title, sub, ms });
  const failure = (detail: string, title: string, sub: string, ms: number, extra: { placeError?: boolean; clearReps?: boolean } = {}): StandardVerdict =>
    ({ kind: 'failure', detail, title, sub, ms, ...extra });
  const notice = (title: string, sub: string, ms: number): StandardVerdict => ({ kind: 'notice', title, sub, ms });

  if (task.type === 'session1_intro') {
    // Meeting 1 tool steps (מסמך 03 §3.1): the checklist on the card is the rule.
    if (session1Checklist(task.id, s)) {
      const nextStep = session1NextStep(task.id, s);
      if (nextStep) return failure('sandbox_incomplete', 'עוד צעד אחד 🛠️', `${nextStep}.`, 3500);
      return success('כָּל הַכָּבוֹד! 🌟', 'ממשיכים לשלב הבא.', 2000);
    }
    if (task.correctAnswer === 'proceed_any' || !task.choices?.length) return success('מְעֻלֶּה! 🌟', 'ממשיכים הלאה.', 1500);
    if (!s.selectedChoiceId) {
      return failure('no_choice', 'עֲנוּ עַל שְׁאֵלַת הַחֲשִׁיבָה 🤔', 'בַּחֲרוּ אַחַת מֵהָאֶפְשָׁרֻיּוֹת כְּדֵי לְהַמְשִׁיךְ.', 2500);
    }
    if (s.selectedChoiceId !== task.correctAnswer) {
      return failure('wrong_choice', 'חִשְׁבוּ שׁוּב 🤔', 'האם הוספתם לבנים לבית המספרים או הורדתם ממנו לבנים?', 2800);
    }
    return success('נכון מאוד! 🌟', 'הערך נשאר זהה לחלוטין מכיוון שלא שינינו את הכמות הכוללת.', 2500);
  }

  if (task.type === 'addition_simple' || task.type === 'vertical_addition') {
    const { target } = effectiveArithmetic(task, s.isASD);
    const boardVal = getValue(s.counts);
    const isBoardEmpty = boardVal === 0 && target !== 0;

    if (s.sessionNumber !== 8) {
      if (isBoardEmpty) {
        return failure(
          'empty_board',
          'בונים בבית המספרים 🧱',
          // Subtraction builds only the first number (Module 7: "ייצוג
          // המחוברים או המחוסר בלבד"; the instruction "בנו את המחוסר").
          task.isSubtraction
            ? 'עוד אין לבנים בבית המספרים. בנו את המספר הראשון שבתרגיל. לחצו על לבנה שמתחת לבית המספרים, או גררו אותה אליו.'
            : 'עוד אין לבנים בבית המספרים. לחצו על אחת הלבנים שמתחת לבית המספרים, או גררו אותה אליו, ובנו את המספרים שבתרגיל.',
          3500
        );
      }

      // Owner's decision 28.9.2026 (register, שהC.1 option א): in the
      // skeleton exercises of meetings 3–7 the hidden digits are checked
      // BEFORE the board, and the board may show either the exercise's result
      // or the number the child discovered. The order is: empty board →
      // hidden digits incomplete → hidden digits wrong → board → overcrowded.
      // Ordinary exercises, missingResultDigit exercises and meeting 8 keep
      // the order below unchanged.
      const skeletonHidden = s.sessionNumber >= 3 && s.sessionNumber <= 7 && hasHiddenDigits(task);
      if (skeletonHidden) {
        const { a: hA, b: hB } = effectiveArithmetic(task, s.isASD);
        const hiddenCheck = hiddenDigitsStatus(s, task, hA, hB);
        if (!hiddenCheck.complete) {
          return failure('missing_answer', 'הַקְלָדַת תְּשׁוּבָה ✏️', missingHiddenDigitsHe(task), 3000);
        }
        if (!hiddenCheck.correct) {
          return failure('wrong_numeric', 'כִּמְעַט... 🧐', wrongHiddenDigitsHe(task, s.sessionNumber), 2800);
        }
        const discovered = (task.hiddenDigits?.a?.length ? [hA] : []).concat(task.hiddenDigits?.b?.length ? [hB] : []);
        if (boardVal !== target && !discovered.includes(boardVal)) {
          return failure(
            'wrong_blocks',
            'דַּיְּקוּ אֶת הַמִּבְנֶה 🔍',
            'הלבנים שבבית המספרים אינן מראות את תוצאת התרגיל ואינן מראות את המספר שגיליתם. בדקו שוב.',
            3500
          );
        }
      } else if (boardVal !== target) {
        return failure(
          'wrong_blocks',
          'דַּיְּקוּ אֶת הַמִּבְנֶה 🔍',
          'הלבנים שבבית המספרים אינן מתאימות לתוצאת התרגיל. בדקו שוב.',
          3500
        );
      }

      const hasOvercrowded = s.counts.units >= 10 || s.counts.tens >= 10 || s.counts.hundreds >= 10;
      if (hasOvercrowded) {
        // Names the column and the one action: the button "קבצו 10" at the head of the column (מסמך 02).
        const crowded = s.counts.units >= 10 ? 'היחידות' : s.counts.tens >= 10 ? 'העשרות' : 'המאות';
        // The button says where the ten go (PlaceColumn: "קבצו 10 לעשרת / למאה / לאלף").
        const groupButton = s.counts.units >= 10 ? 'קבצו 10 לעשרת' : s.counts.tens >= 10 ? 'קבצו 10 למאה' : 'קבצו 10 לאלף';
        return failure(
          'overcrowded_columns',
          'קַבְּצוּ 🧱',
          // Meeting 1 names neither the column nor the button (owner, 29.9.2026):
          // the child finds the crowded column — the words of the meeting-1 card.
          s.sessionNumber === 1
            ? 'באחד הטורים יש 10 לבנים או יותר. לחצו על הכפתור שמופיע בראש אותו טור.'
            : `בטור ${crowded} יש 10 לבנים או יותר. לחצו על הכפתור "${groupButton}" שבראש הטור.`,
          4000
        );
      }
    }

    const { a: opA, b: opB } = effectiveArithmetic(task, s.isASD);
    const hidden = hiddenDigitsStatus(s, task, opA, opB);
    if (!hidden.complete) {
      return failure('missing_answer', 'הַקְלָדַת תְּשׁוּבָה ✏️', missingHiddenDigitsHe(task), 3000);
    }
    if (!hidden.correct) {
      // Meeting 8 has no blocks and no board (מסמך 03 §3.8), so its skeleton
      // tasks (s8_r_t7, s8_g_t6, s8_g_t7) cannot point the child to them.
      return failure('wrong_numeric', 'כִּמְעַט... 🧐', wrongHiddenDigitsHe(task, s.sessionNumber), 2800);
    }

    const typedDigits = effectiveAnswerDigits(s, task, target);
    // Register 17: an empty answer is not a wrong answer. Only the boxes the
    // child types in count — a skeleton's revealed digits are the exercise's —
    // and a 0 in a box to the left of the answer (the thousands box over 917,
    // stations 3–7) is no answer either. A row with no box to type in (every
    // result digit revealed, the missing digits in the numbers) is complete.
    const openPlaces = PLACE_ORDER.slice(0, resultBoxCount(s.sessionNumber, opA, opB, target)).filter(
      (p) => !task.revealedResultDigits?.includes(p)
    );
    const hasTypedDigits =
      openPlaces.length === 0 ||
      openPlaces.some((p) => {
        const d = s.answerDigits[p];
        if (d === undefined || d === '') return false;
        return !(d === '0' && p !== 'units' && Math.abs(target) < PLACE_VALUES[p]);
      });

    if (!hasTypedDigits) {
      return failure('missing_answer', 'הַקְלָדַת תְּשׁוּבָה ✏️', 'כתבו את התשובה בשורת התוצאה כדי להמשיך.', 3500);
    }

    const ansVal = resultRowValue(typedDigits);
    if (ansVal !== target) {
      if (s.sessionNumber === 8) {
        return failure('wrong_numeric', 'נסו שוב 🤔', 'התשובה שכתבתם אינה נכונה. בדקו שוב!', 2800);
      }
      // Stations 3–7 (owner, 30.9.2026): a digit in the wrong place turns on
      // the result row's place cues until the end of the exercise; the line
      // that explains them stays in the task card (VerticalAdditionTask).
      return failure(
        'wrong_numeric',
        'כִּמְעַט... 🧐',
        'התשובה שכתבתם לא מתאימה ללבנים בבית המספרים. בדקו שוב!',
        2800,
        {
          placeError:
            s.sessionNumber >= 3 &&
            s.sessionNumber <= 7 &&
            isPlaceError(typedDigits, target, { a: opA, b: opB, isSubtraction: task.isSubtraction }),
        }
      );
    }

    // Memory circles are introduced in meeting 4 (מסמך 03 §3.4); meeting 1 does
    // not mention them, so its refresh exercises get the plain success.
    if (task.type === 'vertical_addition' && (task.requiresGrouping || task.requiresUngrouping) && s.sessionNumber !== 1) {
      const hasCarriesEntered = Object.values(s.carryDigits).some((v) => v !== undefined && v !== '');
      // A skeleton exercise whose board shows the number the child discovered
      // (decision יד, option א) made no conversion on the board: no reminder
      // about recording one — the ordinary success below (A5-F10).
      const boardShowsDiscovered = s.sessionNumber >= 3 && s.sessionNumber <= 7 && hasHiddenDigits(task) && boardVal !== target;
      if (!hasCarriesEntered && !boardShowsDiscovered) {
        // A correct answer with the memory circles left empty is still a
        // solved exercise. This branch used to advance on its own and skip
        // handleSuccess: no PROBLEM_COMPLETE (the report said "לא השלים את
        // התרגיל" and scored it 0), no Q-matrix success, and the error streak
        // carried into the next exercise.
        // By operation (register decision ט (2): addition "המרה", subtraction
        // "פריטה"), in the words of each instruction (taskBuilders).
        return success(
          'שימו לב לעיגולי הזיכרון 💡',
          task.isSubtraction
            ? 'פתרתם נכון! בפעם הבאה, אחרי כל פריטה רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.'
            : 'פתרתם נכון! בפעם הבאה, רשמו כל המרה בעיגולי הזיכרון שבראש הטורים.',
          3000
        );
      }
    }

    // Meeting 8 has no number house (מסמך 03 §3.8, Module 14 §ב): its praise
    // does not speak of one (owner, 1.10.2026, D11b).
    return s.sessionNumber === 8
      ? success('כָּל הַכָּבוֹד! 🌟', MEETING8_SOLVED_SUB_HE, 2500)
      : success('כָּל הַכָּבוֹד! 🌟', 'פְּתַרְתֶּם נָכוֹן, וּבְנִיתֶם נָכוֹן גַּם בַּלְּבֵנִים.', 2500);
  }

  if (task.type === 'small_change') {
    if (!s.selectedChoiceId) {
      // "התקדם" is enabled by any board touch in meetings 3-5, so a press
      // with no option chosen used to do nothing at all — no message.
      return notice('בַּחֲרוּ תְּשׁוּבָה', `סמנו אחת מהאפשרויות, ואז לחצו על "${PROCEED_HE}".`, 1800);
    }
    if (s.selectedChoiceId !== task.correctAnswer) return failure('wrong_choice', 'נסו שוב 🤔', 'התשובה שבחרתם אינה נכונה.', 2500);
    return success('כָּל הַכָּבוֹד! 🌟', 'תשובה נכונה.', 2500);
  }

  if (task.type === 'missing_element') {
    const answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
    if (answer === null || Number.isNaN(answer)) {
      return notice('הַקְלָדַת תְּשׁוּבָה ✏️', `כתבו את החלק החסר בתיבה, ואז לחצו על "${PROCEED_HE}".`, 1800);
    }
    if (answer !== task.correctAnswer) return failure('wrong_answer', 'נסו שוב 🤔', 'המספר שכתבתם אינו נכון.', 2500);
    return success('כָּל הַכָּבוֹד! 🌟', 'תשובה נכונה.', 2500);
  }

  if (task.type === 'representation') {
    // Stations 3 and 7 (owner, 30.9.2026): the exercise's kind says what the
    // single answer box holds.
    const kind = task.representationKind;
    const required = requiredCountsOf(task);
    // An exercise that only says "build the number X" (owner, 4.10.2026):
    // any board worth X is right; one that names blocks or a conversion still
    // needs its exact board.
    const boardRight = buildsAnyWay(task) ? builtAnyWay(task, s.counts) : countsEqual(s.counts, required);
    if (!boardRight) {
      // The blocks of the instruction's first sentence, the break or the
      // grouping not made yet: the step still missing is named (A4-F01). It
      // counts as a wrong press, as the sentence below does.
      if (kind === 'compose_break' || kind === 'compose_group') {
        const before = boardBeforeConversion(task);
        const pending = pendingRepresentationConversion(s, task);
        if (before && pending !== null && countsEqual(s.counts, before)) {
          return kind === 'compose_break'
            ? failure('conversion_skipped', 'פִּרְטוּ 🧱', breakNowHe(pending), 3500)
            : failure('conversion_skipped', 'קַבְּצוּ 🧱', groupNowHe(pending), 3500);
        }
      }
      return failure(
        'wrong_representation',
        'דַּיְּקוּ אֶת הַמִּבְנֶה 🔍',
        // One sentence for every representation exercise. It used to spell out
        // the blocks to build, as the box by the result row did; with the box
        // gone (owner, 28.9.2026) that gave the answer away on a wrong press
        // ("איזה מספר קיבלתם?"), and it was too long for the feedback note.
        'בית המספרים עוד לא מראה את מה שההנחיה מבקשת. קראו אותה שוב ובדקו כמה לבנים יש בכל טור.',
        3500
      );
    }
    if (kind) {
      // The break (compose_break) or the grouping (compose_group) is the
      // child's own, with the blocks, in every column REPRESENTATION_LOCKS
      // names — s3_g_t4 breaks a thousand AND a hundred — and undo takes one
      // back. The message names the block still to break, or the button of
      // the column still to group. A kind with no entry falls back to
      // "some break / some grouping was made".
      const listed = Boolean(REPRESENTATION_LOCKS[task.id]);
      const pending = pendingRepresentationConversion(s, task);
      const skipped = listed
        ? pending !== null
        : kind === 'compose_group'
          ? !s.hasGrouped
          : kind === 'compose_break' && !s.hasUngrouped;
      if (skipped && kind === 'compose_group') return failure('conversion_skipped', 'קַבְּצוּ 🧱', groupItYourselvesHe(pending), 3500);
      if (skipped && kind === 'compose_break') return failure('conversion_skipped', 'פִּרְטוּ 🧱', breakItYourselvesHe(pending), 3500);
    } else {
      // Meeting 1: the exercise is the conversion itself, not only its result.
      // 26 and 347 are checked per column (REPRESENTATION_LOCKS): 26 groups the
      // units twice, 347 breaks a ten, not a hundred (audit A2-F06).
      const m1Listed = Boolean(REPRESENTATION_LOCKS[task.id]);
      const m1Pending = m1Listed && pendingRepresentationConversion(s, task) !== null;
      if (task.requiresGrouping && (m1Listed ? m1Pending : !s.hasGrouped)) {
        return failure('conversion_skipped', 'קַבְּצוּ 🧱', GROUP_YOURSELVES_HE, 3500);
      }
      if (task.requiresUngrouping && (m1Listed ? m1Pending : !s.hasUngrouped)) {
        return failure('conversion_skipped', 'פִּרְטוּ 🧱', 'הלבנים מסודרות נכון, אבל המשימה היא לפרוט בעצמכם: בנו את המספר ולחצו על לבנת עשרת כדי לפרוט אותה.', 3500);
      }
      // Station 7's 2,730 (owner, 4.10.2026): the board opens with the blocks
      // to group, and every grouping REPRESENTATION_LOCKS lists is the child's
      // own — the final blocks built by hand, or with one grouping only, are
      // not the exercise. The sentence is meeting 1's (the 26 units).
      if (
        !task.requiresGrouping &&
        task.initialCounts &&
        REPRESENTATION_LOCKS[task.id]?.conversion === 'composition' &&
        pendingRepresentationConversion(s, task) !== null
      ) {
        return failure('conversion_skipped', 'קַבְּצוּ 🧱', GROUP_YOURSELVES_HE, 3500);
      }
    }
    const typed = answerDigitsToNumber(s.answerDigits);
    if (typed === null) {
      return failure(
        'missing_answer',
        'הַקְלָדַת תְּשׁוּבָה ✏️',
        // A decomposition's answer is a number of blocks, not "the number".
        kind === 'decompose'
          ? 'הלבנים מסודרות בדיוק כנדרש! עכשיו כתבו את התשובה בשורת התוצאה.'
          : 'הלבנים מסודרות בדיוק כנדרש! עכשיו כתבו את המספר בשורת התוצאה.',
        3000
      );
    }
    if (kind) {
      // What the child writes: the number the blocks show, or — decompose —
      // how many blocks make it (450 → 45 tens), never "the value of a digit".
      const block = kind === 'decompose' ? BLOCK_NAME_HE[decomposeBlockPlace(task)] : '';
      if (typed !== task.correctAnswer) {
        return failure(
          'wrong_numeric',
          'כִּמְעַט... 🧐',
          kind === 'decompose'
            ? `בדקו שוב: כמה לבני ${block} יש בבית המספרים?`
            : 'המספר שכתבתם לא מתאים ללבנים בבית המספרים. בדקו שוב!',
          2800
        );
      }
      return success(
        'כָּל הַכָּבוֹד! 🌟',
        kind === 'decompose'
          ? `בניתם את המספר מלבני ${block} בלבד, והתשובה שכתבתם נכונה.`
          : 'בניתם בדיוק את מה שהתבקש, והמספר שכתבתם מתאים ללבנים בבית המספרים.',
        2500
      );
    }
    // The result row takes the exercise's answer: the number built, or — the
    // value of a digit (meeting 1, 368 → 60) — its own correctAnswer.
    // The value of a digit (368 → 60) is not the number the blocks show, so
    // its messages speak of the value of the digit, not of the blocks.
    const asksDigitValue = typeof task.correctAnswer === 'number' && task.correctAnswer !== task.numberA;
    if (typed !== (typeof task.correctAnswer === 'number' ? task.correctAnswer : task.numberA ?? 0)) {
      return failure('wrong_numeric', 'כִּמְעַט... 🧐', asksDigitValue ? 'זה עוד לא הערך של הספרה. הסתכלו בבית המספרים ובדקו שוב!' : 'המספר שכתבתם לא מתאים ללבנים בבית המספרים. בדקו שוב!', 2800);
    }
    // 347 is a guided step: the checklist already shows its done note, so its
    // success is the tool steps' one (audit A2-F13).
    if (session1DoneNoteHe(task.id) !== null) return success('כָּל הַכָּבוֹד! 🌟', 'ממשיכים לשלב הבא.', 2000);
    return success('כָּל הַכָּבוֹד! 🌟', asksDigitValue ? 'מצאתם את הערך של הספרה במספר.' : 'בניתם בדיוק את מה שהתבקש, והמספר שכתבתם מתאים ללבנים בבית המספרים.', 2500);
  }

  if (task.type === 'flexible_decomp') {
    if (task.requireEvenTens && s.q3Reps.some((r) => r.tens % 2 !== 0)) {
      return failure('odd_tens', 'בִּדְקוּ אֶת הָעֲשָׂרוֹת 🤔', 'בכל דרך מספר העשרות צריך להיות זוגי. נסו שוב!', 2800, { clearReps: true });
    }
    if (s.q3Reps.length < 2) return notice('נִדְרָשִׁים שְׁנֵי יִצּוּגִים שׁוֹנִים', 'הוֹסִיפוּ יִצּוּג שֵׁנִי!', 1800);
    const [r1, r2] = s.q3Reps;
    const isIdentical = (['units', 'tens', 'hundreds', 'thousands'] as Place[]).every((p) => r1[p] === r2[p]);
    if (isIdentical) {
      return failure('canonical_fixation', 'הַיִּצּוּגִים זֵהִים 🤔', 'נַסּוּ לִיצֹר אֶת אוֹתוֹ מִסְפָּר בְּדֶרֶךְ אַחֶרֶת (לְמָשָׁל עַל יְדֵי פְּרִיטַת עֲשֶׂרֶת).', 2800, { clearReps: true });
    }
    return success('כָּל הַכָּבוֹד! 🌟', 'הצלחתם להציג שני ייצוגים שונים.', 2500);
  }

  return success('כָּל הַכָּבוֹד! 🌟', 'ממשיכים לשלב הבא.', 2500);
}

/**
 * Meeting 8's praise for a solved exercise (owner, 1.10.2026, D11b): the
 * station has no number house, so the praise speaks of the solution only.
 */
export const MEETING8_SOLVED_SUB_HE = 'פְּתַרְתֶּם נָכוֹן.';

/**
 * How long a wrong choice in the Socratic card locks the card's answer buttons.
 * Owner, 1.10.2026: 15 seconds (PRD Module 12 §ב and doc 03 said 30).
 */
export const SOCRATIC_LOCKOUT_MS = 15_000;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  /**
   * Which meeting a deferred step belongs to. initSession, restoreSession and
   * resetWorkspace each start a new one, so a step still waiting behind a
   * toast never lands in the meeting that came after it: meeting 1's "done"
   * timer used to end meeting 2 when the teacher opened it within 2.5 seconds,
   * and resetWorkspace put the nonce back to 0, so the next learner's first
   * toast could release the previous learner's pending step.
   */
  let flowEpoch = 0;

  /** Runs `then` after `ms`, unless a new meeting started in between. */
  function afterInThisMeeting(ms: number, then: () => void) {
    const epoch = flowEpoch;
    setTimeout(() => {
      if (epoch === flowEpoch) then();
    }, ms);
  }

  /** Show feedback and auto-hide after ms (nonce-guarded against stale hides). */
  function showFeedback(feedback: FeedbackState, ms: number, then?: () => void) {
    const nonce = get().feedbackNonce + 1;
    const epoch = flowEpoch;
    set({ feedback, feedbackNonce: nonce });
    setTimeout(() => {
      if (epoch !== flowEpoch) return;
      if (get().feedbackNonce === nonce) {
        set({ feedback: null });
        then?.();
      }
    }, ms);
  }

  /**
   * A message that must not cancel what the child is in the middle of. The
   * silent-help toast used showFeedback, which bumps the nonce — so pressing
   * the help button while a meeting-2 step was showing ("התשובה התקבלה",
   * "משימה נוספת") dropped that step's continuation, and "התקדם" stayed
   * disabled until a reload.
   */
  function showSideFeedback(feedback: FeedbackState, ms: number) {
    set({ feedback });
    setTimeout(() => {
      if (get().feedback === feedback) set({ feedback: null });
    }, ms);
  }

  function createNextUndoStack(
    currentStack: UndoFrame[],
    counts: PlaceCounts,
    actionType: TelemetryEventType = 'BLOCK_DRAG_COMPLETE',
    /** The typed input as it was BEFORE the action (PRD Module 11 §א: "קלט"). */
    input?: Pick<WorkspaceState, 'answerDigits' | 'carryDigits' | 'operandDigits'>,
    /** Conversion actions only: the per-column conversions BEFORE the action. */
    conversions?: ColumnConversions,
    /** The column the action was confined to, if any (UndoFrame.columnIndex). */
    columnIndex?: number
  ): UndoFrame[] {
    const frame: UndoFrame = { counts: { ...counts }, actionType };
    if (columnIndex !== undefined) frame.columnIndex = columnIndex;
    if (input) {
      frame.answerDigits = { ...input.answerDigits };
      frame.carryDigits = { ...input.carryDigits };
      frame.operandDigits = { a: { ...input.operandDigits.a }, b: { ...input.operandDigits.b } };
    }
    if (conversions) frame.conversionsByColumn = normalizeColumnConversions(conversions);
    // The take-away record before the action: undo restores it with the board.
    const track = get().takeAwayTrack;
    if (track) frame.takeAwayTrack = { ...track };
    const fromTrack = get().heldFromTrack;
    if (fromTrack) frame.heldFromTrack = { ...fromTrack };
    const stack = [...currentStack, frame];
    if (stack.length > UNDO_STACK_CAP) stack.shift();
    return stack;
  }

  /** The learner's typed state, for an undo frame. */
  function inputSnapshot(s: WorkspaceState): Pick<WorkspaceState, 'answerDigits' | 'carryDigits' | 'operandDigits'> {
    return { answerDigits: s.answerDigits, carryDigits: s.carryDigits, operandDigits: s.operandDigits };
  }

  /**
   * Module 29 §ב: REGROUPING_ACTIVE is "אירוע המרה פעיל" — a grouping or a
   * decomposition on the board. The counts change at once; the event lasts
   * while its animation plays, and the machine returns to PROBLEM_ACTIVE when
   * it lands. It used to stay REGROUPING_ACTIVE until the next exercise. An
   * open coaching card stays the active state (the board is live under it,
   * Module 12), so closing it still returns to PROBLEM_ACTIVE.
   */
  let regroupingTimer: ReturnType<typeof setTimeout> | null = null;
  function enterRegroupingActive() {
    if (get().currentState === 'SOCRATIC_ACTIVE') return;
    get().transitionTo('REGROUPING_ACTIVE');
    if (regroupingTimer) clearTimeout(regroupingTimer);
    regroupingTimer = setTimeout(() => {
      regroupingTimer = null;
      if (get().currentState === 'REGROUPING_ACTIVE') get().transitionTo('PROBLEM_ACTIVE');
    }, REGROUP_ANIMATION_MS);
  }

  function computeExpectedDigitForColumn(
    task: any,
    place: Place,
    isASD: boolean = false,
    isCarry: boolean = false
  ): number | null {
    if (!task) return null;

    if (isCarry) {
      // Appendix A §3: is_correct is null "when the exercise defines no target
      // digit for that column". Only column ADDITION defines one for a memory
      // circle (the carried 0 or 1). In subtraction the circle holds the
      // learner's own regrouping note — the 4 above the tens of 53 − 18 — and it
      // used to be compared with 0: every correct note was recorded as a wrong
      // digit, so no regrouping subtraction could ever count as solved on the
      // first attempt (Module 23 §ב), the Persistence Index's E was inflated, and
      // a coaching card whose advice was followed counted as ineffective.
      if (!task.numberA || !task.numberB || task.isSubtraction) return null;
      const { a, b } = effectiveArithmetic(task, isASD);
      const uA = a % 10;
      const uB = b % 10;
      const carryToTens = (uA + uB) >= 10 ? 1 : 0;
      if (place === 'tens') return carryToTens;

      const tA = Math.floor(a / 10) % 10;
      const tB = Math.floor(b / 10) % 10;
      const carryToHundreds = (tA + tB + carryToTens) >= 10 ? 1 : 0;
      if (place === 'hundreds') return carryToHundreds;

      const hA = Math.floor(a / 100) % 10;
      const hB = Math.floor(b / 100) % 10;
      const carryToThousands = (hA + hB + carryToHundreds) >= 10 ? 1 : 0;
      if (place === 'thousands') return carryToThousands;
      return 0;
    }

    if (typeof task.correctAnswer === 'number') {
      const colIdx = placeToColumnIndex(place);
      return Math.floor(Math.abs(task.correctAnswer) / Math.pow(10, colIdx)) % 10;
    }

    if (task.numberA !== undefined) {
      const { target } = effectiveArithmetic(task, isASD);
      const colIdx = placeToColumnIndex(place);
      return Math.floor(Math.abs(target) / Math.pow(10, colIdx)) % 10;
    }

    return null;
  }

  /**
   * The digit the learner's box in `place` should hold in the exercise on the
   * screen, or null when the exercise defines none (Appendix A §3). Meeting 2
   * runs on the diagnostic flow, not on a task list (diagnosticDigitTask).
   */
  function expectedDigitInActiveTask(s: WorkspaceState, place: Place, isCarry: boolean): number | null {
    const task = s.sessionNumber === 2
      ? diagnosticDigitTask(s.qflow, s.isASD)
      : getActiveTasks(s)[s.standardTaskIdx] || null;
    return computeExpectedDigitForColumn(task, place, s.isASD, isCarry);
  }

  /** Flash a constraint violation on a column, then clear the tint (shake lasts 400ms). */
  function flagConstraintError(place: Place) {
    const nonce = get().errorNonce + 1;
    set({ errorPlace: place, errorNonce: nonce });
    setTimeout(() => {
      if (get().errorNonce === nonce) set({ errorPlace: null });
    }, 500);
  }

  /**
   * Module 19 §ב Safe Application Boundary: applies a teacher-queued
   * differentiation change staged via RTDB users/students/{id}/pendingAdaptation
   * (see the learner drawer's onApplyAdaptation). Called only from startTask()
   * — the one choke point every new task passes through, regardless of
   * whether it arrived via the Session-2 qflow or the standard task list —
   * so a change made mid-exercise never lands before the exercise ends.
   */
  function applyPendingAdaptationAtBoundary() {
    const pending = get().pendingAdaptation;
    if (!pending) return;

    const studentId = useAuthStore.getState().user?.uid;
    if (!studentId) return;
    const normId = normalizeStudentId(studentId);

    const liveFields = {
      pedagogicalPath: pending.pedagogicalPath,
      currentPath: pending.currentPath,
      scaffoldLevel: pending.scaffoldLevel,
      forceAdditionHelper: pending.forceAdditionHelper,
      additionBoardEnabled: pending.forceAdditionHelper,
    };

    useStore.setState((s) => {
      const existing = s.students[normId];
      if (!existing) return s;
      return { students: { ...s.students, [normId]: { ...existing, ...liveFields } } };
    });

    set({ pendingAdaptation: null });

    update(ref(database, `users/students/${normId}`), { ...liveFields, pendingAdaptation: null }).catch((err) => {
      console.error('[Module 19] Failed to commit boundary-applied adaptation:', err);
    });
  }

  /**
   * Module 19 §ב: "שינוי פרופיל במהלך תרגיל פעיל נשמר כהתאמה ממתינה (Pending
   * Adaptation) ומוחל אך ורק במעבר לתרגיל הבא". Every task start — standard,
   * branch, meeting start and restore — passes through here, so the keyboard
   * lock and the addition grid of the exercise on screen never change under
   * the learner's hands.
   */
  function applyPendingSupportProfile() {
    const s = get();
    if (!s.hasPendingSupportProfile) return;
    set({
      activeSupportProfileId: s.pendingSupportProfileId,
      pendingSupportProfileId: null,
      hasPendingSupportProfile: false,
      supportProfileApplied: true,
    });
  }

  /** A task that starts with blocks already on the board (SessionTask.initialCounts). */
  function applyInitialBoard(task: SessionTask | null | undefined) {
    if (task?.initialCounts) set({ counts: { ...EMPTY_COUNTS, ...task.initialCounts } });
  }

  function startTask(taskId: string) {
    const previous = get();
    const previousBoard = { counts: { ...previous.counts }, undoStack: [...previous.undoStack] };
    set(resetTaskInteraction());
    // PRD state machine: the next exercise starts PROBLEM_ACTIVE. A card left
    // open (and the hint the AI was still preparing) belonged to the exercise
    // that opened it; it used to follow the learner into the next one.
    set({
      keyboardState: 'UNLOCKED',
      currentState: 'PROBLEM_ACTIVE',
      taskStartTime: Date.now(),
      helpState: 'closed',
      aiSocraticHint: null,
      socraticPending: false,
      socraticDistractorHint: null,
      frictionTriggerSource: null,
    });
    cancelSocraticRequest();
    // Owner, 1.10.2026 (D5): the 15-second lock after a wrong card answer
    // belongs to the exercise it was earned in, and ends with it. It used to
    // follow the child into the next exercise (it is kept per device).
    if (get().isSocraticCardLocked || get().socraticLockDeadline !== null) get().unlockSocraticCard();
    applyPendingAdaptationAtBoundary();
    applyPendingSupportProfile();
    if (get().sessionNumber !== 2) {
      const task = getActiveTasks(get()).find((t) => t.id === taskId);
      applyInitialBoard(task);
      if (task?.continuesBoard) set(previousBoard);
    }

    if (taskId) {
      const s = get();
      const studentId = currentStudentUid();
      emitTelemetry({
        session_id: `session_${s.sessionNumber}_student_${studentId}`,
        student_id: studentId,
        exercise_id: taskId,
        event_type: 'PROBLEM_LOAD',
        details: {
          exercise_template_id: taskId,
          path_type: s.selectedBranch === 'challenge' ? 'challenge' : s.selectedBranch === 'reinforcement' ? 'consolidation' : 'compulsory',
        },
      }).catch(console.error);
    }
  }

  /**
   * The seven compulsory tasks as the Q-matrix holds them (Module 20). A task
   * the learner did not reach is null; one solved on the first attempt is
   * 'success'; any other is an error node, shown to the teacher as "דרוש חיזוק"
   * (qMatrixValue).
   */
  function diagnosticQMatrix(r: QMatrixFlowState['results']) {
    return {
      task1_read_write_zero: qMatrixValue('task1_read_write_zero', r['task1_read_write_zero']),
      task2_digit_value: qMatrixValue('task2_digit_value', r['task2_digit_value']),
      task3_subtraction_regrouping: qMatrixValue('task3_subtraction_regrouping', r['task3_subtraction_regrouping']),
      task4_decompose_number: qMatrixValue('task4_decompose_number', r['task4_decompose_number']),
      task5_units_to_tens: qMatrixValue('task5_units_to_tens', r['task5_units_to_tens']),
      task6_vertical_addition: qMatrixValue('task6_vertical_addition', r['task6_vertical_addition']),
      task7_subtraction_zero_tens: qMatrixValue('task7_subtraction_zero_tens', r['task7_subtraction_zero_tens']),
    };
  }

  /**
   * PRD 14: "שדה is_completed נקבע אך ורק לפי השלמת שבע משימות החובה או לפי
   * סגירה יזומה של המורה". Station 2 is complete — and scored — the moment its
   * seven compulsory tasks are answered. This used to run only after the
   * correction round, so a learner who had answered all seven and was still in
   * that round (or closed the tab in it) was never completed, and the teacher
   * had no score and no gate for them. The correction round still runs after
   * this and adds its diagnostic tags (recordCorrectionRoundTags); it never
   * changes the score, the path or the completion (register, decision ז).
   */
  function completeDiagnosticMeeting() {
    const studentId = useAuthStore.getState().user?.uid;
    if (!studentId) return;
    const s = get();
    const measured = {
      results: s.qflow.results,
      hesitations: s.hesitationCount,
      undos: s.undoCount,
      persistence: s.getPersistenceIndex(),
    };
    whenLearnerRecordLoaded(studentId, () => writeDiagnosticCompletion(studentId, measured));
  }

  /**
   * The completion writes go through the learner's record in the app store.
   * After a reload from this device's copy the record may not have arrived
   * yet; the writes then wait for it instead of being dropped.
   */
  function whenLearnerRecordLoaded(studentId: string, run: () => void) {
    if (useStore.getState().students[studentId]) {
      run();
      return;
    }
    const unsubscribe = useStore.subscribe((st) => {
      // Another learner signed in on this device: this learner's writes are not theirs.
      if (useAuthStore.getState().user?.uid !== studentId) {
        unsubscribe();
        return;
      }
      if (!st.students[studentId]) return;
      unsubscribe();
      run();
    });
  }

  function writeDiagnosticCompletion(
    studentId: string,
    measured: { results: QMatrixFlowState['results']; hesitations: number; undos: number; persistence: number },
  ) {
    const store = useStore.getState();
    store.markMeeting2Complete(studentId);
    const student = store.students[studentId];
    if (!student) return;
    const r = measured.results;
    // מודול 20: ערך ריק פירושו "הלומד לא ניגש למשימה" בלבד. לומד שניגש ונכשל
    // בלי שסווג לו צומת שגיאה נרשם כ-Q_FAIL_TAG, אחרת כישלון היה נראה למורה
    // בדוח האבחון בדיוק כמו משימה שהילד מעולם לא הגיע אליה.
    const realQMatrix = diagnosticQMatrix(r);
    store.updateQMatrix(studentId, realQMatrix);
    syncQMatrixEvaluation(studentId, realQMatrix).catch(console.error);

    const mastery = computeCognitiveMastery(realQMatrix);
    store.updateConceptMastery(studentId, mastery);

    const { hesitations, undos, persistence } = measured;
    const efficiency = Math.max(0, 100 - (undos * 5) - (hesitations * 10));

    const realTraceData = {
      hesitation_events: hesitations,
      undo_clicks: undos,
      efficiency_score: efficiency,
      persistence_score: persistence
    };
    store.updateTraceData(studentId, realTraceData);
    // No route is computed or written here. The device used to post its own
    // routeRecommendation with routeStatus 'PENDING'; the database rules
    // refused that write every time, and the path the teacher sees is the
    // server's (below).

    // PRD Module 20: session_score_percent and matrix_recommended_path are
    // computed "בטריגר עצמאי על סיום המפגש" — sessionTrigger.ts, from the
    // meeting's telemetry, first attempts only (Module 23 §ב). The learner's
    // device used to compute and post its own number; the rules now refuse
    // that (owner, 29.9.2026), so the completion carries neither.
    //
    // The pilot's one class (Module 25 §ב.1) — the same id the learner's
    // signed claim carries. This used to take activeClass.school_id, so
    // every SessionDocument said class_id "school_bikorot" and the class
    // report and the research export, which filtered on "class_1", found none.
    const classId = 'class_1';
    firebaseSyncService.syncSession2Completion(studentId, classId).catch(console.error);
  }

  /**
   * The end of the correction round: the diagnostic tags it gave the tasks
   * that went through it, and nothing else. The score, the path, the route
   * and the completion were settled when the seven tasks were answered
   * (completeDiagnosticMeeting).
   */
  function recordCorrectionRoundTags() {
    const studentId = useAuthStore.getState().user?.uid;
    if (!studentId) return;
    const { results, failedTasks } = get().qflow;
    if (failedTasks.length === 0) return;
    const tags: Record<string, string | null> = {};
    for (const id of failedTasks) tags[id] = qMatrixValue(id, results[id]);
    whenLearnerRecordLoaded(studentId, () => useStore.getState().updateQMatrix(studentId, tags as never));
  }

  /**
   * From a primary-round task whose answer is recorded to what comes next:
   * the next task, or — after the seventh — the completion of the meeting and
   * then the correction round or the end.
   */
  function continueAfterPrimaryAnswer() {
    const { state, event: next } = advance(get().qflow);
    set({ qflow: state });
    if (next) {
      // In the primary round advance returns an event only when the round is over.
      completeDiagnosticMeeting();
      handleQFlowEvent(next);
    } else {
      startTask(getCurrentQTask(state)?.id ?? '');
      set({ awaitingNext: false });
    }
  }

  /**
   * A reload in station 2 after an answer was recorded and before the flow
   * moved on (the answer is saved at once; the step comes 1.5 seconds later,
   * after the toast). The saved flow still points at the answered task, and
   * the child used to be asked it again — a second answer then replaced the
   * first attempt the diagnostic is scored on. The flow now moves on instead,
   * as it would have.
   */
  function resumeDiagnosticAfterRestore() {
    const s = get();
    if (s.sessionNumber !== 2 || s.flowStatus !== 'task') return;
    // Cancels a step still pending from before the restore: it would move the
    // flow a second time.
    set({ feedbackNonce: s.feedbackNonce + 1, feedback: null });
    const task = getCurrentQTask(s.qflow);
    if (s.qflow.phase === 'primary') {
      if (!task) {
        // Saved in the moment between the seventh answer (the meeting is
        // already complete) and the end screen.
        handleQFlowEvent({ type: 'all_complete' });
      } else if (s.qflow.results[task.id]) {
        set({ awaitingNext: true });
        continueAfterPrimaryAnswer();
      }
    } else {
      // The correction round the same way: a simpler exercise or a retry whose
      // answer is recorded moves on, with a clean step, instead of coming back.
      const { state, moved } = settlePendingQResults(s.qflow);
      if (moved) set({ qflow: state });
      if (state.correctionIdx >= state.failedTasks.length) {
        handleQFlowEvent({ type: 'all_complete' });
      } else if (moved) {
        startTask(getCurrentQTask(state)?.id ?? '');
      }
    }
  }

  /** Session-2 transition script (vanilla onQTaskComplete, app.js 813–873). */
  function handleQFlowEvent(event: QFlowEvent) {
    switch (event.type) {
      case 'primary_done': {
        // The title has no 👍: the floating toast shows its own (A3-113). After
        // the last task no next task follows (the waiting screen, or the
        // correction round with its own toast), so the sub is left out (A3-112).
        // taskIdx is still the task just answered: advance() runs after the toast.
        const nextTaskSub = get().qflow.taskIdx < TASKS.length - 1 ? 'עוֹבְרִים לַמְּשִׂימָה הַבָּאָה...' : undefined;
        showFeedback({ correct: true, neutral: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה!', sub: nextTaskSub }, 1500, continueAfterPrimaryAnswer);
        break;
      }
      // The correction round has no hints and no right/wrong feedback (owner's
      // decision, 25.9.2026): it is still part of the diagnostic. Its toasts
      // name what is on the screen and say nothing about the first answer
      // (owner, 29.9.2026): the task itself coming back is "מְשִׂימָה חוֹזֶרֶת";
      // the simpler exercise before it (tasks 3, 6, 7) is another task.
      case 'start_correction': {
        const task = TASKS.find((t) => t.id === event.taskId);
        const title = task && hasProbeExercise(task) ? 'מְשִׂימָה נוֹסֶפֶת 📝' : 'מְשִׂימָה חוֹזֶרֶת 📝';
        // The step starts with its toast, not after it: the flow had already
        // moved to it, so for 1.8 seconds the new step sat on the screen with
        // the previous step's answer in its boxes, and a reload in that window
        // kept the old answer there for good. The toast only holds "התקדם" back.
        startTask(event.taskId);
        set({ awaitingNext: true });
        showFeedback({ correct: true, neutral: true, title }, 1800, () => {
          set({ awaitingNext: false });
        });
        break;
      }
      case 'subtask_done':
        showFeedback(
          { correct: true, neutral: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה!' },
          1500,
          () => {
            const { state, event: next } = advance(get().qflow);
            set({ qflow: state });
            if (next) handleQFlowEvent(next);
            else set({ awaitingNext: false });
          }
        );
        break;
      case 'start_retry':
        // Starts with its toast, as start_correction does.
        startTask(event.taskId);
        set({ awaitingNext: true });
        showFeedback({ correct: true, neutral: true, title: 'מְשִׂימָה חוֹזֶרֶת 📝' }, 1800, () => {
          set({ awaitingNext: false });
        });
        break;
      case 'retry_done':
        showFeedback(
          { correct: true, neutral: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה!' },
          1500,
          () => {
            const { state, event: next } = advance(get().qflow);
            set({ qflow: state });
            if (next) handleQFlowEvent(next);
            else {
              startTask(getCurrentQTask(state)?.id ?? '');
              set({ awaitingNext: false });
            }
          }
        );
        break;
      case 'all_complete':
        // מודול 16 §א: לוח הרפלקציה הוא "בסיום מפגש 8" — שם בלבד. מודול 14
        // §ב0 ומודול 20: מפגש 2 מסתיים במסך המתנה שקט עד שהמורה מאשרת את
        // המסלול. הקוד הציג כאן את לוח הרפלקציה המלא, כולל אחוז מדד ההתמדה —
        // לילד, ברגע שבו מוכרע לאיזה מסלול הוא הולך.
        //
        // No toast: it said "כל הכבוד על העבודה הטובה!" and the waiting screen
        // opens with "כל הכבוד, מתמטיקאים! סיימתם את התחנה השנייה" — one praise,
        // the waiting screen's (owner, 29.9.2026).
        recordCorrectionRoundTags();
        markMeetingFinished(currentStudentUid(), get().sessionNumber, get().isSupersededByOtherDevice);
        set({ flowStatus: 'sessionDone', awaitingNext: false, currentState: 'COMPLETE' });
        break;
    }
  }

  /**
   * The early-finisher screen's "finish the meeting now" link. The two other
   * ways out of a finished task list both record highestCompletedMeeting; this
   * one set flowStatus and nothing else, so a learner who completed all seven
   * compulsory tasks and took the link was recorded as never having finished.
   */
  function finishMeetingEarly() {
    const s = get();
    const studentId = currentStudentUid();
    if (studentId && !s.isSupersededByOtherDevice) {
      const normId = normalizeStudentId(studentId);
      useStore.getState().updateHighestCompletedMeeting(studentId, s.sessionNumber);
      useStore.getState().updateHighestCompletedMeeting(normId, s.sessionNumber);
      firebaseSyncService.syncHighestCompletedMeeting(studentId, s.sessionNumber).catch(console.error);
      if (normId !== studentId) {
        firebaseSyncService.syncHighestCompletedMeeting(normId, s.sessionNumber).catch(console.error);
      }
    }
    // Meeting 8 is finished by its reflection board (finishReflection), not here.
    if (s.sessionNumber !== 8) markMeetingFinished(studentId, s.sessionNumber, s.isSupersededByOtherDevice);
    // PRD 14 §ג: a learner who is done waits on the quiet end screen. This used
    // to set 'reflection' for every meeting, and each one then rendered the
    // MEETING-2 reflection screen: it overwrote the learner's diagnostic
    // Q-matrix with nulls, replaced the meeting-2 reflection record, set the
    // gate back to PENDING_TEACHER_APPROVAL and filed a reflection under meeting 8.
    //
    // Fixing that sent every meeting to the quiet screen — meeting 8 with
    // them, and meeting 8 is the one meeting whose ending IS the reflection
    // board (Module 16 §א; Module 14 calls it "סיכום ורפלקציית SRL").
    // A card left open does not come along (1.10.2026).
    dropCoachingCard();
    set({ flowStatus: s.sessionNumber === 8 ? 'reflection' : 'sessionDone' });
  }

  /** The two exercise shapes whose operation is representation (measure 3). */
  function isRepresentationTask(task: SessionTask | undefined | null): boolean {
    return task?.type === 'representation' || task?.type === 'flexible_decomp';
  }

  function recordBoardCheckFailure(taskId: string) {
    const s = get();
    set({
      boardCheckFailures: (s.boardCheckFailuresTaskId === taskId ? s.boardCheckFailures : 0) + 1,
      boardCheckFailuresTaskId: taskId,
    });
  }

  /**
   * The single answer box (stations 3 and 7, owner 30.9.2026) holds one
   * number, not a digit per column, so its digits are recorded when the child
   * presses "התקדם" — keystroke by keystroke, "340" typed from the left would
   * pass through a 3 and then a 4 in the units, each one a wrong digit. Each
   * digit is recorded in its column of the written number (units = 0) as a
   * DIGIT_ENTERED whose is_correct compares it with the answer's digit there
   * (Appendix A §3) — what the first-attempt score, the Persistence Index's E
   * and measure 4 read (Module 23 §ב). The number is read with the leading
   * zeros of the answer's places: "40" for 340 has 0 hundreds, a wrong digit,
   * so a wrong number always records a wrong digit. A press records the
   * digits that changed since the previous press — wrong ones first: the
   * first digit after a coaching card tells whether that answer was right
   * (measure 4) — and a press with a wrong answer records at least one wrong
   * digit, even when nothing changed (the lowest wrong place), so every wrong
   * press counts once and a digit left as it was is not counted again. A press
   * with the same right answer records nothing. The last press survives a
   * reload (the snapshot), so a reload does not record unchanged digits again.
   */
  function recordSubmittedAnswer(task: SessionTask) {
    const s = get();
    const text = answerTextFromDigits(s.answerDigits);
    if (!text) return;
    const width = Math.max(text.length, typeof task.correctAnswer === 'number' ? String(task.correctAnswer).length : 0);
    const before = answerDigitsFromText((s.lastSubmittedAnswer ?? '').padStart(s.lastSubmittedAnswer === null ? 0 : width, '0'));
    const now = answerDigitsFromText(text.padStart(width, '0'));
    const judged = PLACE_ORDER.filter((p) => now[p] !== undefined).map((place) => {
      const digit = parseInt(now[place] as string, 10);
      const expected = computeExpectedDigitForColumn(task, place);
      return { place, digit, isCorrect: expected === null ? null : digit === expected, changed: now[place] !== before[place] };
    });
    const wrongNow = judged.filter((d) => d.isCorrect === false);
    const wrongChanged = wrongNow.filter((d) => d.changed);
    const entered = [
      ...(wrongChanged.length > 0 ? wrongChanged : wrongNow.slice(0, 1)),
      ...judged.filter((d) => d.isCorrect !== false && d.changed),
    ];
    if (entered.length === 0) return;
    const studentId = currentStudentUid();
    for (const e of entered) {
      emitTelemetry({
        session_id: `session_${s.sessionNumber}_student_${studentId}`,
        student_id: studentId,
        exercise_id: task.id,
        event_type: 'DIGIT_ENTERED',
        column_index: placeToColumnIndex(e.place),
        details: { digit_value: e.digit, is_correct: e.isCorrect },
      }).catch(console.error);
    }
    const wrong = entered.filter((e) => e.isCorrect === false).length;
    set({
      lastSubmittedAnswer: text,
      typedErrorCount: s.typedErrorCount + wrong,
      hasDigitErrorInTask: wrong > 0 ? true : s.hasDigitErrorInTask,
    });
  }

  /** Opens the card for the "four errors" streak's column (see nextDigitErrorStreak). */
  function openCardForDigitErrorStreak(place: Place, conversionMissed = false) {
    setTimeout(() => {
      const refusal = socraticCardRefusal(get(), 'consecutive_errors_4', place);
      if (refusal === null) {
        get().openSocraticCard('consecutive_errors_4', place);
        return;
      }
      // Refused — the same card again, the lockout, a solved exercise: the
      // streak starts over, and a wrong digit before its column's conversion
      // gets that card instead. The streak used to stay at 4 or more and keep
      // the conversion card shut on every further wrong digit (final review,
      // 2.10.2026). Under an open card the streak is kept for the next digit.
      if (refusal === 'card_open') return;
      set({ digitErrorStreak: 0, digitErrorStreakPlace: null });
      if (conversionMissed) get().openSocraticCard('conversion_not_performed', place);
    }, 0);
  }

  /**
   * A wrong press in the exercise `taskId` — a wrong "התקדם", or (station 3's
   * "another way" exercises, owner 1.10.2026, D6) a wrong "הוספת ייצוג".
   *
   * PRD Module 12 & 14: the card never opens in the diagnostic. מסמך 03 §3.1
   * names this trigger for meeting 1 too. Owner rulings 14.9.2026 and
   * 16.9.2026: support stays inside the exercise, and it is contingent (Wood
   * et al.; מסמך 03 §1.3 ד' "שגיאות חוזרות"). The first wrong answer gets the
   * feedback line and the learner's own tools (Undo, memory circles, blocks).
   * The coaching card opens on the second wrong answer in a row on the same
   * exercise, through the 300 ms "נסו לחשוב…" beat.
   *
   * The beat shows only when the card will open after it (1.10.2026): with a
   * card already open or under its hourglass, the press used to start a beat
   * whose card was refused — and the beat's end left the machine in
   * SOCRATIC_ACTIVE with no card, so no trigger opened a card again in that
   * exercise. A card that would be refused (the lockout, the same card again,
   * an exercise already solved) no longer flashes the beat either.
   */
  function noteWrongPress(taskId: string, opts: { holdCard?: boolean } = {}) {
    const s = get();
    if (s.sessionNumber === 2) return;
    const streak = (s.wrongAnswerTaskId === taskId ? s.wrongAnswerStreak : 0) + 1;
    set({ wrongAnswerStreak: streak, wrongAnswerTaskId: taskId });
    // `holdCard`: the press already brought another help (the result row's
    // place cues) — the streak still counts, and the card opens on the next
    // wrong answer.
    if (streak >= 2 && !opts.holdCard) {
      if (socraticCardRefusal(get(), 'repeated_errors') === null) {
        set({ helpState: 'friction', frictionTriggerSource: 'mistake' });
      }
    }
  }

  /**
   * Why a coaching card for `reason` would not open now, or null when it
   * would. One rule for every trigger, and for the "נסו לחשוב…" beat before
   * the card of a second wrong answer.
   */
  function socraticCardRefusal(s: WorkspaceState, reason: SocraticTriggerReason, place?: Place): string | null {
    // PRD Module 12 & 14: the card is disabled outright in session 2.
    if (s.sessionNumber === 2) return 'diagnostic';
    // Only on an exercise in progress: not on the choice screen, the
    // reflection board, the end screen, nor in the moments after the last
    // exercise was solved (1.10.2026).
    if (s.flowStatus !== 'task' || s.awaitingNext) return 'no_exercise';
    // One card at a time: never over a card on the screen or under its hourglass.
    if (s.helpState === 'socratic') return 'card_open';
    // The lock is released by the countdown the OPEN card polls. Closing the
    // card during the lockout (its close button stays enabled, and typing a
    // digit closes it too) stopped the polling; the remaining time is read
    // here, and a lockout that ended is released.
    if (s.isSocraticCardLocked && get().getSocraticPenaltyRemaining() > 0) return 'lockout';
    // Owner, 1.10.2026 (D3): while the child's call to the teacher is open,
    // the pause is waiting for the teacher, not hesitation.
    if (reason === 'hesitation_45s' && s.hasRequestedBasicHelp) return 'teacher_called';
    const task = selectStandardTask(s);
    if (exerciseSolvedForCard(s, task)) return 'solved';
    const cardPlace = place ?? cardFocusPlace(s, task, reason, useBoardFocusStore.getState().focusedMemoryCircle);
    const history = s.socraticCardHistory.taskId === (task?.id ?? null) ? s.socraticCardHistory.cards : [];
    if (reason === 'conversion_not_performed') {
      const last = [...history].reverse().find((c) => c.reason === reason && c.place === cardPlace);
      if (last && Date.now() - last.openedAt < CONVERSION_CARD_COOLDOWN_MS) return 'cooldown';
    }
    // The same card does not come back again and again in one exercise
    // (coordinator's decision, 2.10.2026). A card is its trigger, its column
    // and its situation family: the family's next level is the same card
    // going one step further, and opens; once the child chose a right option
    // in the family, it does not open again; and its last level — the very
    // same card — opens twice at most in all.
    const staticNow = SocraticEngine.getSynchronousTaskHint(task ?? undefined, s.counts, staticCardContextFor(s, task?.id, task, { reason, place: cardPlace }));
    const family = cardFamilyOf(staticNow);
    const same = history.filter((c) => c.shown && c.reason === reason && c.place === cardPlace && (c.family ?? c.staticQuestionHe) === family);
    if (same.some((c) => c.answeredCorrect === true)) return 'repeat';
    if (same.filter((c) => c.staticQuestionHe === staticNow.questionHe).length >= MAX_IDENTICAL_SOCRATIC_CARDS) return 'repeat';
    return null;
  }

  /**
   * The exercise ended under an open card (the choice screen, the reflection
   * board, the end screen): the card belonged to it, and goes with it. The
   * next exercise's start does the same (startTask).
   */
  function dropCoachingCard() {
    cancelSocraticRequest();
    const s = get();
    if (s.helpState === 'closed' && !s.socraticPending && s.currentState !== 'SOCRATIC_ACTIVE') return;
    set({
      helpState: 'closed',
      socraticPending: false,
      aiSocraticHint: null,
      frictionTriggerSource: null,
      ...(s.keyboardState === 'SOCRATIC_ONLY' ? { keyboardState: 'LOCKED' as KeyboardState } : {}),
      ...(s.currentState === 'SOCRATIC_ACTIVE' ? { currentState: 'PROBLEM_ACTIVE' as VRAWorkspaceState } : {}),
    });
  }

  /** Sessions 1/3/4 proceed (vanilla handleSession1Proceed, app.js 999–1110). */
  function proceedStandard() {
    const s = get();
    const tasks = getActiveTasks(s);
    const task = tasks[s.standardTaskIdx];
    if (!task) return;

    const handleFailure = (
      detail: string,
      feedbackTitle: string,
      feedbackSub: string,
      feedbackMs: number,
      opts: { holdCard?: boolean } = {}
    ) => {
      // Register 17 / PRD Module 12 §ב: an empty answer or an unanswered
      // question is not a wrong answer — not for the card on the second wrong
      // answer, and not for the card on the fourth wrong attempt either.
      const incomplete = detail === 'missing_answer' || detail === 'no_choice';
      if (!incomplete) get().incrementConsecutiveErrors();
      if (isRepresentationTask(task) && detail !== 'missing_answer') recordBoardCheckFailure(task.id);
      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        let errorCategory: 'FACTUAL_ERROR' | 'PROCEDURAL_ERROR' | 'STRATEGIC_ERROR' = 'FACTUAL_ERROR';
        if (detail.includes('overcrowded_columns') || detail.includes('wrong_blocks')) {
          errorCategory = 'PROCEDURAL_ERROR';
        } else if (detail.includes('no_choice') || detail.includes('canonical_fixation')) {
          errorCategory = 'STRATEGIC_ERROR';
        }
        AuditLogger.log(errorCategory, studentId, `Task: ${task.id}, Detail: ${detail}`);
        // PRD Module 14 §ב: meeting 1 is not scored, so it writes no Q-matrix result.
        if (s.sessionNumber !== 1) {
          const qKey = (task as any).qMatrixKey || (task as any).targetNode || task.id;
          const qUpdate = { [qKey]: detail };
          firebaseSyncService.syncQMatrix(studentId, qUpdate as any).catch(console.error);
          useStore.getState().updateQMatrix(studentId, qUpdate as any);
        }
      }

      // An empty answer or an unanswered question is not a wrong answer and
      // never opens the card (noteWrongPress).
      if (!incomplete) noteWrongPress(task.id, { holdCard: opts.holdCard });
      showFeedback({ correct: false, title: feedbackTitle, sub: feedbackSub }, feedbackMs);
    };

    const handleSuccess = (feedbackTitle: string, feedbackSub: string, feedbackMs: number) => {
      get().resetConsecutiveErrors();
      // Module 29 §ב: COMPLETE — "התרגיל פותר בהצלחה, מעבר לתרגיל הבא או
      // לשער האישור". The next exercise's start moves it to PROBLEM_ACTIVE.
      set({ awaitingNext: true, wrongAnswerStreak: 0, wrongAnswerTaskId: null, currentState: 'COMPLETE' });

      const studentId = currentStudentUid();
      const durationMs = Math.max(0, Date.now() - (s.taskStartTime || Date.now()));
      emitTelemetry({
        session_id: `session_${s.sessionNumber}_student_${studentId}`,
        student_id: studentId,
        exercise_id: task.id,
        event_type: 'PROBLEM_COMPLETE',
        details: {
          total_duration_ms: durationMs,
          undo_count: s.undoCount,
          error_count: isRepresentationTask(task)
            ? (s.boardCheckFailuresTaskId === task.id ? s.boardCheckFailures : 0)
            : s.consecutiveErrorCount || 0,
        },
      }).catch(console.error);

      // Module 14: Choice branch tasks are strictly excluded from baseline Q-Matrix mastery,
      // and meeting 1 (§ב, never scored) writes no result at all.
      if (studentId && !task.isOptionalChoiceTask && s.sessionNumber !== 1) {
        const qKey = (task as any).qMatrixKey || (task as any).targetNode || task.id;
        const qUpdate = { [qKey]: 'success' };
        firebaseSyncService.syncQMatrix(studentId, qUpdate as any).catch(console.error);
        useStore.getState().updateQMatrix(studentId, qUpdate as any);
      }
      // Owner ruling (14.9.2026): nothing is injected into the seven compulsory
      // exercises. Challenge work belongs to the choice path after the
      // compulsory set (Module 14 §ג), not mid-sequence.
      
      if ((task.scaffoldLevel ?? 0) >= 1) {
        set({ scaffoldFadeLevel: Math.min(2, get().scaffoldFadeLevel + 1) });
      }
      
      showFeedback({ correct: true, title: feedbackTitle, sub: feedbackSub }, feedbackMs);
      advanceStandard();
    };

    // Stations 3 and 7: the single answer box's digits are recorded at this
    // press, whatever the board shows (recordSubmittedAnswer).
    if (task.type === 'representation' && task.representationKind) recordSubmittedAnswer(task);
    const verdict = judgeStandardTask(s, task);
    if (verdict.kind === 'success') {
      handleSuccess(verdict.title, verdict.sub, verdict.ms);
      return;
    }
    if (verdict.kind === 'notice') {
      // Nothing to judge yet (no option chosen, an empty box): not a wrong answer.
      showFeedback({ correct: false, title: verdict.title, sub: verdict.sub }, verdict.ms);
      return;
    }
    // Stations 3–7 (owner, 30.9.2026): a digit in the wrong place turns on the
    // result row's place cues until the end of the exercise. One help per
    // press: the press that brings the cues does not also open the coaching
    // card — the card waits for the next wrong answer.
    let cuesJustShown = false;
    if (verdict.placeError && !s.placeCuesShown) {
      set({ placeCuesShown: true });
      emitScaffoldEvent(get(), 'PLACE_CUES_SHOWN', { profile: s.activeSupportProfileId === 'enhanced_cognitive_support' ? 'enhanced' : 'regular' });
      cuesJustShown = true;
    }
    handleFailure(verdict.detail, verdict.title, verdict.sub, verdict.ms, { holdCard: cuesJustShown });
    if (verdict.clearReps) set({ q3Reps: [] });
  }

  function advanceStandard() {
    // גבול ההחלה הבטוח (מודול 19 §ב, מודול 26 §ב). כל שינוי מסלול — זה
    // שהמורה המתינה איתו במגירת הלומד, וזה שנכתב ישירות לרשומה — נכנס
    // לתוקף כאן, בין תרגיל לתרגיל, לפני שנבחר המאגר של התרגיל הבא. קודם
    // לכן המאגר נקרא חי בכל רינדור, ומורה ששינתה מסלול בזמן שילד עמד
    // באמצע תרגיל החליפה לו את המספרים על המסך.
    //
    // הסדר חשוב: קודם ההחלה הממתינה של מודול 19 (שמעדכנת את הרשומה),
    // ואז הנעיצה — אחרת שינוי שהומתן היה נכנס לתוקף תרגיל אחד מאוחר מדי.
    // startTask קוראת ל-applyPendingAdaptationAtBoundary שוב, וזו כבר
    // חוזרת ריקם.
    applyPendingAdaptationAtBoundary();
    // A record that momentarily carries no path keeps the meeting on the path
    // it was pinned to — never an unknown one, never green by default.
    set({ activeBankPath: pinnableLearningPath() ?? get().activeBankPath });
    const s = get();
    const tasks = getActiveTasks(s);
    const nextIdx = s.standardTaskIdx + 1;

    // The exercise is over: a card left open on it does not follow the child
    // onto the choice screen, the reflection board or the end screen (the
    // next exercise's start closes it the same way).
    if (nextIdx >= tasks.length) dropCoachingCard();

    // Module 14: Choice screen (Reinforcement vs Challenge) must only be triggered in Sessions 3–7
    if (nextIdx >= tasks.length && !s.selectedBranch) {
      if (s.sessionNumber >= 3 && s.sessionNumber <= 7) {
        set({ flowStatus: 'choice_branch', awaitingNext: false });
        // The learner's canonical id, never an account's own uid (ids 1–12 only).
        const studentId = currentStudentUid();
        if (studentId && !s.isSupersededByOtherDevice) {
          const normId = normalizeStudentId(studentId);
          // PRD 14 §ב1: the meeting is completed by the seven compulsory
          // exercises. It used to be recorded only after the optional path or
          // "סיום המפגש כעת", so a learner still choosing (or inside a branch
          // task) when the lesson ended was never marked as having finished.
          useStore.getState().updateHighestCompletedMeeting(studentId, s.sessionNumber);
          useStore.getState().updateHighestCompletedMeeting(normId, s.sessionNumber);
          firebaseSyncService.syncHighestCompletedMeeting(studentId, s.sessionNumber).catch(console.error);
          if (normId !== studentId) {
            firebaseSyncService.syncHighestCompletedMeeting(normId, s.sessionNumber).catch(console.error);
          }
          markMeetingFinished(studentId, s.sessionNumber, s.isSupersededByOtherDevice);
          const studentPayload = {
            lastAction: 'השלים משימות חובה — בוחר מסלול (ביסוס/אתגר)',
            lastActivityTimestamp: Date.now(),
            onlineStatus: 'active',
          };
          throttledRtdbUpdate(`users/students/${studentId}`, studentPayload).catch(console.error);
          if (normId !== studentId) {
            throttledRtdbUpdate(`users/students/${normId}`, studentPayload).catch(console.error);
          }
        }
        return;
      }

      // For sessions 1, 2, and 8: route directly to session completion / quiet end screen
      const studentId = currentStudentUid();
      if (studentId && !s.isSupersededByOtherDevice) {
        const normId = normalizeStudentId(studentId);
        useStore.getState().updateHighestCompletedMeeting(studentId, s.sessionNumber);
        useStore.getState().updateHighestCompletedMeeting(normId, s.sessionNumber);
        firebaseSyncService.syncHighestCompletedMeeting(studentId, s.sessionNumber).catch(console.error);
        if (normId !== studentId) {
          firebaseSyncService.syncHighestCompletedMeeting(normId, s.sessionNumber).catch(console.error);
        }
      }
      // Meetings 1 and 2 are finished here; meeting 8 only by its reflection board.
      if (s.sessionNumber !== 8) markMeetingFinished(studentId, s.sessionNumber, s.isSupersededByOtherDevice);

      set({ awaitingNext: true, currentState: 'COMPLETE' });
      showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! 🎉', sub: `תַּחֲנָה ${s.sessionNumber} הוּשְׁלְמָה בְּהַצְלָחָה!` }, 2500);
      // מודול 16: מפגש 8 מסתיים בלוח הרפלקציה התלת-שלבי — זו כל מטרתו
      // ("חוקר-על — סיכום ורפלקציית SRL", מודול 14). הלוח היה בנוי, נבדק
      // ונשמר כהלכה, אבל שום מסלול בקוד לא הוביל אליו: כל מפגש הסתיים
      // במסך "כל הכבוד", והלוח לא נפתח לאף ילד מעולם.
      // The end used to be the toast’s callback, which runs only if no newer
      // toast appeared: the help button’s toast in those 2.5 seconds left
      // "התקדם" off and the meeting unfinished until a reload (PRD Module 14).
      afterInThisMeeting(2500, () => set({ flowStatus: s.sessionNumber === 8 ? 'reflection' : 'sessionDone', awaitingNext: false }));
      return;
    }

    if (nextIdx < tasks.length) {
      // Module 19: a pending support profile is applied by startTask below.
      set({ standardTaskIdx: nextIdx, awaitingNext: false });
      const studentId = currentStudentUid();
      if (studentId && !s.isSupersededByOtherDevice) {
        const normId = normalizeStudentId(studentId);
        const taskTitle = tasks[nextIdx]?.titleHe || `משימה ${nextIdx + 1}`;
        const studentPayload = {
          currentTaskIdx: nextIdx,
          activeStep: nextIdx + 1,
          lastAction: `מתקדם למשימה ${nextIdx + 1}: ${taskTitle}`,
          lastActivityTimestamp: Date.now(),
          onlineStatus: 'active',
        };
        throttledRtdbUpdate(`users/students/${studentId}`, studentPayload).catch(console.error);
        if (normId !== studentId) {
          throttledRtdbUpdate(`users/students/${normId}`, studentPayload).catch(console.error);
        }
      }

      // startTask emits the exercise's PROBLEM_LOAD; a second one here doubled every load.
      startTask(tasks[nextIdx].id);
      return;
    }

    // Session complete
    const studentId = currentStudentUid();
    if (studentId && !s.isSupersededByOtherDevice) {
      const normId = normalizeStudentId(studentId);
      useStore.getState().updateHighestCompletedMeeting(studentId, s.sessionNumber);
      useStore.getState().updateHighestCompletedMeeting(normId, s.sessionNumber);
      firebaseSyncService.syncHighestCompletedMeeting(studentId, s.sessionNumber).catch(console.error);
      if (normId !== studentId) {
        firebaseSyncService.syncHighestCompletedMeeting(normId, s.sessionNumber).catch(console.error);
      }
    }
    // Meetings 3–7 were marked at the branch choice already (sent once).
    if (s.sessionNumber !== 8) markMeetingFinished(studentId, s.sessionNumber, s.isSupersededByOtherDevice);

    set({ awaitingNext: true, currentState: 'COMPLETE' });
    // One praise, one sentence: meetings 3–7 end on the closing sentence of
    // owner decision E2, which opens with "כל הכבוד" itself, so the toast
    // before it only says the station is done.
    showFeedback(
      hasClosingSentence(s.sessionNumber)
        ? { correct: true, title: `תַּחֲנָה ${s.sessionNumber} הוּשְׁלְמָה בְּהַצְלָחָה! 🎉` }
        : { correct: true, title: 'כָּל הַכָּבוֹד! 🎉', sub: `תַּחֲנָה ${s.sessionNumber} הוּשְׁלְמָה בְּהַצְלָחָה!` },
      2500,
    );
    // מודול 16: מפגש 8 מסתיים בלוח הרפלקציה התלת-שלבי — זו כל מטרתו
    // ("חוקר-על — סיכום ורפלקציית SRL", מודול 14). הלוח היה בנוי, נבדק
    // ונשמר כהלכה, אבל שום מסלול בקוד לא הוביל אליו: כל מפגש הסתיים
    // במסך "כל הכבוד", והלוח לא נפתח לאף ילד מעולם.
    // The end used to be the toast’s callback, which runs only if no newer
    // toast appeared: the help button’s toast in those 2.5 seconds left
    // "התקדם" off and the meeting unfinished until a reload (PRD Module 14).
    afterInThisMeeting(2500, () => set({ flowStatus: s.sessionNumber === 8 ? 'reflection' : 'sessionDone', awaitingNext: false }));
  }

  /** Session-2 proceed (vanilla handleQTaskProceed, app.js 1112–1162). */
  function proceedQ() {
    const s = get();
    const task = getCurrentQTask(s.qflow);
    if (!task || s.awaitingNext) return;
    // The first attempt is recorded once. A primary-round task that already
    // has its result moves on; judging it again replaced the answer the
    // diagnostic is scored on (resumeDiagnosticAfterRestore does this on a reload).
    if (s.qflow.phase === 'primary' && s.qflow.results[task.id]) {
      set({ awaitingNext: true });
      continueAfterPrimaryAnswer();
      return;
    }
    const subtask = isSubtaskActive(s.qflow);

    let answer: number | null = null;
    let expected: number | null = task.correctAnswer ?? null;
    if (subtask) {
      answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
      // The probe is its own, smaller exercise. Task 3 shows 40 − 10 while the
      // task it belongs to is 42 − 15, and the child's answer used to be
      // compared against 27 — so the correct answer 30 was marked wrong, and
      // typing 27 was marked right. The verdict feeds the diagnostic tag, the
      // Q-matrix and the teacher's gate decision, so it has to be graded
      // against the probe's own answer.
      const diag = task.backwardDiagnosis;
      const probeExpected = s.isASD && diag?.asdProbeAnswer !== undefined
        ? diag.asdProbeAnswer
        : diag?.probeAnswer;
      if (probeExpected !== undefined) expected = probeExpected;
    } else if (task.type === 'digit_value') {
      // Owner's ruling 28.9.2026: task 2 is judged by the value in its one box
      // when "התקדם" is pressed. The box also writes its last two digits into
      // the tens and units, and the answer used to be read from those — so 140
      // in the box was graded as 40.
      answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
    } else {
      answer = answerDigitsToNumber(s.answerDigits);
      if ((answer === null || isNaN(answer)) && s.probeAnswer) {
        answer = parseInt(s.probeAnswer, 10);
      }
    }

    if (answer === null || Number.isNaN(answer)) {
      // Neutral, like every meeting-2 toast: no wrong-answer border or 🤔
      // (register, "מפגש 2 — אישור שקט"; register ז, no feedback that reveals correctness).
      showFeedback({ correct: false, neutral: true, title: 'הַקְלָדַת תְּשׁוּבָה ✏️', sub: 'כִּתְבוּ אֶת הַתְּשׁוּבָה.' }, 1500);
      return;
    }

    const isCorrect = expected !== null && answer === expected;
    const evalResult = { correct: isCorrect, detail: isCorrect ? '' : 'wrong_answer' };

    if (evalResult) {
      if (!evalResult.correct) {
        get().incrementConsecutiveErrors();
        const studentId = useAuthStore.getState().user?.uid;
        if (studentId) {
          let errorCategory: 'FACTUAL_ERROR' | 'PROCEDURAL_ERROR' | 'STRATEGIC_ERROR' = 'FACTUAL_ERROR';
          const d = evalResult.detail;
          if (d.includes('overcrowded_columns') || d.includes('wrong_blocks')) {
            errorCategory = 'PROCEDURAL_ERROR';
          } else if (d.includes('no_choice') || d.includes('canonical_fixation')) {
            errorCategory = 'STRATEGIC_ERROR';
          }
          AuditLogger.log(errorCategory, studentId, `QTask: ${task.id}, Detail: ${d}`);
        }
      } else if (s.qflow.phase === 'correction') {
        // A correct answer in the correction round is not a solved task: the
        // server's first-attempt score (sessionTrigger → computeFirstAttemptScore)
        // counts every PROBLEM_COMPLETE, so sending one here scored a task the
        // child failed — or the easier round-number exercise — as solved first time.
        get().resetConsecutiveErrors();
      } else {
        get().resetConsecutiveErrors();
        const studentId = currentStudentUid();
        const durationMs = Math.max(0, Date.now() - (s.taskStartTime || Date.now()));
        emitTelemetry({
          session_id: `session_2_student_${studentId}`,
          student_id: studentId,
          exercise_id: task.id,
          event_type: 'PROBLEM_COMPLETE',
          details: {
            total_duration_ms: durationMs,
            undo_count: s.undoCount,
            error_count: s.consecutiveErrorCount || 0,
          },
        }).catch(console.error);
      }
      // Module 29 §ב: a solved task is COMPLETE until the next one starts.
      set({ awaitingNext: true, ...(evalResult.correct ? { currentState: 'COMPLETE' as VRAWorkspaceState } : {}) });
      const { state, event } = recordResult(s.qflow, { ...evalResult, had_digit_error: s.hasDigitErrorInTask === true });
      set({ qflow: state });
      handleQFlowEvent(event);
    }
  }

  const initialDeadline = getStoredSocraticLockDeadline();

  return {
    // canonical VRA state machine (Module 29 / Appendix A §5)
    currentState: 'IDLE' as VRAWorkspaceState,
    activeColumnIndex: 0,
    projectorBoard: false,
    isSocraticCardLocked: Boolean(initialDeadline && initialDeadline > Date.now()),
    socraticLockDeadline: initialDeadline,
    socraticPenaltyLockoutUntil: initialDeadline,
    hesitationTimerSeconds: 0,
    consecutiveErrorCount: 0,
    consecutiveUndoCount: 0,
    genericUndoStack: [],

    sessionNumber: 1,
    isASD: false,
    standardTaskIdx: 0,
    qflow: initQFlow(),
    flowStatus: 'task',
    awaitingNext: false,
    keyboardState: 'UNLOCKED',
    sessionStartTimeMs: Date.now(),
    isTimeExceeded: false,
    sessionDeadlineTime: null,
    sessionDurationMinutes: 15,
    selectedBranch: null,

    counts: { ...EMPTY_COUNTS },
    undoStack: [],
    regroupTriggerTimestamps: {},
    undoCount: 0,
    hesitationCount: 0,
    boardOpen: true,
    scaffoldFadeLevel: 0,
    errorPlace: null,
    errorNonce: 0,
    focusedPlace: null,
    isAdditionHelperOpen: false,
    additionHelperOffered: false,
    additionHelperOfferedUnopened: false,

    hasInteracted: false,
    placeCuesShown: false,
    socraticCardKinds: { taskId: null, kinds: [] },
    undoTimestamps: [],
    isBoardLocked: false,
    pendingAdaptation: null,
    hasRequestedBasicHelp: false,
    helpRequestCount: 0,
    taskStartTime: Date.now(),
    hasDeletedBlock: false,
    takeAwayTrack: null as TakeAwayTrack | null,
    heldFromTrack: null as HeldFromTrack | null,
    hasClearedBoard: false,
    blocksAddedCount: 0,
    digitErrorStreak: 0,
    digitErrorStreakPlace: null,
    hasUngrouped: false,
    hasGrouped: false,
    conversionsByColumn: emptyColumnConversions(),
    selectedChoiceId: null,
    answerDigits: {},
    carryDigits: {},
    probeAnswer: '',
    lastSubmittedAnswer: null,
    q3Reps: [],
    reflectionDraft: freshReflectionDraft(),
    operandDigits: { a: {}, b: {} },
    socraticTriggerReason: null,
    socraticCardPlace: null,
    socraticCardHistory: { taskId: null, cards: [] },
    previousSocraticCard: null,
    classScreenUp: false,

    feedback: null,
    feedbackNonce: 0,
    helpState: 'closed',
    frictionTriggerSource: null,
    wrongAnswerStreak: 0,
    wrongAnswerTaskId: null,
    boardCheckFailures: 0,
    boardCheckFailuresTaskId: null,
    aiSocraticHint: null,
    socraticPending: false,
    socraticDistractorHint: null,
    typedErrorCount: 0,
    hasDigitErrorInTask: false,
    socraticDistractorErrors: 0,
    meetingPersistence: freshMeetingPersistence(1),
    openingScreenSeen: false,
    lastInteractionTime: Date.now(),
    dynamicTasks: null,
    activeBankPath: null,
    helpRequested: false,
    pendingSupportProfileId: null,
    hasPendingSupportProfile: false,
    activeSupportProfileId: null,
    supportProfileApplied: false,
    activeDeviceId: null,
    isSupersededByOtherDevice: false,
    workspaceInitializedFor: null,

    setActiveDeviceId: (id) => set({ activeDeviceId: id }),
    setSupersededByOtherDevice: (superseded) => {
      // Every change to the student record echoed this call with the same
      // value; each call re-ran the workspace sync, which wrote the record
      // again, which fired the listener again — a write loop behind the slow
      // mouse and undo.
      if (get().isSupersededByOtherDevice !== superseded) set({ isSupersededByOtherDevice: superseded });
    },
    setHelpRequested: (val) => set({ helpRequested: val }),
    toggleHelpRequested: () => set((state) => ({ helpRequested: !state.helpRequested })),

    // Owner, 1.10.2026: the research data shows the exercise in which the
    // learner asked for help from the chat ("קראו למורה" or the ready message
    // "אפשר עזרה בתרגיל?"). Its own event; measure 2א counts it as help, like
    // the silent help button (owner, 1.10.2026).
    logChatHelpRequest: (kind) => {
      emitScaffoldEvent(get(), 'CHAT_HELP_REQUESTED', { kind });
    },

    setPendingSupportProfile: (profileId) => {
      // Module 19: Stores pending support profile without altering the active workspace/board/keyboard state
      set({ pendingSupportProfileId: profileId, hasPendingSupportProfile: true });
    },

    receiveSupportProfile: (profileId) => {
      const s = get();
      // An exercise is on screen once a profile was applied and the flow is
      // on a task. Before that — the first read of the record, or on the
      // choice and end screens — there is nothing to disturb: apply at once.
      const exerciseInProgress = s.supportProfileApplied && s.flowStatus === 'task';
      if (!exerciseInProgress) {
        if (s.activeSupportProfileId === profileId && s.supportProfileApplied && !s.hasPendingSupportProfile) return;
        set({
          activeSupportProfileId: profileId,
          pendingSupportProfileId: null,
          hasPendingSupportProfile: false,
          supportProfileApplied: true,
        });
        return;
      }
      if (profileId === s.activeSupportProfileId) {
        // Switched back before the exercise ended: nothing is waiting any more.
        if (s.hasPendingSupportProfile) set({ pendingSupportProfileId: null, hasPendingSupportProfile: false });
        return;
      }
      if (s.hasPendingSupportProfile && s.pendingSupportProfileId === profileId) return;
      set({ pendingSupportProfileId: profileId, hasPendingSupportProfile: true });
    },

    startSession: (meeting: number) => {
      const sanitized = sanitizeSessionNumber(meeting);
      const current = get();
      if (current.sessionNumber === sanitized && current.standardTaskIdx > 0 && current.flowStatus !== 'sessionDone') {
        return;
      }
      get().initSession(sanitized, get().isASD);
    },

    initSession: (meeting, isASD, startingTaskIdx, existingDeadline) => {
      flowEpoch++;
      const sanitized = sanitizeSessionNumber(meeting);
      // PRD v7.1 Module 26: promote pending curriculum-catalog updates only at
      // session initialization — a live exercise is never disturbed.
      curriculumCatalog.activateForSession();
      // PRD v7.1 Module 14 §ב: Session 1 sandbox = 20 min; Sessions 3-7 = 15 min; Sessions 2 & 8 = 25 min
      const durationMin = sanitized === 1 ? 20 : (sanitized >= 3 && sanitized <= 7) ? 15 : 25;

      // The deadline is kept on this device per learner, never per device
      // alone (application/meetingDeadline.ts): the next learner on a shared
      // tablet starts their own, and a learner who signs back in keeps theirs.
      // A deadline handed in (the server's) wins, and becomes the device copy.
      const learnerUid = currentStudentUid();
      let deadline = existingDeadline || null;
      if (deadline) {
        storeMeetingDeadline(sanitized, learnerUid, deadline);
      } else {
        // serverNow() — מסנכרן עם שרת Firebase לפני הבדיקה
        deadline = readStoredMeetingDeadline({
          meeting: sanitized,
          learnerUid,
          now: serverNow(),
          ownProgress: () => ownSavedProgress(learnerUid, sanitized),
        });
      }
      if (!deadline) {
        // יש לקרוא fetchServerClockOffset לפני כן (StudentHubPage / StudentWorkspacePage)
        // אם עדיין לא נקרא — serverNow() == Date.now() (offset=0, בטוח)
        deadline = serverNow() + durationMin * 60 * 1000;
        storeMeetingDeadline(sanitized, learnerUid, deadline);
      }

      const qflow = initQFlow();
      set({
        sessionNumber: sanitized,
        isASD,
        sessionDurationMinutes: durationMin,
        sessionDeadlineTime: deadline,
        selectedBranch: null,
        dynamicTasks: null,
        activeBankPath: pinnableLearningPath(),
        standardTaskIdx: startingTaskIdx ?? 0,
        qflow,
        flowStatus: 'task',
        awaitingNext: false,
        boardOpen: true,
        scaffoldFadeLevel: 0,
        errorPlace: null,
        feedback: null,
        helpState: 'closed',
        frictionTriggerSource: null,
    wrongAnswerStreak: 0,
    wrongAnswerTaskId: null,
    boardCheckFailures: 0,
    boardCheckFailuresTaskId: null,
        sessionStartTimeMs: Date.now(),
        isTimeExceeded: false,
        currentState: 'PROBLEM_ACTIVE',
        // A meeting starts here (a reload goes through restoreSession), so its
        // U, E and G start from zero (E1: "the events of the current meeting only").
        meetingPersistence: freshMeetingPersistence(sanitized),
        // A fresh meeting 2 or 8 starts on its opening screen.
        openingScreenSeen: false,
        // …and meeting 8's reflection board on its first stage, with nothing chosen.
        reflectionDraft: freshReflectionDraft(),
        ...resetTaskInteraction(isASD),
        // The addition grid and its return tab belong to the meeting (register
        // 18): a new meeting starts without them.
        isAdditionHelperOpen: false,
        additionHelperOffered: false,
        additionHelperOfferedUnopened: false,
        // Module 17: from here on the store holds this learner's meeting.
        workspaceInitializedFor: { learner: currentStudentUid(), meeting: sanitized, restoredSavedAt: null },
      });
      // A new meeting starts a new exercise: the card's 15-second lock ends (D5).
      cancelSocraticRequest();
      if (get().isSocraticCardLocked || get().socraticLockDeadline !== null) get().unlockSocraticCard();
      applyPendingSupportProfile();

      // getActiveTasks resolves the learner's approved path. getSessionTasks with
      // no path is the green bank, so every remediation learner's first event
      // named an exercise they never saw — a phantom "לא השלים" in each report.
      const initialTask = sanitized === 2 ? getCurrentQTask(qflow) : getActiveTasks(get())[startingTaskIdx ?? 0];
      if (sanitized !== 2) applyInitialBoard(initialTask as SessionTask | undefined);
      const studentId = currentStudentUid();
      if (initialTask) {
        emitTelemetry({
          session_id: `session_${sanitized}_student_${studentId}`,
          student_id: studentId,
          exercise_id: initialTask.id,
          event_type: 'PROBLEM_LOAD',
          details: {
            exercise_template_id: initialTask.id,
            path_type: 'compulsory',
          },
        }).catch(console.error);
      }
    },

    getSessionRemainingSeconds: () => {
      const deadline = get().sessionDeadlineTime;
      if (!deadline) return get().sessionDurationMinutes * 60;
      // שימוש ב-serverNow() בלבד — מגן מפני שעון מקומי עקום (תרחיש BIOS מת, טאבלט ישן)
      return Math.max(0, Math.floor((deadline - serverNow()) / 1000));
    },

    selectBranch: (branch: 'reinforcement' | 'challenge') => {
      const s = get();
      const currentTasks = getActiveTasks(s);
      // Module 26: the branch comes from the bank the meeting is pinned to.
      const path = s.activeBankPath ?? resolveLearningPath();
      if (!path) return;
      const branchTasks = getSessionBranchTasks(s.sessionNumber, branch, path);
      if (branchTasks.length === 0) return;

      set({
        selectedBranch: branch,
        activeBankPath: path,
        dynamicTasks: [...currentTasks, ...branchTasks],
        standardTaskIdx: currentTasks.length,
        flowStatus: 'task',
        awaitingNext: false,
      });

      const studentId = currentStudentUid();
      if (studentId && !s.isSupersededByOtherDevice) {
        const normId = normalizeStudentId(studentId);
        const branchLabel = branch === 'reinforcement' ? 'נתיב ביסוס 🛡️' : 'נתיב אתגר 🚀';
        const studentPayload = {
          activeBranch: branch,
          lastAction: `בחר ${branchLabel} (משימות רשות)`,
          lastActivityTimestamp: Date.now(),
          onlineStatus: 'active',
        };
        throttledRtdbUpdate(`users/students/${studentId}`, studentPayload).catch(console.error);
        if (normId !== studentId) {
          throttledRtdbUpdate(`users/students/${normId}`, studentPayload).catch(console.error);
        }
      }

      startTask(branchTasks[0].id);
    },

    restoreSession: (saved) => {
      if (!saved) return;
      flowEpoch++;
      const storedDeadline = getStoredSocraticLockDeadline();
      const sanitized = sanitizeSessionNumber(saved.sessionNumber);
      // PRD Module 14 §ב — the same table initSession uses: meeting 1 is 20
      // minutes, 3-7 are 15, 2 and 8 are 25. This copy said 25 for meeting 1,
      // so a refresh mid-sandbox handed the teacher a "עברו 25 דקות" popup
      // five minutes late.
      const durationMin = sanitized === 1 ? 20 : (sanitized >= 3 && sanitized <= 7) ? 15 : 25;
      // This learner's deadline for the meeting, as initSession keeps it: the
      // one the snapshot carries, else this learner's device copy. Never
      // another learner's, and never a fresh one — a restore continues a
      // meeting and does not restart its time (Module 14 §ב).
      const learnerUid = currentStudentUid();
      let sessionDeadline = saved.sessionDeadlineTime || null;
      if (sessionDeadline) {
        storeMeetingDeadline(sanitized, learnerUid, sessionDeadline);
      } else {
        sessionDeadline = readStoredMeetingDeadline({
          meeting: sanitized,
          learnerUid,
          now: serverNow(),
          ownProgress: () => ownSavedProgress(learnerUid, sanitized),
        });
      }

      // Module 26: the meeting goes on in the bank it was pinned to. The pin
      // was not saved, so a reload re-resolved it — and before the learner
      // record arrived that was the green bank, for every learner.
      const bankPath = savedBankPath(saved) ?? pinnableLearningPath();

      set({
        sessionNumber: sanitized,
        isASD: saved.isASD ?? false,
        sessionDurationMinutes: durationMin,
        sessionDeadlineTime: sessionDeadline,
        activeBankPath: bankPath,
        selectedBranch: saved.selectedBranch ?? null,
        standardTaskIdx: saved.standardTaskIdx ?? 0,
        qflow: restoredQFlow(saved.qflow),
        // Only meeting 8 ends on the reflection board (Module 16 §א). A snapshot
        // saved by older code as 'reflection' in another meeting is a finished
        // meeting: it reopens on the quiet end screen, never on a board with
        // questions (owner decision E2, 27.9.2026).
        flowStatus: saved.flowStatus === 'reflection' && sanitized !== 8 ? 'sessionDone' : (saved.flowStatus ?? 'task'),
        // This meeting's U, E and G survive the reload (E1).
        meetingPersistence: restoredMeetingPersistence(saved.meetingPersistence, sanitized),
        // A snapshot saved before the opening screen existed is a meeting
        // already under way: it does not go back to the opening.
        openingScreenSeen: saved.openingScreenSeen === false ? false : true,
        counts: saved.counts ?? { ...EMPTY_COUNTS },
        undoCount: saved.undoCount ?? 0,
        hesitationCount: saved.hesitationCount ?? 0,
        hasInteracted: saved.hasInteracted ?? false,
        taskStartTime: saved.taskStartTime ?? Date.now(),
        sessionStartTimeMs: saved.sessionStartTimeMs ?? Date.now(),
        isTimeExceeded: saved.isTimeExceeded ?? false,
        // The branch tasks are appended to the bank in memory only. Restoring the
        // index without them pointed past the seven compulsory exercises: an empty
        // card and a disabled "התקדם", with logout or a teacher reset the only exits.
        // Meeting 1: a learner whose saved place was counted in the order before
        // 27.9.2026 finishes the meeting in that order (SESSION1_ORDER_BEFORE_27_9).
        dynamicTasks: sanitized === 1
          ? restoredSession1Order(saved)
          : restoredBranchTasks(sanitized, saved.selectedBranch ?? null, bankPath),
        awaitingNext: false,
        boardOpen: true,
        isBoardLocked: false,
        // The card itself is not restored (helpState closes below), so a
        // keyboard saved mid-card as SOCRATIC_ONLY resumes as the Module 9 lock
        // it came from rather than as a state no action can leave.
        keyboardState: saved.keyboardState === 'SOCRATIC_ONLY' ? 'LOCKED' : (saved.keyboardState ?? (saved.isASD ? 'LOCKED' : 'UNLOCKED')),
        scaffoldFadeLevel: 0,
        errorPlace: null,
        feedback: null,
        helpState: 'closed',
        frictionTriggerSource: null,
        // Restored with the exercise they belong to (see getSyncableWorkspaceState).
        wrongAnswerStreak: Number(saved.wrongAnswerStreak) || 0,
        wrongAnswerTaskId: typeof saved.wrongAnswerTaskId === 'string' ? saved.wrongAnswerTaskId : null,
        boardCheckFailures: Number(saved.boardCheckFailures) || 0,
        boardCheckFailuresTaskId: typeof saved.boardCheckFailuresTaskId === 'string' ? saved.boardCheckFailuresTaskId : null,
        // Station 2: a wrong digit already typed in the task on screen still
        // counts against its first attempt after a reload (PRD 23 §ב).
        hasDigitErrorInTask: saved.hasDigitErrorInTask === true,
        // Stations 3–7: the result row's place cues stay to the end of the
        // exercise, a reload included — and a restore to another exercise
        // brings that exercise's own value, never the one on screen.
        placeCuesShown: saved.placeCuesShown === true,
        // The same for the coaching cards already shown (C4, C5): a reload
        // does not bring back the first level.
        socraticCardKinds: restoredCardKinds(saved.socraticCardKinds),
        // The cards opened in the exercise, with the kinds above and for the
        // same lifetime: a reload does not open again a card the child already
        // answered right, nor a third time the same card (final review, 2.10.2026).
        socraticCardHistory: restoredCardHistory(saved.socraticCardHistory),
        previousSocraticCard: null,
        isSocraticCardLocked: Boolean(storedDeadline && storedDeadline > Date.now()),
        socraticLockDeadline: storedDeadline,
        socraticDistractorHint: saved.socraticDistractorHint ?? null,
        selectedChoiceId: saved.selectedChoiceId ?? null,
        answerDigits: saved.answerDigits ?? {},
        carryDigits: saved.carryDigits ?? {},
        probeAnswer: saved.probeAnswer ?? '',
        // In the snapshot: after a reload, the next press of "התקדם" records
        // only what changed since the last press (recordSubmittedAnswer).
        lastSubmittedAnswer: typeof saved.lastSubmittedAnswer === 'string' ? saved.lastSubmittedAnswer : null,
        q3Reps: Array.isArray(saved.q3Reps) ? saved.q3Reps : [],
        // Meeting 8: the reflection board's stage and the answers chosen so far.
        reflectionDraft: restoredReflectionDraft(saved.reflectionDraft),
        operandDigits: saved.operandDigits ?? { a: {}, b: {} },
        // Now that the snapshot carries them, they are restored as saved —
        // including meeting 1's first step, which used to start over.
        hasDeletedBlock: saved.hasDeletedBlock ?? false,
        // Subtraction: a reload mid-take-away is still taking away.
        takeAwayTrack: restoredTakeAwayTrack(saved.takeAwayTrack),
        heldFromTrack: restoredHeldFromTrack(saved.heldFromTrack),
        blocksAddedCount: saved.blocksAddedCount ?? 0,
        // Meeting 1 decides by these: a child who grouped or decomposed and
        // then reloaded was told "do the conversion yourself" on a correct board.
        hasGrouped: saved.hasGrouped ?? false,
        hasUngrouped: saved.hasUngrouped ?? false,
        // Module 9 §א: a column already converted stays open after a reload —
        // its ten blocks are no longer on the board to be grouped again.
        conversionsByColumn: normalizeColumnConversions(saved.conversionsByColumn),
        hasClearedBoard: saved.hasClearedBoard ?? false,
        focusedPlace: null,
        undoStack: restoreUndoFrames(saved.undoStack),
        regroupTriggerTimestamps: {},
        currentState: 'PROBLEM_ACTIVE',
        // Register 18 / decision ב: the return tab, and an open grid, survive a reload.
        additionHelperOffered: saved.additionHelperOffered === true,
        additionHelperOfferedUnopened: false,
        isAdditionHelperOpen: saved.isAdditionHelperOpen === true,
        // Module 17: from here on the store holds this learner's meeting, as saved.
        // A copy of a fresh start made without the record is still a fresh
        // start: the record's first snapshot settles it by the fresh-start rule.
        workspaceInitializedFor: {
          learner: currentStudentUid(),
          meeting: sanitized,
          restoredSavedAt: startedWithoutRecord(saved) ? null : workspaceSavedAt(saved),
        },
      });
      // A reload is a task start too (Module 19 §ב).
      applyPendingSupportProfile();
      resumeDiagnosticAfterRestore();
    },

    injectTask: (task, position) => {
      const s = get();
      if (s.sessionNumber === 2) return;
      const currentTasks = s.dynamicTasks ? [...s.dynamicTasks] : [...getActiveTasks(s)];
      if (position === 'next') {
        currentTasks.splice(s.standardTaskIdx + 1, 0, task);
      } else {
        currentTasks.push(task);
      }
      set({ dynamicTasks: currentTasks });
    },

    applyDrop: (input) => {
      // The shake is raised after this update, not inside it: set() inside the
      // updater was overwritten by the state the updater returned, so a
      // rejected drop never shook — the block just did not land.
      let rejectedAt = null as Place | null;
      set((s) => {
        if (s.isBoardLocked) return s;
        const result = resolveDrop(s.counts, input, selectScaffoldLevel(s));
        if (!result.ok) {
          if (result.reason === 'constraint') rejectedAt = result.place;
          const studentId = useAuthStore.getState().user?.uid;
          if (studentId) {
            const task = getActiveTasks(s)[s.standardTaskIdx] || null;
            useStore.getState().logSemanticEvent(studentId, {
              action: 'drop_invalid',
              element: input.source === 'palette' ? `palette_block` : `${input.sourcePlace}_block`,
              target: input.target.kind === 'column' ? `${input.target.place}_column` : 'trash',
              context: `Failed due to ${result.reason}`,
              ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
              state_snapshot: `Units: ${s.counts.units}, Tens: ${s.counts.tens}, Hundreds: ${s.counts.hundreds}, Thousands: ${s.counts.thousands}`
            });
          }
          return s;
        }
        
        const isDelete = result.removed && input.target.kind === 'trash';
        const isUngroup = !!result.ungroupEvent;
        const isGroup = result.regroupEvents && result.regroupEvents.length > 0;
        const isFromStore = input.source === 'palette';
        const addedCount = isFromStore ? (s.blocksAddedCount + 1) : s.blocksAddedCount;

        const actionType: TelemetryEventType = (isGroup || isUngroup) ? 'REGROUPING_SUCCESS' : 'BLOCK_DRAG_COMPLETE';
        // PRD Module 8 §א: the drag right and the click emit the same
        // REGROUPING_SUCCESS, so a conversion names the column of the block
        // that broke apart (or of the ten that merged), as the click does — not
        // the column the block landed in. The report read a ten dragged onto
        // the units as "פריטה מטור האחדות".
        const conversionFrom = result.ungroupEvent?.from ?? result.regroupEvents?.[0]?.from;
        // The same column the drop's own event carries below.
        const undoColumn = conversionFrom
          ? placeToColumnIndex(conversionFrom)
          : input.target.kind === 'column'
            ? placeToColumnIndex(input.target.place)
            : isDelete && input.sourcePlace ? placeToColumnIndex(input.sourcePlace) : undefined;
        const stack = createNextUndoStack(
          s.undoStack,
          s.counts,
          actionType,
          undefined,
          isGroup || isUngroup ? s.conversionsByColumn : undefined,
          undoColumn
        );
        // Module 9 §א, per column: which column this drop converted.
        let conversionsByColumn = s.conversionsByColumn;
        if (result.ungroupEvent) conversionsByColumn = withColumnConversion(conversionsByColumn, 'decomposed', result.ungroupEvent.to);
        for (const ev of result.regroupEvents ?? []) conversionsByColumn = withColumnConversion(conversionsByColumn, 'composed', ev.from);

        const studentId = currentStudentUid();
        const currentTask = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = activeExerciseId(s);

        const updatedTriggerTimestamps = { ...s.regroupTriggerTimestamps };

        if (conversionFrom) {
          enterRegroupingActive();
          const regroupCol = placeToColumnIndex(conversionFrom);
          const regroupType = isUngroup ? 'decomposition' : 'composition';
          const triggerTime = s.regroupTriggerTimestamps?.[regroupCol];
          const durationMs = triggerTime ? Math.max(0, Date.now() - triggerTime) : 0;
          delete updatedTriggerTimestamps[regroupCol];

          emitTelemetry({
            session_id: sessionId,
            student_id: studentId,
            exercise_id: taskId,
            event_type: 'REGROUPING_TRIGGERED',
            column_index: regroupCol,
            details: { regrouping_type: regroupType },
          }).catch(console.error);

          emitTelemetry({
            session_id: sessionId,
            student_id: studentId,
            exercise_id: taskId,
            event_type: 'REGROUPING_SUCCESS',
            column_index: regroupCol,
            details: { regrouping_type: regroupType, duration_ms: durationMs },
          }).catch(console.error);
        } else if (input.target.kind === 'column') {
          const targetColIdx = placeToColumnIndex(input.target.place);
          // A palette block left no column: its source is null (types/telemetry.ts).
          // It used to carry its own place, so a unit added to the units column
          // logged the same column twice — the shape of a drop into the trash —
          // and the report counted every block taken from the palette as a use
          // of the trash (owner, 28.9.2026: "אי מצב שהשתמשתי בפח 85 פעם").
          const sourceColIdx = input.source === 'column' ? placeToColumnIndex(input.sourcePlace) : null;
          // A palette ten dropped on the units is a ten that landed as ten units
          // (DropResult.paletteUngroup): the block is the ten.
          const blockPlace = result.paletteUngroup ? input.sourcePlace : input.target.place;
          const blockVal = PLACE_VALUES[blockPlace];
          emitTelemetry({
            session_id: sessionId,
            student_id: studentId,
            exercise_id: taskId,
            event_type: 'BLOCK_DRAG_COMPLETE',
            column_index: targetColIdx,
            details: {
              block_value: blockVal,
              source_column_index: sourceColIdx,
            },
          }).catch(console.error);
        } else if (isDelete && input.sourcePlace) {
          // מודול 8 §א: מחיקה בפח היא אירוע טלמטריה תקני, מסונכרן לשרת,
          // ומוחרג ממדדי השגיאות. עד כה רק היומן הסמנטי ב-RTDB ראה אותה.
          // לפח אין טור משלו, ולכן שני שדות הטור נושאים את הטור שהלבנה
          // עזבה — צירוף שאף גרירה אחרת אינה מייצרת (גרירה לאותו טור
          // שקטה), וכך ציר הזמן מזהה השלכה לפח.
          const leftColIdx = placeToColumnIndex(input.sourcePlace);
          const blockVal = input.sourcePlace === 'thousands' ? 1000 : input.sourcePlace === 'hundreds' ? 100 : input.sourcePlace === 'tens' ? 10 : 1;
          emitTelemetry({
            session_id: sessionId,
            student_id: studentId,
            exercise_id: taskId,
            event_type: 'BLOCK_DRAG_COMPLETE',
            column_index: leftColIdx,
            details: {
              block_value: blockVal,
              source_column_index: leftColIdx,
            },
          }).catch(console.error);
        }

        // מסמך 03 §3.3–3.5 / מודול 8 §א: the drag-right decomposition runs the
        // same animation as the click. View only — the counts above are final.
        // A palette block that lands as ten lower blocks shows the same split
        // (the drop stays allowed), without being recorded as a break.
        const split = result.ungroupEvent ?? result.paletteUngroup;
        if (split) {
          announceRegroup({ kind: 'split', from: split.from, to: split.to, toCount: result.counts[split.to] });
        } else if (result.regroupEvents && result.regroupEvents.length > 0) {
          const ev = result.regroupEvents[0];
          announceRegroup({ kind: 'group', from: ev.from, to: ev.to, toCount: result.counts[ev.to] });
        }

        return {
          counts: result.counts,
          undoStack: stack,
          regroupTriggerTimestamps: updatedTriggerTimestamps,
          hasInteracted: true,
          blocksAddedCount: addedCount,
          // Module 11: Block deletion is NOT counted as Undo
          undoTimestamps: [],
          ...(isDelete ? { hasDeletedBlock: true } : {}),
          ...(isUngroup ? { hasUngrouped: true } : {}),
          ...(isGroup ? { hasGrouped: true } : {}),
          conversionsByColumn,
          ...((isGroup || isUngroup) && s.keyboardState === 'LOCKED' ? { keyboardState: 'UNLOCKED' as KeyboardState } : {})
        };
      });
      if (rejectedAt) flagConstraintError(rejectedAt);
    },

    removeBlockClick: (place) => {
      let rejected = false as boolean;
      set((state) => {
        if (state.isBoardLocked) return state;
        const next = removeBlock(state.counts, place);
        if (!next) {
          rejected = true;
          return state;
        }
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'BLOCK_DRAG_COMPLETE', undefined, undefined, placeToColumnIndex(place));

        const studentId = useAuthStore.getState().user?.uid;
        if (studentId) {
          const task = getActiveTasks(state)[state.standardTaskIdx] || null;
          useStore.getState().logSemanticEvent(studentId, {
            action: 'block_clicked_to_remove',
            element: `${place}_block`,
            context: `Removed a block from ${place}`,
            ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
            state_snapshot: `Units: ${next.units}, Tens: ${next.tens}, Hundreds: ${next.hundreds}, Thousands: ${next.thousands}`
          });
        }

        // Module 11: Block deletion is NOT an Undo, does not increment undoCount
        return { 
          counts: next, 
          undoStack,
          hasInteracted: true,
          hasDeletedBlock: true,
        };
      });
      if (rejected) flagConstraintError(place);
    },

    clearBoard: () => {
      set((state) => {
        if (state.isBoardLocked) return state;
        const hasBlocks = state.counts.units > 0 || state.counts.tens > 0 || state.counts.hundreds > 0 || state.counts.thousands > 0;
        // Nothing to clear, but the child did press the trash (meeting 1 step 5).
        // In meeting 1 it is recorded, so the report's tool mastery agrees; the
        // other meetings keep recording only a trash that cleared something.
        if (!hasBlocks) {
          if (state.sessionNumber !== 1) return { hasClearedBoard: true };
          const emptyId = currentStudentUid();
          emitTelemetry({
            session_id: `session_${state.sessionNumber}_student_${emptyId}`,
            student_id: emptyId,
            exercise_id: activeExerciseId(state),
            event_type: 'BOARD_CLEARED',
            details: { units: 0, tens: 0, hundreds: 0, thousands: 0, blocks_removed: 0 },
          }).catch(console.error);
          return { hasClearedBoard: true };
        }

        // Undoing it is reported as undoing a board clear (gap יז), not a block drag.
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'BOARD_CLEARED');
        const studentId = useAuthStore.getState().user?.uid;
        if (studentId) {
          useStore.getState().logSemanticEvent(studentId, {
            action: 'board_cleared',
            element: 'trash_can',
            context: 'Cleared all blocks on board via trash can click',
            state_snapshot: `Units: 0, Tens: 0, Hundreds: 0, Thousands: 0`
          });
        }

        // מודול 8 §א: איפוס הלוח בפח הוא אירוע טלמטריה תקני, מסונכרן,
        // ומוחרג ממדדי השגיאות. עד כה רק היומן הסמנטי שלמעלה ראה אותו,
        // וציר הזמן של המורה הראה שלא קרה כלום.
        const telemetryId = currentStudentUid();
        emitTelemetry({
          session_id: `session_${state.sessionNumber}_student_${telemetryId}`,
          student_id: telemetryId,
          exercise_id: activeExerciseId(state),
          event_type: 'BOARD_CLEARED',
          details: {
            units: state.counts.units,
            tens: state.counts.tens,
            hundreds: state.counts.hundreds,
            thousands: state.counts.thousands,
            blocks_removed: state.counts.units + state.counts.tens + state.counts.hundreds + state.counts.thousands,
          },
        }).catch(console.error);

        return { 
          counts: { ...EMPTY_COUNTS },
          undoStack,
          hasInteracted: true,
          hasDeletedBlock: true,
          hasClearedBoard: true, 
        };
      });
    },

    splitBlockClick: (place) => {
      set((state) => {
        if (state.isBoardLocked) return state;
        const res = splitBlockClick(state.counts, place);
        if (!res) {
          flagConstraintError(place);
          return state;
        }
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'REGROUPING_SUCCESS', undefined, state.conversionsByColumn, placeToColumnIndex(place));

        const studentId = currentStudentUid();
        const task = getActiveTasks(state)[state.standardTaskIdx] || null;
        const sessionId = `session_${state.sessionNumber}_student_${studentId}`;
        const taskId = activeExerciseId(state);
        const colIdx = placeToColumnIndex(place);

        const updatedTriggerTimestamps = { ...state.regroupTriggerTimestamps };
        const triggerTime = state.regroupTriggerTimestamps?.[colIdx];
        const durationMs = triggerTime ? Math.max(0, Date.now() - triggerTime) : 0;
        delete updatedTriggerTimestamps[colIdx];

        emitTelemetry({
          session_id: sessionId,
          student_id: studentId,
          exercise_id: taskId,
          event_type: 'REGROUPING_TRIGGERED',
          column_index: colIdx,
          details: { regrouping_type: 'decomposition' },
        }).catch(console.error);

        emitTelemetry({
          session_id: sessionId,
          student_id: studentId,
          exercise_id: taskId,
          event_type: 'REGROUPING_SUCCESS',
          column_index: colIdx,
          details: { regrouping_type: 'decomposition', duration_ms: durationMs },
        }).catch(console.error);

        if (studentId) {
          useStore.getState().logSemanticEvent(studentId, {
            action: 'block_split',
            element: `${place}_block`,
            target: `${res.event.to}_column`,
            context: `Split 1 ${place} block into 10 ${res.event.to} blocks`,
            ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
            state_snapshot: `Units: ${res.counts.units}, Tens: ${res.counts.tens}, Hundreds: ${res.counts.hundreds}, Thousands: ${res.counts.thousands}`
          });
        }

        enterRegroupingActive();
        // מסמך 03 §3.5: the block breaks apart and travels right. View only.
        announceRegroup({ kind: 'split', from: place, to: res.event.to, toCount: res.counts[res.event.to] });

        return {
          counts: res.counts,
          undoStack,
          regroupTriggerTimestamps: updatedTriggerTimestamps,
          hasInteracted: true,
          hasUngrouped: true,
          // The decomposition feeds the column to the right (a ten into the units).
          conversionsByColumn: withColumnConversion(state.conversionsByColumn, 'decomposed', res.event.to),
          keyboardState: state.keyboardState === 'LOCKED' ? ('UNLOCKED' as KeyboardState) : state.keyboardState,
        };
      });
    },

    groupColumnClick: (place) => {
      set((state) => {
        if (state.isBoardLocked) return state;
        const res = groupBlocksManually(state.counts, place);
        if (!res) {
          flagConstraintError(place);
          return state;
        }
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'REGROUPING_SUCCESS', undefined, state.conversionsByColumn, placeToColumnIndex(place));

        const studentId = currentStudentUid();
        const task = getActiveTasks(state)[state.standardTaskIdx] || null;
        const sessionId = `session_${state.sessionNumber}_student_${studentId}`;
        const taskId = activeExerciseId(state);
        const colIdx = placeToColumnIndex(place);

        const updatedTriggerTimestamps = { ...state.regroupTriggerTimestamps };
        const triggerTime = state.regroupTriggerTimestamps?.[colIdx];
        const durationMs = triggerTime ? Math.max(0, Date.now() - triggerTime) : 0;
        delete updatedTriggerTimestamps[colIdx];

        emitTelemetry({
          session_id: sessionId,
          student_id: studentId,
          exercise_id: taskId,
          event_type: 'REGROUPING_TRIGGERED',
          column_index: colIdx,
          details: { regrouping_type: 'composition' },
        }).catch(console.error);

        emitTelemetry({
          session_id: sessionId,
          student_id: studentId,
          exercise_id: taskId,
          event_type: 'REGROUPING_SUCCESS',
          column_index: colIdx,
          details: { regrouping_type: 'composition', duration_ms: durationMs },
        }).catch(console.error);

        if (studentId) {
          useStore.getState().logSemanticEvent(studentId, {
            action: 'blocks_grouped',
            element: `${place}_column`,
            target: `${res.event.to}_column`,
            context: `Grouped 10 ${place} blocks into 1 ${res.event.to} block`,
            ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
            state_snapshot: `Units: ${res.counts.units}, Tens: ${res.counts.tens}, Hundreds: ${res.counts.hundreds}, Thousands: ${res.counts.thousands}`
          });
        }

        enterRegroupingActive();
        // מסמך 03 §3.4: ten blocks merge into one and travel left. View only.
        announceRegroup({ kind: 'group', from: place, to: res.event.to, toCount: res.counts[res.event.to] });

        return {
          counts: res.counts,
          undoStack,
          regroupTriggerTimestamps: updatedTriggerTimestamps,
          hasInteracted: true,
          hasGrouped: true,
          // The grouping converts the column it was pressed on (ten units into a ten).
          conversionsByColumn: withColumnConversion(state.conversionsByColumn, 'composed', res.event.from),
          keyboardState: state.keyboardState === 'LOCKED' ? ('UNLOCKED' as KeyboardState) : state.keyboardState,
        };
      });
    },

    undo: () => {
      set((s) => {
        if (s.isBoardLocked) return s;
        // Only inside an exercise in progress (1.10.2026). On the reflection
        // board, and in the moments after the last exercise, the undo stack
        // still held that exercise's actions: Ctrl+Z rolled its digits back,
        // sent UNDO_EXECUTED (U, measure 2ב) and, three times, opened a card
        // nobody could see.
        if (s.flowStatus !== 'task' || s.awaitingNext) return s;
        const stack = [...s.undoStack];
        const snapshot = stack.pop();
        if (!snapshot) return s;

        const studentId = currentStudentUid();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = activeExerciseId(s);
        const depthBefore = Math.min(10, Math.max(1, s.undoStack.length));
        const revertedType: TelemetryEventType = snapshot.actionType || 'BLOCK_DRAG_COMPLETE';

        emitTelemetry({
          session_id: sessionId,
          student_id: studentId,
          exercise_id: taskId,
          event_type: 'UNDO_EXECUTED',
          // PRD Module 5 §ג: carried only when the undone action was confined to a column.
          ...(typeof snapshot.columnIndex === 'number' ? { column_index: snapshot.columnIndex } : {}),
          details: {
            undo_stack_depth_before: depthBefore,
            reverted_event_type: revertedType,
          },
        }).catch(console.error);

        const nextConsecutiveUndos = (s.consecutiveUndoCount || 0) + 1;

        // Module 12(c): 3 consecutive UNDO_EXECUTED actions within a single exercise trigger Socratic coach, ONLY in Session 8
        if (nextConsecutiveUndos >= 3 && s.sessionNumber === 8) {
          // Through openSocraticCard, like every other trigger: it keeps a card
          // already on the screen (or under its hourglass) the one card (X22),
          // honours a running lockout, and releases a lockout that ended while
          // the card was closed. This path read the lock flag itself, so after
          // a child closed the card during its lockout three undos never opened
          // it again until a reload. The card is about the column of the
          // action just undone (the undo takes the focus off the box); the
          // run starts again from 0 once the card opens.
          const undoneColumn = typeof snapshot.columnIndex === 'number' ? PLACE_ORDER[snapshot.columnIndex] : undefined;
          setTimeout(() => get().openSocraticCard('consecutive_undos_3', undoneColumn), 0);
        }

        // Module 11: Undo does NOT trigger any penalty (no scoring penalty, no timeout lockout, no PASSIVE_DRIFTING)
        if (studentId) {
          useStore.getState().logSemanticEvent(studentId, {
            action: 'undo',
            element: 'undo_button',
            context: 'User clicked undo',
            ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
            state_snapshot: `Units: ${snapshot.counts.units}, Tens: ${snapshot.counts.tens}, Hundreds: ${snapshot.counts.hundreds}, Thousands: ${snapshot.counts.thousands}`
          });
        }
        
        return {
          counts: snapshot.counts,
          // PRD Module 11 §א: the snapshot restores the input too. A frame saved
          // before this existed carries no input, and leaves it untouched.
          ...(snapshot.answerDigits ? { answerDigits: { ...snapshot.answerDigits } } : {}),
          ...(snapshot.carryDigits ? { carryDigits: { ...snapshot.carryDigits } } : {}),
          ...(snapshot.operandDigits
            ? { operandDigits: { a: { ...snapshot.operandDigits.a }, b: { ...snapshot.operandDigits.b } } }
            : {}),
          // Undoing a grouping or decomposition takes its column's conversion
          // back: the column locks again until the blocks redo it (Module 9 §א).
          ...(snapshot.conversionsByColumn
            ? { conversionsByColumn: normalizeColumnConversions(snapshot.conversionsByColumn) }
            : {}),
          // The take-away record goes back with the board (UndoFrame.takeAwayTrack):
          // undoing the building of the first number is not taking away. Always a
          // new value, so the board subscription leaves it as written.
          takeAwayTrack: snapshot.takeAwayTrack ? { ...snapshot.takeAwayTrack } : null,
          heldFromTrack: snapshot.heldFromTrack ? { ...snapshot.heldFromTrack } : null,
          undoStack: stack,
          undoCount: s.undoCount + 1,
          consecutiveUndoCount: nextConsecutiveUndos,
          undoTimestamps: [],
          keyboardState: stateReducer(s.keyboardState, { type: 'UNDO_CLICK' })
        };
      });
    },

    // Station 1: the board stays open (owner, 27.9.2026 — core/boardVisibility.ts).
    toggleBoard: () => set((s) => ({ boardOpen: boardStaysOpen(s.sessionNumber) ? true : !s.boardOpen })),
    setFocusedPlace: (place) => set({ focusedPlace: place }),

    selectChoice: (id) => {
      set({ selectedChoiceId: id, hasInteracted: true });
      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const s = get();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'choice_selected',
          element: 'multiple_choice_option',
          context: `Selected option: ${id}`,
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Board Value: ${selectBoardValue(s)}`
        });
      }
    },

    setAnswerDigit: (place, val) => {
      set((s) => {
        const isDelete = val === '' && Boolean(s.answerDigits[place]);

        const studentId = currentStudentUid();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = activeExerciseId(s);
        const colIdx = placeToColumnIndex(place);

        if (val !== '') {
          const numVal = parseInt(val, 10);
          if (!isNaN(numVal) && numVal >= 0 && numVal <= 9) {
            const expectedDigit = expectedDigitInActiveTask(s, place, false);
            const isCorrect = expectedDigit !== null ? numVal === expectedDigit : null;
            emitTelemetry({
              session_id: sessionId,
              student_id: studentId,
              exercise_id: taskId,
              event_type: 'DIGIT_ENTERED',
              column_index: colIdx,
              details: {
                digit_value: numVal,
                is_correct: isCorrect,
              },
            }).catch(console.error);

            // מסמך 03, trigger 3: a required conversion the learner did not perform.
            // Wrong digit, in a column the algorithm cannot finish without a carry
            // or a decomposition, before THAT column's conversion was done
            // (מסמכים 01–04: "בטור המצריך המרה לפני שההמרה בוצעה בלבנים").
            // It used to ask whether any conversion was made in the exercise, so
            // after one grouping the card never opened in another carry column.
            // The card is about the column just typed in: the cursor has
            // already moved to the next box (VerticalAdditionTask), so the
            // focused box would name the wrong column.
            // A wrong digit that is the right digit of ANOTHER column of the
            // answer (82 written from the left: the 8 in the units box) is a
            // digit in the wrong place, not a conversion left undone — the
            // place cues of the next "התקדם" answer it (core/placeCues.ts).
            // When this keystroke is also the column's fourth error in a row,
            // the PRD trigger "four errors" opens the card, and the trigger
            // recorded is its own (coordinator's decision, 2.10.2026): one
            // card per keystroke. The conversion card used to open first and
            // the streak's card was then refused as "a card is open".
            const streak = nextDigitErrorStreak(s, place, isCorrect);
            let conversionMissed = false;
            if (isCorrect === false && task && isVerticalTask(task)) {
              const { a, b, target } = effectiveArithmetic(task, s.isASD);
              conversionMissed =
                columnRequiresConversion(place, a, b, task.isSubtraction) &&
                !conversionRecordedInColumn(s, place, task.isSubtraction) &&
                !isPlaceError({ [place]: val }, target, { a, b, isSubtraction: task.isSubtraction });
            }
            if (conversionMissed && streak.digitErrorStreak < 4) {
              setTimeout(() => get().openSocraticCard('conversion_not_performed', place), 0);
            }

            if (streak.digitErrorStreak >= 4) openCardForDigitErrorStreak(place, conversionMissed);

            return {
              answerDigits: { ...s.answerDigits, [place]: val },
              hasInteracted: true,
              // Typing is an action the learner can take back (Module 11 §א).
              undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_ENTERED', inputSnapshot(s), undefined, colIdx),
              // "שלוש פעולות ביטול רצופות" means consecutive: any other action ends the run.
              consecutiveUndoCount: 0,
              ...streak,
              hasDigitErrorInTask: isCorrect === false ? true : s.hasDigitErrorInTask,
              typedErrorCount: isCorrect === false ? s.typedErrorCount + 1 : s.typedErrorCount,
            };
          }
        } else if (isDelete) {
          const deletedVal = s.answerDigits[place] ? parseInt(s.answerDigits[place], 10) : null;
          emitTelemetry({
            session_id: sessionId,
            student_id: studentId,
            exercise_id: taskId,
            event_type: 'DIGIT_DELETED',
            column_index: colIdx,
            details: {
              deleted_digit_value: isNaN(deletedVal as number) ? null : deletedVal,
            },
          }).catch(console.error);

          // "ארבע מחיקות או הקלדות שגויות רצופות באותו טור" (מסמך 03): the
          // deletion counts in its column, unless it erases a wrong digit.
          const expectedDigit = expectedDigitInActiveTask(s, place, false);
          const deletedWasCorrect =
            expectedDigit !== null && deletedVal !== null && !isNaN(deletedVal) ? deletedVal === expectedDigit : null;
          const streak = nextDigitErrorStreakOnDelete(s, place, deletedWasCorrect);
          if (streak.digitErrorStreak >= 4) openCardForDigitErrorStreak(place);
          return {
            answerDigits: { ...s.answerDigits, [place]: val },
            hasInteracted: true,
            // A deletion is an action of its own (Module 11 §א): undo brings the
            // digit back. Without a frame, undo took back the typing before it
            // instead — the deleted digit never returned.
            undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_DELETED', inputSnapshot(s), undefined, colIdx),
            consecutiveUndoCount: 0,
            ...streak,
          };
        }

        return {
          answerDigits: { ...s.answerDigits, [place]: val },
          hasInteracted: true,
        };
      });
      
      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const s = get();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'input_changed',
          element: `answer_digit_${place}`,
          context: val ? `Typed ${val} in ${place}` : `Cleared ${place}`,
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Current digits: ${JSON.stringify(s.answerDigits)}, Board Value: ${selectBoardValue(s)}`
        });
      }
    },

    setCarryDigit: (place, val) => {
      set((s) => {
        const isDelete = val === '' && Boolean(s.carryDigits[place]);
        const studentId = currentStudentUid();
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = activeExerciseId(s);
        const colIdx = placeToColumnIndex(place);

        if (val !== '') {
          const numVal = parseInt(val, 10);
          // A circle takes two digits (the 13 above the units after a break).
          // The second keystroke used to be stored with no event and no undo
          // frame, so a 12 in an addition circle was recorded as the right
          // carry 1 (1.10.2026). Each keystroke is recorded: digit_value is the
          // digit typed (0–9), is_correct judges what the circle now holds.
          if (!isNaN(numVal) && /^[0-9]{1,2}$/.test(val)) {
            const typedDigit = parseInt(val.slice(-1), 10);
            const expectedCarry = expectedDigitInActiveTask(s, place, true);
            const isCorrect = expectedCarry !== null ? numVal === expectedCarry && val.length === 1 : null;
            emitTelemetry({
              session_id: sessionId,
              student_id: studentId,
              exercise_id: taskId,
              event_type: 'DIGIT_ENTERED',
              column_index: colIdx,
              details: {
                digit_value: typedDigit,
                is_correct: isCorrect,
                // PRD Module 21: the decision table shows "הזנה בעיגולי זיכרון" —
                // without this a circle's digit read like a result-row digit.
                input_target: 'carry_circle',
              },
            }).catch(console.error);

            return {
              carryDigits: { ...s.carryDigits, [place]: val },
              hasInteracted: true,
              undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_ENTERED', inputSnapshot(s), undefined, colIdx),
              consecutiveUndoCount: 0,
              hasDigitErrorInTask: isCorrect === false ? true : s.hasDigitErrorInTask,
              typedErrorCount: isCorrect === false ? s.typedErrorCount + 1 : s.typedErrorCount,
            };
          }
        } else if (isDelete) {
          const deletedVal = s.carryDigits[place] ? parseInt(s.carryDigits[place], 10) : null;
          emitTelemetry({
            session_id: sessionId,
            student_id: studentId,
            exercise_id: taskId,
            event_type: 'DIGIT_DELETED',
            column_index: colIdx,
            details: {
              deleted_digit_value: isNaN(deletedVal as number) ? null : deletedVal,
              input_target: 'carry_circle',
            },
          }).catch(console.error);
          // A deletion is an action undo can take back (Module 11 §א), as in the result row.
          return {
            carryDigits: { ...s.carryDigits, [place]: val },
            hasInteracted: true,
            undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_DELETED', inputSnapshot(s), undefined, colIdx),
            consecutiveUndoCount: 0,
          };
        }

        return { carryDigits: { ...s.carryDigits, [place]: val }, hasInteracted: true };
      });
    },

    setProbeAnswer: (v) => {
      set({ probeAnswer: v, hasInteracted: true });

      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const s = get();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'input_changed',
          element: `probe_input`,
          context: v ? `Typed answer ${v}` : `Cleared answer`,
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Probe answer: ${v}, Board Value: ${selectBoardValue(s)}`
        });
      }
    },

    /** Q3 "הוסף ייצוג" (vanilla addQ3Representation, app.js 747–810). */
    addRepresentation: () => {
      const s = get();
      const value = selectBoardValue(s);

      let target: number | undefined;
      // Measure 3: a refused representation in a lesson exercise is a failed board check.
      let lessonTaskId: string | null = null;
      // Owner, 1.10.2026 (D6): station 3's "another way" exercises — a wrong
      // press of "הוספת ייצוג" counts as a wrong press there only.
      let wrongAddPressCounts = false;
      // Owner, 4.10.2026: 320, 2,100 and 4,200 are built without unit blocks.
      let noUnitBlocks = false;
      if (s.sessionNumber === 2) {
        const task = getCurrentQTask(s.qflow);
        target = task ? getEffectiveNumber(task, s.qflow, s.isASD) : undefined;
      } else {
        const task = getActiveTasks(s)[s.standardTaskIdx];
        target = task?.numberA;
        lessonTaskId = isRepresentationTask(task) ? task.id : null;
        wrongAddPressCounts = lessonTaskId !== null && s.sessionNumber === 3;
        noUnitBlocks = task?.noUnitBlocks === true;
        if (task?.requireEvenTens && s.counts.tens % 2 !== 0) {
          if (lessonTaskId) {
            recordBoardCheckFailure(lessonTaskId);
            if (wrongAddPressCounts) noteWrongPress(lessonTaskId);
          }
          showFeedback({ correct: false, title: 'בִּדְקוּ אֶת הָעֲשָׂרוֹת 🤔', sub: 'בדרך הזאת מספר העשרות צריך להיות זוגי. פרטו עשרת אחת לעשר יחידות, או קבצו 10 יחידות לעשרת אחת.' }, 3200);
          return;
        }
      }

      // Owner, 1.10.2026 (D6): in station 3's "another way" exercises a wrong
      // press of "הוספת ייצוג" is a wrong press like a wrong "התקדם" — the
      // second one in a row opens the coaching card (noteWrongPress). It used
      // to count for nothing, and those exercises got a card only after a pause.
      if (target !== undefined && value !== target) {
        if (lessonTaskId) {
          recordBoardCheckFailure(lessonTaskId);
          if (wrongAddPressCounts) noteWrongPress(lessonTaskId);
        }
        const hint =
          s.sessionNumber === 2
            ? 'הלבנים בבית המספרים עוד לא מראות את המספר שבהנחיה. מה תוכלו לשנות?'
            : 'הלבנים בבית המספרים עוד לא מראות את המספר שבהנחיה. נסו שוב!';
        showFeedback({ correct: false, title: 'דַּיְּקוּ אֶת הַמִּבְנֶה 🔍', sub: hint }, 3200);
        return;
      }

      // Owner, 4.10.2026: "… מאות ועשרות בלבד" (320, 2,100, 4,200) — a way
      // with blocks in the units column is refused. The board shows the
      // number here, so the units are 10, 20, 30…, and the column's "קבצו 10
      // לעשרת" button is in view: the toast says the rule, then the action.
      // The same toast, duration and counting as the even-tens refusal above;
      // 150 (s7_r_t7) carries no such rule — each of its ways has unit blocks.
      if (noUnitBlocks && s.counts.units > 0) {
        if (lessonTaskId) {
          recordBoardCheckFailure(lessonTaskId);
          if (wrongAddPressCounts) noteWrongPress(lessonTaskId);
        }
        showFeedback({ correct: false, title: NO_UNIT_BLOCKS_TITLE_HE, sub: NO_UNIT_BLOCKS_SUB_HE }, 3200);
        return;
      }

      // The second representation has to be a different one. With the board
      // kept between the two (below), pressing the button twice must not count.
      if (s.q3Reps.length === 1 && countsEqual(s.counts, s.q3Reps[0])) {
        if (lessonTaskId) {
          recordBoardCheckFailure(lessonTaskId);
          if (wrongAddPressCounts) noteWrongPress(lessonTaskId);
        }
        showFeedback({ correct: false, title: 'זוֹ אוֹתָהּ דֶּרֶךְ 🤔', sub: 'הַרְאוּ אֶת אוֹתוֹ מִסְפָּר בְּדֶרֶךְ שׁוֹנָה: פִּרְטוּ אוֹ קַבְּצוּ, וְאָז לַחֲצוּ עַל "הוֹסָפַת יִצּוּג".' }, 3200);
        return;
      }

      const q3Reps = [...s.q3Reps, { ...s.counts }];
      // A press that records a way breaks the run of wrong presses ("in a row").
      set({ q3Reps, hasInteracted: true, ...(wrongAddPressCounts && lessonTaskId ? { wrongAnswerStreak: 0, wrongAnswerTaskId: lessonTaskId } : {}) });
      // The board used to be wiped here, and the undo stack with it. Three
      // exercises tell the child: "build 12 tens and 5 units, press add, THEN
      // regroup 10 tens into a hundred and add the second representation".
      // The child pressed the button and had nothing left to regroup — and
      // the instruction's promise that undo is available was false at that
      // exact moment (PRD Module 11 keeps the last 10 actions). The blocks
      // stay; the child transforms them.
    },

    restoreScaffolds: () => {
      set({ scaffoldFadeLevel: 0 });
    },

    demoUngroup: () => {
      const s = get();
      const result = resolveDrop(s.counts, { source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } }, selectScaffoldLevel(s));
      if (result.ok) {
        // A decomposition is named by the column of the ten that broke apart (Module 8 §א).
        const undoStack = createNextUndoStack(s.undoStack, s.counts, 'REGROUPING_SUCCESS', undefined, undefined, placeToColumnIndex('tens'));
        enterRegroupingActive();
        set({ counts: result.counts, undoStack, hasInteracted: true, hasUngrouped: true });
        if (result.ungroupEvent) {
          announceRegroup({ kind: 'split', from: result.ungroupEvent.from, to: result.ungroupEvent.to, toCount: result.counts[result.ungroupEvent.to] });
        }
      }
    },

    finishMeetingEarly,
    finishReflection: () => {
      const s = get();
      if (s.sessionNumber !== 8 || s.flowStatus !== 'reflection') return;
      // Meeting 8 is finished when its reflection is submitted (catch-up, 2.10.2026).
      markMeetingFinished(currentStudentUid(), 8, s.isSupersededByOtherDevice);
      set({ flowStatus: 'sessionDone', awaitingNext: false });
    },
    setReflectionStep: (step) => {
      const s = get();
      // Stages 2 and 3 come after a level was chosen (the button is disabled before).
      if (step !== 1 && !s.reflectionDraft.effortLevel) return;
      if (s.reflectionDraft.step === step) return;
      set({ reflectionDraft: { ...s.reflectionDraft, step } });
      // Module 16 §ב: "השרת מנהל: reflection_step (1, 2 או 3)" — every stage
      // change, back included, reaches the learner record. reflection_completed
      // is left alone: only "סיום התחנה" finishes the board.
      if (s.sessionNumber === 8 && s.flowStatus === 'reflection') mirrorReflectionStep(currentStudentUid(), step);
    },
    setReflectionEffort: (level) => {
      const s = get();
      set({ reflectionDraft: { ...s.reflectionDraft, effortLevel: level } });
    },
    toggleReflectionStrategy: (id) => {
      const s = get();
      const prev = s.reflectionDraft.strategies;
      const strategies = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      set({ reflectionDraft: { ...s.reflectionDraft, strategies } });
    },
    proceed: () => {
      const s = get();
      if (s.awaitingNext || s.flowStatus !== 'task' || !selectCanProceed(s)) return;
      if (s.sessionNumber === 2) proceedQ();
      else proceedStandard();
    },

    /**
     * PRD Module 13 and the owner's decision (28.9.2026; X19, X22): "עד
     * שהבינה עונה (לכל היותר 8 שניות) יופיע בכרטיס שעון חול, ואחר כך יופיע
     * כרטיס אחד שלא מתחלף. יישמר סוג הטעות שהבינה זיהתה, או 'ריק' אם הוצג
     * כרטיס קבוע."
     *
     * The card opens pending (an hourglass). It settles once: with the
     * engine's card if it answered within SOCRATIC_PROXY_TIMEOUT_MS, or with
     * the static card at once on a timeout, a failure or no network. A reply
     * after that is ignored. The static card carries error_category null: the
     * classification is the engine's (register: "the static card carried a
     * fixed error_category"). SOCRATIC_CARD_SHOWN is emitted by the panel
     * when the settled card appears, once.
     */
    fetchSocraticHint: async () => {
      const s = get();
      const currentTask = getActiveTasks(s)[s.standardTaskIdx];
      const targetNode = currentTask?.targetNode || 'q_matrix_general';

      cancelSocraticRequest();
      const request = socraticRequestSeq;
      // The place cues and the cards already shown in this exercise choose
      // between the levels of a card (owner, 30.9.2026: C5 before the
      // column's own card; C4 once after the cues).
      const cardContext = staticCardContextFor(s, currentTask?.id, currentTask);
      const staticCard: SocraticHintResponse = {
        ...SocraticEngine.getSynchronousTaskHint(currentTask, s.counts, cardContext),
        error_category: null,
      };
      set({ aiSocraticHint: null, socraticPending: true });
      // What the card was asked about: the board and every digit typed.
      const openedOn = cardStateSignature(s);

      const settle = (hint: SocraticHintResponse) => {
        if (request !== socraticRequestSeq) return; // cancelled, superseded or already settled
        cancelSocraticRequest();
        const now = get();
        const stillTheSameCard = now.helpState === 'socratic' && selectStandardTask(now)?.id === currentTask?.id;
        if (!stillTheSameCard) {
          set({ socraticPending: false });
          return;
        }
        const nowTask = selectStandardTask(now);
        // The child answered while the hourglass turned: no card, no event.
        if (exerciseSolvedForCard(now, nowTask)) {
          get().closeHelp();
          return;
        }
        // The child kept working under the hourglass (up to 8 seconds): a card
        // built on the board and digits of its opening could speak of blocks
        // that are gone. It is built again from what is on the screen now — the
        // static card of the exercise as it stands (1.10.2026).
        let shown = hint;
        let kind = staticCard.cardKind;
        let rebuilt = false;
        if (cardStateSignature(now) !== openedOn) {
          shown = {
            ...SocraticEngine.getSynchronousTaskHint(nowTask ?? undefined, now.counts, staticCardContextFor(now, nowTask?.id, nowTask)),
            error_category: null,
          };
          kind = shown.cardKind;
          rebuilt = true;
        }
        // A card of 30.9.2026 counts as shown also when the engine's card,
        // anchored on it, is the one on the screen.
        set((st) => {
          const cards = st.socraticCardHistory.cards;
          const last = cards[cards.length - 1];
          return {
            aiSocraticHint: shown,
            socraticPending: false,
            ...(kind && currentTask?.id ? { socraticCardKinds: withCardKind(st.socraticCardKinds, currentTask.id, kind) } : {}),
            ...(last
              ? {
                  socraticCardHistory: {
                    ...st.socraticCardHistory,
                    cards: [...cards.slice(0, -1), {
                      ...last,
                      shown: true,
                      questionHe: shown.questionHe ?? null,
                      // A card rebuilt under the hourglass is recorded as the card shown (final review, 2.10.2026).
                      ...(rebuilt ? { kind: shown.cardKind ?? null, family: cardFamilyOf(shown), staticQuestionHe: shown.questionHe } : {}),
                    }],
                  },
                }
              : {}),
          };
        });
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        settle(staticCard);
        return;
      }
      socraticDeadline = setTimeout(() => settle(staticCard), SOCRATIC_PROXY_TIMEOUT_MS);

      try {
        const traceData = {
          undo_clicks: s.undoCount,
          hesitation_events: s.hesitationCount,
        };

        const recentActions = [
          s.hesitationCount > 0 ? `השתהות ${s.hesitationTimerSeconds}s` : null,
          s.undoCount > 0 ? `לחיצות ביטול: ${s.undoCount}` : null,
          s.consecutiveErrorCount > 0 ? `שגיאות רצופות: ${s.consecutiveErrorCount}` : null,
        ].filter(Boolean) as string[];
        
        // PRD Module 13, pillar 3: the engine gets what the platform MONITORED —
        // the trigger, the streaks, the memory circles and the typed digits —
        // not a prose summary of them. Operands are ASD-effective so "completed
        // columns" is judged against the exercise actually on screen.
        const hasOperands = currentTask && typeof currentTask.numberA === 'number' && typeof currentTask.numberB === 'number';
        const eff = hasOperands ? effectiveArithmetic(currentTask, s.isASD) : null;
        const authUid = useAuthStore.getState().user?.uid;
        const monitoring: SocraticMonitoringSnapshot = {
          studentId: authUid ? normalizeStudentId(authUid) : undefined,
          sessionNumber: s.sessionNumber,
          triggerReason: s.socraticTriggerReason ?? null,
          consecutiveErrors: s.consecutiveErrorCount || 0,
          consecutiveUndos: s.consecutiveUndoCount || 0,
          hesitationSeconds: s.hesitationTimerSeconds || 0,
          memoryCircles: s.carryDigits,
          answerDigits: s.answerDigits,
          operands: eff ? { a: eff.a, b: eff.b, isSubtraction: Boolean(currentTask?.isSubtraction) } : null,
          activeColumnIndex: socraticCardColumnIndex(s),
          hasRegroupedInCanvas: Boolean(s.hasUngrouped || s.hasGrouped),
          // Per column, not exercise-wide (1.10.2026): a column whose conversion
          // is done is not coached to convert again.
          conversionsDone: eff
            ? PLACE_ORDER.filter((p) => columnRequiresConversion(p, eff.a, eff.b, currentTask?.isSubtraction) &&
                conversionRecordedInColumn(s, p, currentTask?.isSubtraction))
            : undefined,
          // Phase 2 (1.10.2026): shorter, more concrete cards for the enhanced profile and the quiet mode.
          learnerProfile: { enhanced: s.activeSupportProfileId === 'enhanced_cognitive_support', quiet: s.isASD === true },
          cardContext,
        };

        const hint = await SocraticEngine.getSocraticHint(
          currentTask || {},
          targetNode,
          s.counts,
          traceData,
          false,
          monitoring.activeColumnIndex ?? 0,
          recentActions,
          monitoring
        );
        
        // The engine's own fallback is the same static card with a null
        // error_category; a card with a category is the engine's verdict.
        settle(hint && hint.error_category ? hint : staticCard);
      } catch (error) {
        console.error("LLM Socratic Hint failed. Falling back to static hints.", error);
        settle(staticCard);
      }
    },

    /** PRD Module 12: after a mistake, a 300ms "let's think" beat, then the Socratic card. */
    requestSilentHelp: () => {
      const s = get();
      // Learners are the ids 1–12 only (Zero-PII). A staff account looking at
      // the learner's screen has no learner record: the id used to be built
      // from the account's own uid, and the call was written to
      // users/students/student_<staff uid>.
      const studentId = currentStudentUid();
      if (!studentId || s.isSupersededByOtherDevice) return;

      // PRD 7.3 (useWorkspaceStore: "מיתוג דו-כיווני לקריאת עזרה") and מסמך 03
      // §3.1 ("בלחיצה הפיכה (ניתנת לביטול בכל עת)"): a second press takes the
      // call back.
      if (s.hasRequestedBasicHelp) {
        AuditLogger.log('HELP_REQUESTED', studentId, 'Student took back the silent help call');
        throttledRtdbUpdate(`users/students/${studentId}`, {
          helpRequested: false,
          // A call from the chat used to also raise these; the radar reads
          // them as a help call too, so the take-back clears them as well.
          handRaised: false,
          isStruggling: false,
          lastAction: 'ביטל את הקריאה למורה',
        }).catch(console.error);
        set({ hasRequestedBasicHelp: false });
        // Owner, 30.9.2026: the take-back is research data. The call itself
        // still counts as help in measure 2א — the teacher may already have come.
        emitScaffoldEvent(get(), 'HELP_WITHDRAWN', { help_count: s.helpRequestCount || 0 });
        showSideFeedback({ correct: true, neutral: true, title: 'הקריאה בוטלה', sub: 'אפשר ללחוץ שוב בכל עת.' }, 2000);
        return;
      }

      AuditLogger.log('HELP_REQUESTED', studentId, 'Student pressed the silent help button');

      // PRD Module 18: helpRequested is the BLUE radar signal, the highest
      // priority in the cell-colour hierarchy.
      throttledRtdbUpdate(`users/students/${studentId}`, {
        helpRequested: true,
        lastHelpTimestamp: Date.now(),
        lastAction: 'ביקש עזרה מהמורה',
      }).catch(console.error);
      throttledRtdbUpdate(`users/students/${studentId}/helpHistory/help_${Date.now()}`, {
        timestamp: Date.now(),
        sessionNumber: s.sessionNumber || 1,
        type: 'SILENT_HELP',
        status: 'pending',
      }).catch(console.error);

      const helpCount = (s.helpRequestCount || 0) + 1;
      set({ hasRequestedBasicHelp: true, helpRequestCount: helpCount });
      emitScaffoldEvent(get(), 'HELP_REQUESTED', { help_count: helpCount });
      // A calm, brief acknowledgement so the learner knows the signal was sent.
      // מסמך 03 §3.1: the signal is silent, "ללא צליל או תשומת לב חברתית" — a
      // neutral acknowledgement, not a success (no confetti).
      // The same toast tells the learner how to take the call back — the button's
      // colour alone does not say it, and its tooltip needs a hover.
      // The teacher in the teacher's own gender (core/teacherGender.ts).
      const title = teacherSentenceHe('helpCallReceived', useTeacherGenderStore.getState().gender);
      showSideFeedback({ correct: true, neutral: true, title, sub: 'הסימן נשלח בשקט. אפשר להמשיך לעבוד. לחיצה נוספת על הכפתור מבטלת את הקריאה.' }, 4000);
    },

    helpFrictionDone: () => {
      if (get().helpState !== 'friction') return;
      get().openSocraticCard('repeated_errors');
      // A card refused after the beat (it was decided before it, but 300 ms
      // can change the exercise) ends through closeHelp, like every other
      // closing: setting helpState alone left the machine in SOCRATIC_ACTIVE
      // with no card, and every later trigger of the exercise was refused.
      if (get().helpState !== 'socratic') get().closeHelp();
    },

    closeHelp: () => {
      // A card closed during the hourglass gets no card and no event later.
      cancelSocraticRequest();
      set((s) => ({
        socraticPending: false,
        helpState: 'closed',
        frictionTriggerSource: null,
        // A card closed without a correct answer hands the keyboard back to
        // the Module 9 lock it came from; SOCRATIC_ONLY with no card open is a
        // dead end (vraMachine leaves it only on SOCRATIC_SUCCESS). A correct
        // answer already unlocked the keyboard before this runs.
        ...(s.keyboardState === 'SOCRATIC_ONLY' ? { keyboardState: 'LOCKED' as KeyboardState } : {}),
      }));
      if (get().currentState === 'SOCRATIC_ACTIVE') {
        get().transitionTo('PROBLEM_ACTIVE');
      }
    },
    showFeedback,
    unlockKeyboard: () => set({ keyboardState: 'UNLOCKED' }),
    lockKeyboard: () => set({ keyboardState: 'LOCKED' }),
    openAdditionHelper: (source = 'hesitation_30s') => {
      if (get().isAdditionHelperOpen) return;
      set({ isAdditionHelperOpen: true, additionHelperOffered: true, additionHelperOfferedUnopened: false });
      emitScaffoldEvent(get(), 'ADAPTIVE_GRID_TOGGLED', { action: 'opened', source });
    },
    offerAdditionHelper: () => {
      const s = get();
      if (s.isAdditionHelperOpen || s.additionHelperOffered) return;
      set({ additionHelperOffered: true, additionHelperOfferedUnopened: true });
    },
    closeAdditionHelper: () => {
      if (!get().isAdditionHelperOpen) return;
      set({ isAdditionHelperOpen: false });
      emitScaffoldEvent(get(), 'ADAPTIVE_GRID_TOGGLED', { action: 'closed', source: 'learner' });
    },
    recordBlockedKeystroke: (place) => {
      const s = get();
      const task = getActiveTasks(s)[s.standardTaskIdx] || null;
      // A representation exercise names its own conversion (REPRESENTATION_LOCKS);
      // it has no isSubtraction to derive it from.
      const reprLock = task?.type === 'representation' ? REPRESENTATION_LOCKS[task.id] : undefined;
      emitScaffoldEvent(
        s,
        'KEYBOARD_LOCK_BLOCKED',
        { conversion_required: reprLock ? reprLock.conversion : task?.isSubtraction ? 'decomposition' : 'composition' },
        placeToColumnIndex(place)
      );
    },
    toggleAdditionHelper: () => set((s) => ({ isAdditionHelperOpen: !s.isAdditionHelperOpen })),
    setKeyboardSocratic: () => {
      get().openSocraticCard('hesitation_45s');
    },

    openSocraticCard: (reason, place) => {
      const s = get();
      // PRD Module 12 & 14: the card is disabled outright in session 2, and never
      // reopens over an open card or during the wrong-answer lockout — the
      // whole rule is socraticCardRefusal. An open card is helpState
      // 'socratic'; a SOCRATIC_ACTIVE left behind with no card no longer
      // blocks every later trigger.
      if (socraticCardRefusal(s, reason, place) !== null) return;
      const task = selectStandardTask(s);
      const taskId = task?.id ?? null;
      // The column of the card, for every trigger (cardFocusPlace).
      const cardPlace = place ?? cardFocusPlace(s, task, reason, useBoardFocusStore.getState().focusedMemoryCircle);
      // The card's identity (SocraticCardRecord): the static card for the
      // trigger, the column, the exercise and the board as they are now — its
      // situation family, and which level of it.
      const staticNow = SocraticEngine.getSynchronousTaskHint(task ?? undefined, s.counts, staticCardContextFor(s, task?.id, task, { reason, place: cardPlace }));
      const history = s.socraticCardHistory.taskId === taskId ? s.socraticCardHistory.cards : [];
      const previous = [...history].reverse().find((c) => c.shown);
      const record: SocraticCardRecord = {
        reason,
        place: cardPlace,
        kind: staticNow.cardKind ?? null,
        family: cardFamilyOf(staticNow),
        staticQuestionHe: staticNow.questionHe,
        questionHe: null,
        shown: false,
        answeredCorrect: null,
        openedAt: Date.now(),
      };
      // No card text yet: the card shows an hourglass until the engine answers
      // or its time runs out, then one card that does not change (X22). The
      // static card used to show first and be replaced mid-answer.
      set((st) => ({
        // Module 12: the card is non-blocking — the board, undo and the
        // keyboard stay live while it is open. Only a keyboard that Module 9
        // already LOCKED moves to SOCRATIC_ONLY (vraMachine: LOCKED →
        // SOCRATIC_ONLY on hesitation); an open keyboard is never touched.
        // Forcing SOCRATIC_ONLY from UNLOCKED left the learner in a state that
        // nothing but a correct card answer could leave, so closing the card
        // any other way — or reloading with it open — froze the answer row.
        keyboardState: st.keyboardState === 'LOCKED' ? ('SOCRATIC_ONLY' as KeyboardState) : st.keyboardState,
        helpState: 'socratic',
        currentState: 'SOCRATIC_ACTIVE',
        frictionTriggerSource: null,
        socraticTriggerReason: reason,
        socraticCardPlace: cardPlace,
        socraticCardHistory: { taskId, cards: [...history, record] },
        previousSocraticCard: previous && taskId ? { ...previous, taskId } : null,
        // The "four errors" streak returns to 0 once its card is shown (שהB.2).
        ...(reason === 'consecutive_errors_4' && place ? { digitErrorStreak: 0, digitErrorStreakPlace: null } : {}),
        // Meeting 8's undo run starts again once its card opens: every further
        // undo used to reopen it (1.10.2026).
        ...(reason === 'consecutive_undos_3' ? { consecutiveUndoCount: 0 } : {}),
        aiSocraticHint: null,
        socraticPending: true,
      }));
      get().fetchSocraticHint();
    },

    recordSocraticAnswer: (isCorrect) => {
      set((st) => {
        const cards = st.socraticCardHistory.cards;
        if (cards.length === 0) return st;
        const last = cards[cards.length - 1];
        return {
          socraticCardHistory: { ...st.socraticCardHistory, cards: [...cards.slice(0, -1), { ...last, answeredCorrect: isCorrect }] },
        };
      });
    },

    setClassScreenUp: (up) => {
      if (get().classScreenUp !== up) set({ classScreenUp: up });
    },
    recordUserInteraction: () => set({ lastInteractionTime: Date.now(), hasInteracted: true, hesitationTimerSeconds: 0 }),
    incrementTypedErrorCount: () => {
      get().incrementConsecutiveErrors();
    },
    getPersistenceIndex: () => {
      const { undoCount, typedErrorCount, socraticDistractorErrors } = get();
      const denom = undoCount + typedErrorCount + socraticDistractorErrors;
      if (denom === 0) return 100;
      return Math.min(100, Math.max(0, Math.round((undoCount / denom) * 100)));
    },
    markOpeningScreenSeen: () => {
      // "מתחילים" moves from the opening screen to task 1: the next-exercise
      // boundary at which a profile the teacher turned on meanwhile is applied
      // (PRD 19 §ב). The opening screen itself is not an exercise.
      applyPendingSupportProfile();
      set({ openingScreenSeen: true, lastInteractionTime: Date.now() });
    },
    recordPersistenceEvent: (event) => {
      if (!persistenceEventKind(event)) return;
      const tally = get().meetingPersistence;
      // "The events of the current meeting only" (E1): an event filed under
      // another meeting — sent while the page is still moving the learner
      // between meetings — does not count toward this one.
      const meeting = meetingOfSessionId(event.session_id);
      if (meeting !== null && meeting !== tally.sessionNumber) return;
      set({ meetingPersistence: { ...tally, ...addPersistenceEvent(tally, event) } });
    },
    triggerSocraticPenaltyLockout: (hintText) => {
      get().lockSocraticCard(SOCRATIC_LOCKOUT_MS);
      set((s) => ({
        socraticDistractorHint: hintText || 'בחירה זו אינה מביאה לפתרון הנכון. חשבו מה הפעולה הנדרשת בבית המספרים ונסו שוב כשתום הנעילה.',
        socraticDistractorErrors: s.socraticDistractorErrors + 1,
        lastInteractionTime: Date.now()
      }));
    },

    clearSocraticPenaltyLockout: () => {
      get().unlockSocraticCard();
      set({
        socraticDistractorHint: null,
      });
    },

    getSocraticPenaltyRemaining: () => {
      const until = get().socraticLockDeadline;
      if (!until) return 0;
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      if (remaining <= 0 && get().isSocraticCardLocked) {
        get().unlockSocraticCard();
        return 0;
      }
      return remaining;
    },

    setOperandDigit: (which, place, val) => {
      const clean = val.replace(/[^0-9]/g, '').slice(-1);
      const s = get();
      const task = getActiveTasks(s)[s.standardTaskIdx] || null;
      const studentId = currentStudentUid();
      if (clean !== '' && task) {
        const { a, b } = effectiveArithmetic(task, s.isASD);
        const expected = digitAt(which === 'a' ? a : b, place);
        const isCorrect = parseInt(clean, 10) === expected;
        emitTelemetry({
          session_id: `session_${s.sessionNumber}_student_${studentId}`,
          student_id: studentId,
          exercise_id: task.id,
          event_type: 'DIGIT_ENTERED',
          column_index: placeToColumnIndex(place),
          details: { digit_value: parseInt(clean, 10), is_correct: isCorrect },
        }).catch(console.error);
        // The same "four errors" streak as the result row (owner's decision 28.9.2026, שהB.2).
        const streak = nextDigitErrorStreak(s, place, isCorrect);
        if (streak.digitErrorStreak >= 4) openCardForDigitErrorStreak(place);
        set({
          operandDigits: { ...s.operandDigits, [which]: { ...s.operandDigits[which], [place]: clean } },
          hasInteracted: true,
          undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_ENTERED', inputSnapshot(s), undefined, placeToColumnIndex(place)),
          consecutiveUndoCount: 0,
          ...streak,
          hasDigitErrorInTask: isCorrect ? s.hasDigitErrorInTask : true,
          typedErrorCount: isCorrect ? s.typedErrorCount : s.typedErrorCount + 1,
        });
        return;
      }
      const wasSet = Boolean(s.operandDigits[which][place]);
      let streak: ReturnType<typeof nextDigitErrorStreakOnDelete> | null = null;
      if (wasSet && task) {
        const deleted = parseInt(s.operandDigits[which][place] as string, 10);
        emitTelemetry({
          session_id: `session_${s.sessionNumber}_student_${studentId}`,
          student_id: studentId,
          exercise_id: task.id,
          event_type: 'DIGIT_DELETED',
          column_index: placeToColumnIndex(place),
          details: { deleted_digit_value: deleted },
        }).catch(console.error);
        // The same deletion rule as the result row (nextDigitErrorStreakOnDelete).
        const { a, b } = effectiveArithmetic(task, s.isASD);
        streak = nextDigitErrorStreakOnDelete(s, place, deleted === digitAt(which === 'a' ? a : b, place));
        if (streak.digitErrorStreak >= 4) openCardForDigitErrorStreak(place);
      }
      set({
        operandDigits: { ...s.operandDigits, [which]: { ...s.operandDigits[which], [place]: '' } },
        hasInteracted: true,
        // A deletion is an action undo can take back (Module 11 §א), as in the result row.
        ...(wasSet && task
          ? {
              undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_DELETED', inputSnapshot(s), undefined, placeToColumnIndex(place)),
              consecutiveUndoCount: 0,
            }
          : {}),
        ...(streak ?? {}),
      });
    },

    isRepresentationColumnLocked: (place) => {
      const s = get();
      if (s.sessionNumber === 2 || s.sessionNumber === 8) return false;
      // PRD Module 9: the lock exists for enhanced_cognitive_support only; every other learner's row stays open.
      const supportProfile = s.activeSupportProfileId;
      if (supportProfile !== 'enhanced_cognitive_support') return false;
      const task = getActiveTasks(s)[s.standardTaskIdx] || null;
      if (!task || task.type !== 'representation') return false;
      // Station 3 and station 7's groupings have one answer box and no
      // columns: isRepresentationAnswerLocked.
      if (task.representationKind) return false;
      // Owner's decision 28.9.2026 (register שהB.4): PRD Module 9 §א, not
      // מסמך 03 §3.3's whole row — only the exercise's conversion columns lock
      // (REPRESENTATION_LOCKS), each until the blocks perform that conversion
      // there. Undo takes the conversion back and the column locks again.
      const lock = REPRESENTATION_LOCKS[task.id];
      if (!lock || !lock.columns.includes(place)) return false;
      if (conversionDoneInColumn(s.conversionsByColumn, place, lock.conversion === 'decomposition')) return false;
      // Safety valve (register gap כ, approved by the owner on 28.9.2026): a
      // board that already shows the required blocks opens the row, so a child
      // who built them without converting is never stuck.
      return !countsEqual(s.counts, requiredCountsOf(task));
    },

    isRepresentationAnswerLocked: () => {
      const s = get();
      // Module 14: never in meetings 2 and 8. Module 9: enhanced_cognitive_support only.
      if (s.sessionNumber === 2 || s.sessionNumber === 8) return false;
      if (s.activeSupportProfileId !== 'enhanced_cognitive_support') return false;
      const task = getActiveTasks(s)[s.standardTaskIdx] || null;
      if (!task || task.type !== 'representation' || !task.representationKind) return false;
      // Owner, 30.9.2026: the whole box waits for every conversion the
      // exercise lists — after the break, after the grouping. read_write and
      // decompose list none, and are never locked. Undo takes a conversion
      // back and the box locks again.
      if (pendingRepresentationConversion(s, task) === null) return false;
      // The same safety valve as the columns (register gap כ).
      return !countsEqual(s.counts, requiredCountsOf(task));
    },

    recordBlockedAnswerKeystroke: () => {
      const s = get();
      const task = getActiveTasks(s)[s.standardTaskIdx] || null;
      const lock = task ? REPRESENTATION_LOCKS[task.id] : undefined;
      if (!task || !lock) return;
      // The column of the conversion the box still waits for (KEYBOARD_LOCK_BLOCKED is column-scoped).
      const place = pendingRepresentationConversion(s, task) ?? lock.columns[0];
      emitScaffoldEvent(s, 'KEYBOARD_LOCK_BLOCKED', { conversion_required: lock.conversion }, placeToColumnIndex(place));
    },

    setRepresentationAnswer: (text) => {
      const s = get();
      // Module 9: a locked box is genuinely non-writable, whatever calls this.
      if (get().isRepresentationAnswerLocked()) return;
      const answerDigits = answerDigitsFromText(text);
      if (answerTextFromDigits(answerDigits) === answerTextFromDigits(s.answerDigits)) return;
      set({
        answerDigits,
        hasInteracted: true,
        // Typing is an action the learner can take back (Module 11 §א). The
        // box is one number, so the frame names no column.
        undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_ENTERED', inputSnapshot(s)),
        consecutiveUndoCount: 0,
      });
      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const task = getActiveTasks(get())[get().standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'input_changed',
          element: 'representation_answer',
          context: text ? `Typed answer ${answerTextFromDigits(answerDigits)}` : 'Cleared answer',
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Answer: ${answerTextFromDigits(answerDigits)}, Board Value: ${selectBoardValue(get())}`,
        });
      }
    },

    isColumnInputLocked: (place, numberA, numberB, isSubtraction) => {
      const s = get();
      // PRD v7.0 Module 14: In sessions 2 and 8, the keyboard lock is disabled for every learner regardless of profile
      if (s.sessionNumber === 2 || s.sessionNumber === 8) return false;

      // PRD v7.0 Module 9: Lock columns requiring regrouping ONLY when support_profile_id === 'enhanced_cognitive_support'.
      // For every other learner the dynamic keyboard remains fully open at all times.
      // Module 19 §ב: the profile applied at this exercise's start, never the live record.
      const supportProfile = s.activeSupportProfileId;
      if (supportProfile !== 'enhanced_cognitive_support') {
        return false;
      }

      // A keyboard restored as LOCKED (a saved session, or the ASD default)
      // used to lock EVERY column until a grouping or a right card answer —
      // also the columns that need no conversion at all. The lock is per
      // column (Module 9 §א: "ננעלת בטורים הדורשים המרה"), whatever the
      // keyboard's state (1.10.2026).

      const aStr = String(numberA);
      const bStr = String(numberB);
      const cols = Math.max(aStr.length, bStr.length, 4);
      const colPlaces: Place[] = PLACE_ORDER.slice(0, cols).reverse();
      const colIdx = colPlaces.indexOf(place);
      if (colIdx === -1) return false;

      // The highest column has no column above it on the board to group into
      // or decompose from; locking it would leave nothing that could open it.
      if (PLACE_ORDER.indexOf(place) === PLACE_ORDER.length - 1) return false;

      // Module 9 §א: "ננעלת בטורים הדורשים המרה… ומשתחררת רק עם השלמת הפעולה
      // הפיזית בקנבס הלבנים" — column by column. Two things used to open it
      // without that: any digit written in the column's memory circle, and one
      // conversion anywhere in the exercise, which opened every column.
      if (!columnRequiresConversion(place, numberA, numberB, isSubtraction)) return false;
      return !conversionDoneInColumn(s.conversionsByColumn, place, isSubtraction);
    },
    checkTimeExceeded: () => {
      const { sessionDeadlineTime, isTimeExceeded } = get();
      if (isTimeExceeded || !sessionDeadlineTime) return;
      // סמכותי בלבד: בדיקה מול sessionDeadlineTime ו-serverNow() ללא דלת אחורית של deadline מקומי
      if (serverNow() >= sessionDeadlineTime) {
        set({ isTimeExceeded: true });
      }
    },
    resetWorkspace: () => {
      flowEpoch++;
      set({
        sessionNumber: 1,
        isASD: false,
        standardTaskIdx: 0,
        qflow: initQFlow(),
        flowStatus: 'task',
        awaitingNext: false,
        keyboardState: 'UNLOCKED',
        sessionStartTimeMs: Date.now(),
        isTimeExceeded: false,
        // The deadline belongs to the learner who signed out; the next one
        // gets their own from initSession / restoreSession.
        sessionDeadlineTime: null,
        counts: { ...EMPTY_COUNTS },
        undoStack: [],
        undoCount: 0,
        hesitationCount: 0,
        boardOpen: true,
        scaffoldFadeLevel: 0,
        errorPlace: null,
        errorNonce: 0,
        focusedPlace: null,
        isAdditionHelperOpen: false,
    additionHelperOffered: false,
    additionHelperOfferedUnopened: false,
        hasInteracted: false,
        placeCuesShown: false,
        socraticCardKinds: { taskId: null, kinds: [] },
        undoTimestamps: [],
        isBoardLocked: false,
        pendingAdaptation: null,
        hasRequestedBasicHelp: false,
    helpRequestCount: 0,
        taskStartTime: Date.now(),
        hasDeletedBlock: false,
        takeAwayTrack: null as TakeAwayTrack | null,
        heldFromTrack: null as HeldFromTrack | null,
        hasClearedBoard: false,
        blocksAddedCount: 0,
        digitErrorStreak: 0,
        digitErrorStreakPlace: null,
        socraticCardPlace: null,
        socraticCardHistory: { taskId: null, cards: [] },
        previousSocraticCard: null,
        hasUngrouped: false,
        hasGrouped: false,
        conversionsByColumn: emptyColumnConversions(),
        selectedChoiceId: null,
        answerDigits: {},
        carryDigits: {},
        probeAnswer: '',
        lastSubmittedAnswer: null,
        q3Reps: [],
        reflectionDraft: freshReflectionDraft(),
        feedback: null,
        feedbackNonce: 0,
        helpState: 'closed',
        frictionTriggerSource: null,
    wrongAnswerStreak: 0,
    wrongAnswerTaskId: null,
    boardCheckFailures: 0,
    boardCheckFailuresTaskId: null,
        aiSocraticHint: null,
        socraticPending: false,
        socraticDistractorHint: null,
        typedErrorCount: 0,
        socraticDistractorErrors: 0,
        meetingPersistence: freshMeetingPersistence(1),
        openingScreenSeen: false,
        lastInteractionTime: Date.now(),
        dynamicTasks: null,
        // The next learner on this device starts with nothing of this one's:
        // no pinned bank, and a support profile read afresh from their record.
        activeBankPath: null,
        pendingSupportProfileId: null,
        hasPendingSupportProfile: false,
        activeSupportProfileId: null,
        supportProfileApplied: false,
        // Defaults again: nothing here is a learner's meeting until the next start or restore.
        workspaceInitializedFor: null,
        currentState: 'IDLE' as VRAWorkspaceState,
        activeColumnIndex: 0,
        isSocraticCardLocked: false,
        socraticLockDeadline: null,
        socraticPenaltyLockoutUntil: null,
        hesitationTimerSeconds: 0,
        consecutiveErrorCount: 0,
        consecutiveUndoCount: 0,
        genericUndoStack: [],
      });
    },

    // Canonical VRA State Machine Actions (Module 29 / Appendix A §5)
    transitionTo: (newState: VRAWorkspaceState) => {
      set({ currentState: newState });
    },

    resetHesitationTimer: () => {
      set({ hesitationTimerSeconds: 0, lastInteractionTime: Date.now() });
    },

    // Module 10 (30s) & Module 12 (45s): the pedagogical hesitation hierarchy is
    // owned by useCognitiveHesitationRadar, which measures real inactivity and
    // consults src/core/hesitationStages.ts. A `tickHesitationTimer` action
    // once duplicated both stages here, but nothing ever called it — no
    // component drove a per-second tick — so the duplicate silently diverged
    // from the live behaviour while tests kept asserting against it. Do not
    // reintroduce a second owner of these thresholds.

    pushUndoSnapshot: (snapshot: Record<string, unknown>) => {
      set((state) => {
        const next = [...state.genericUndoStack, snapshot];
        if (next.length > UNDO_STACK_CAP) next.shift();
        return { genericUndoStack: next };
      });
    },

    popUndoSnapshot: () => {
      const s = get();
      if (s.genericUndoStack.length === 0) return null;
      const next = [...s.genericUndoStack];
      const popped = next.pop() ?? null;
      set({ genericUndoStack: next });
      return popped;
    },

    lockSocraticCard: (durationMs = SOCRATIC_LOCKOUT_MS) => {
      const deadline = Date.now() + durationMs;
      set({ isSocraticCardLocked: true, socraticLockDeadline: deadline, socraticPenaltyLockoutUntil: deadline });
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SOCRATIC_PENALTY_STORAGE_KEY, deadline.toString());
        }
      } catch (e) {
        console.error('Failed to store socratic penalty', e);
      }
    },

    unlockSocraticCard: () => {
      set({ isSocraticCardLocked: false, socraticLockDeadline: null, socraticPenaltyLockoutUntil: null, socraticDistractorHint: null });
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(SOCRATIC_PENALTY_STORAGE_KEY);
        }
      } catch (e) {
        console.error('Failed to clear socratic penalty', e);
      }
    },

    setActiveColumnIndex: (colIndex: number) => {
      set({ activeColumnIndex: colIndex });
    },

    // Wrong submissions of this exercise: PROBLEM_COMPLETE's error_count and the
    // coaching card's context. It opens no card. Module 12's "four errors"
    // trigger is the per-column digit streak (register deviation 2, 28.9.2026:
    // nextDigitErrorStreak), and a second wrong answer in a row opens the card
    // as 'repeated_errors' (deviation 17). This counter also opened one on the
    // 4th wrong press of the whole exercise, labelled consecutive_errors_4 —
    // a child who typed no digit at all was reported, to the teacher, the
    // research data and the AI, as four typing errors in one column.
    incrementConsecutiveErrors: () => {
      set((state) => {
        const nextErrors = state.consecutiveErrorCount + 1;
        // Module 16 §ב derives the persistence index's E term exclusively from
        // DIGIT_ENTERED events with is_correct: false — that is already counted
        // at the two digit-entry sites (setAnswerDigit / setCarryDigit). This
        // path fires on any wrong final submission, including block-manipulation
        // failures that are not digit entries, so bumping typedErrorCount here
        // inflated the denominator and understated the score shown to the
        // learner on the Session 8 reflection board.
        return { 
          consecutiveErrorCount: nextErrors, 
          lastInteractionTime: Date.now() 
        };
      });
    },

    resetConsecutiveErrors: () => {
      set({ consecutiveErrorCount: 0 });
    },
  };
});

/*
 * Subtraction with blocks: every change of the board, whatever made it (a
 * drag, the trash, a click, undo, a restore), updates the take-away record of
 * the exercise on the screen (nextTakeAwayTrack). A set that writes the record
 * itself (a reset, a restore) is left as written.
 */
useWorkspaceStore.subscribe((s, prev) => {
  if (s.counts === prev.counts || s.takeAwayTrack !== prev.takeAwayTrack) return;
  const task = getActiveTasks(s)[s.standardTaskIdx];
  if (!task || !task.isSubtraction || typeof task.numberA !== 'number' || typeof task.numberB !== 'number') return;
  const { a } = effectiveArithmetic(task, s.isASD === true);
  const next = nextTakeAwayTrack(s.takeAwayTrack, task.id, a, getValue(prev.counts), getValue(s.counts));
  const was = s.takeAwayTrack;
  if (was && was.taskId === next.taskId && was.held === next.held && was.started === next.started) return;
  useWorkspaceStore.setState({ takeAwayTrack: next });
});

/*
 * Column dimming only (WorkspaceState.heldFromTrack): a skeleton whose board
 * work is a subtraction from a number other than the first one — every change
 * of the board updates whether the board has held that number. A set that
 * writes the record itself (a reset, a restore, undo) is left as written.
 */
useWorkspaceStore.subscribe((s, prev) => {
  if (s.counts === prev.counts || s.heldFromTrack !== prev.heldFromTrack) return;
  const task = getActiveTasks(s)[s.standardTaskIdx];
  if (!task || !task.hiddenDigits || (task.type !== 'vertical_addition' && task.type !== 'addition_simple')) return;
  const { a, b } = effectiveArithmetic(task, s.isASD === true);
  const from = heldFromNumber({ a, b, isSubtraction: task.isSubtraction === true, hidden: task.hiddenDigits });
  if (from === null) return;
  const next = nextHeldFromTrack(s.heldFromTrack, task.id, from, getValue(s.counts));
  const was = s.heldFromTrack;
  if (was && was.taskId === next.taskId && was.held === next.held) return;
  useWorkspaceStore.setState({ heldFromTrack: next });
});

/* Re-exports used by components */
export { getCurrentQTask, getEffectiveChoices, getEffectiveNumber, getExpectedBlocks, isSubtaskActive };

/* Dev-only test hook: lets E2E scripts drive the store deterministically. Stripped from prod builds. */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__wsStore = useWorkspaceStore;
}
