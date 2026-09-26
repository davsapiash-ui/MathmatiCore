/**
 * useWorkspaceStore — single source of truth for the student workspace session.
 * Faithful port of the vanilla behavior (vanilla_audit/js/app.js + manipulatives.js):
 * board counts + undo snapshots, standard task flow (sessions 1/3/4), the Q-Matrix
 * two-phase flow (session 2), overlays (feedback / help), and scaffold effects.
 * All math rules live in core/placeValue.ts; all flow rules in core/qmatrixFlow.ts.
 */

import { create } from 'zustand';
import {
  EMPTY_COUNTS,
  getValue,
  removeBlock,
  resolveDrop,
  splitBlockClick,
  groupBlocksManually,
  PLACE_ORDER,
  type DropInput,
  type Place,
  type PlaceCounts,
  countsEqual,
  describeCountsHe,
  digitAt,
} from '@/core/placeValue';
import { session1Checklist, session1NextStep } from '@/core/session1Checklist';
import {
  advance,
  getCurrentQTask,
  getEffectiveChoices,
  getEffectiveNumber,
  getExpectedBlocks,
  initQFlow,
  isSubtaskActive,
  recordResult,
  type QFlowEvent,
  type QMatrixFlowState,
} from '@/core/qmatrixFlow';
import { stateReducer } from '@/machines/vraMachine';
import { computeCognitiveMastery, Q_FAIL_TAG } from '@/core/QMatrix';
import { useStore } from '@/application/useStore';
import { useAuthStore, currentStudentUid } from '@/application/useAuthStore';
import { CurriculumRouter } from '@/core/CurriculumRouter';
import { syncQMatrixEvaluation } from '@/core/ExerciseValidationEngine';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { curriculumCatalog } from '@/infrastructure/services/CurriculumCatalogService';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { SocraticEngine, type SocraticHintResponse, type SocraticMonitoringSnapshot } from '@/infrastructure/services/SocraticEngine';
import { ref, update } from 'firebase/database';
import { database, serverNow } from '@/infrastructure/firebase';
import { throttledRtdbUpdate } from '@/infrastructure/services/ThrottledRtdbWriter';
import { normalizeStudentId } from '@/application/useChatStore';
import { firebaseSyncService, emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import type { TelemetryEventType } from '@/types/telemetry';
import type { VRAWorkspaceState } from '@/types';

/**
 * Appendix A §3 scaffold events (owner, 16.9.2026 — register deviation 19).
 * One emitter so the three carry the same session/exercise identity as
 * every other event and go through the same offline queue.
 */
function emitScaffoldEvent(
  s: WorkspaceState,
  eventType: 'ADAPTIVE_GRID_TOGGLED' | 'KEYBOARD_LOCK_BLOCKED' | 'HELP_REQUESTED',
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

const DEFAULT_SOCRATIC_HINT: SocraticHintResponse = {
  questionHe: 'מה הפעולה המתמטית שנרצה לבצע בבית המספרים?',
  choices: [
    { id: 'opt_1', textHe: 'לבדוק את מספר הבלוקים בכל טור בבית המספרים ולחשב מחדש' },
    { id: 'opt_2', textHe: 'לפרוט עשרת אחת ל-10 יחידות' },
    { id: 'opt_3', textHe: 'לקבץ 10 יחידות לעשרת אחת' }
  ],
  correctChoiceId: 'opt_1'
};

export type SessionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
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
}

/**
 * Module 9 §א, מסמכים 01 ו-03: the enhanced-support keyboard lock and the
 * "wrong digit before the conversion was done with the blocks" coaching
 * trigger are both PER COLUMN. A column's conversion is done when the blocks
 * performed it for that column:
 *  - addition — ten blocks of the column grouped into one block of the next
 *    ("הקבץ 10" on the column): `composed[place]`;
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
}

export function emptyColumnConversions(): ColumnConversions {
  return { composed: {}, decomposed: {} };
}

/** A saved value back into shape; the database drops empty objects. */
export function normalizeColumnConversions(raw: unknown): ColumnConversions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  return { composed: { ...(r.composed ?? {}) }, decomposed: { ...(r.decomposed ?? {}) } };
}

/** Was the conversion this column needs performed with the blocks? */
export function conversionDoneInColumn(conv: ColumnConversions, place: Place, isSubtraction: boolean | undefined): boolean {
  return Boolean(isSubtraction ? conv.decomposed[place] : conv.composed[place]);
}

/** The conversions after one board event (a grouping from `from`, or a decomposition into `to`). */
function withColumnConversion(conv: ColumnConversions, kind: 'composed' | 'decomposed', place: Place): ColumnConversions {
  return { ...conv, [kind]: { ...conv[kind], [place]: true } };
}

interface WorkspaceState {
  // canonical VRA state machine (Module 29 / Appendix A §5)
  currentState: VRAWorkspaceState;
  activeColumnIndex: number; // 0: Ones, 1: Tens, 2: Hundreds
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
  /** The trash was pressed this task (clearBoard) — meeting 1 step 5. Dragging one block into it does not count. */
  hasClearedBoard: boolean;
  blocksAddedCount: number; // Added to enforce the 5 block rule in Sandbox
  consecutiveDeletions: number;
  hasUngrouped: boolean;
  hasGrouped: boolean;
  /** Which columns' conversions the blocks performed in this exercise (Module 9 §א, per column). */
  conversionsByColumn: ColumnConversions;
  selectedChoiceId: string | null;
  answerDigits: Partial<Record<Place, string>>;
  carryDigits: Partial<Record<Place, string>>;
  probeAnswer: string;
  q3Reps: PlaceCounts[];
  /** Which of מסמך 03's triggers opened the coaching card (null when it is closed). */
  socraticTriggerReason: SocraticTriggerReason | null;
  /** Skeleton exercises (מסמך 03): digits the learner types into hidden operand cells. */
  operandDigits: { a: Partial<Record<Place, string>>; b: Partial<Record<Place, string>> };
  aiSocraticHint: SocraticHintResponse | null;
  socraticPenaltyLockoutUntil: number | null;
  socraticDistractorHint: string | null;
  typedErrorCount: number;
  hasDigitErrorInTask: boolean;
  socraticDistractorErrors: number;
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
  isAdditionHelperOpen: boolean;
  /** The Module 10 grid opened at least once this session, so the learner may bring it back (מסמך 03 §1.3 ב'). */
  additionHelperOffered: boolean;
  helpRequested: boolean;
  pendingSupportProfileId: string | null;
  activeSupportProfileId: string | null;
  activeDeviceId: string | null;
  isSupersededByOtherDevice: boolean;

  // actions
  setActiveDeviceId: (id: string) => void;
  setSupersededByOtherDevice: (superseded: boolean) => void;
  setPendingSupportProfile: (profileId: string | null) => void;
  setHelpRequested: (val: boolean) => void;
  toggleHelpRequested: () => void;
  /** 'learner' when the learner brings the grid back (מסמך 03 §1.3 ב'); default is the Module 10 hesitation stage. */
  openAdditionHelper: (source?: 'hesitation_30s' | 'learner') => void;
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
  toggleBoard: () => void;
  setFocusedPlace: (place: Place | null) => void;
  selectChoice: (id: string) => void;
  setAnswerDigit: (place: Place, val: string) => void;
  setCarryDigit: (place: Place, val: string) => void;
  setProbeAnswer: (v: string) => void;
  setOperandDigit: (which: 'a' | 'b', place: Place, val: string) => void;
  /** representation tasks, enhanced profile only: the result row opens once the board shows the prescribed blocks. */
  isRepresentationInputLocked: () => boolean;
  checkTimeExceeded: () => void;
  /** "החזרת עזרים" — bidirectional scaffold fading per spec: temporarily restore faded aids. */
  restoreScaffolds: () => void;
  addRepresentation: () => void;
  demoUngroup: () => void;
  proceed: () => void;
  /** "סיום המפגש כעת" from the early-finisher screen; records completion like every other exit. */
  finishMeetingEarly: () => void;
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
  /** מסמך 03: open the coaching card, recording which trigger did it. */
  openSocraticCard: (reason: SocraticTriggerReason) => void;
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
      return frame;
    });
}

function resetTaskInteraction(_isASD = false) {
  return {
    counts: { ...EMPTY_COUNTS },
    undoStack: [] as UndoFrame[],
    regroupTriggerTimestamps: {} as Record<number, number>,
    hasInteracted: false,
    hasDeletedBlock: false,
    hasClearedBoard: false,
    blocksAddedCount: 0,
    hasUngrouped: false,
    hasGrouped: false,
    conversionsByColumn: emptyColumnConversions(),
    selectedChoiceId: null as string | null,
    answerDigits: {} as Partial<Record<Place, string>>,
    carryDigits: {} as Partial<Record<Place, string>>,
    probeAnswer: '',
    q3Reps: [] as PlaceCounts[],
    operandDigits: { a: {}, b: {} } as { a: Partial<Record<Place, string>>; b: Partial<Record<Place, string>> },
    socraticTriggerReason: null as SocraticTriggerReason | null,
    focusedPlace: null as Place | null,
    undoCount: 0,
    consecutiveDeletions: 0,
    hesitationCount: 0,
    hesitationTimerSeconds: 0,
    consecutiveErrorCount: 0,
    consecutiveUndoCount: 0,
    undoTimestamps: [],
    isBoardLocked: false,
    hasRequestedBasicHelp: false,
    helpRequestCount: 0,
    taskStartTime: Date.now(),
    keyboardState: 'UNLOCKED' as KeyboardState,
    hasDigitErrorInTask: false,
    isAdditionHelperOpen: false,
    additionHelperOffered: false,
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

/** Effective scaffold level of the current task (correction subtasks scaffold at 1). */
function sanitizeSessionNumber(n: any): SessionNumber {
  const parsed = parseInt(n, 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 8) return 1;
  return parsed as SessionNumber;
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

/** The bank a saved branch choice ran on: the compulsory exercises plus that branch's tasks. */
function restoredBranchTasks(sessionNumber: number, branch: 'reinforcement' | 'challenge' | null): SessionTask[] | null {
  if (!branch || sessionNumber < 3 || sessionNumber > 7) return null;
  const path = resolveLearningPath();
  const extra = getSessionBranchTasks(sessionNumber as any, branch, path);
  if (extra.length === 0) return null;
  return [...(getSessionTasks(sessionNumber as any, path) ?? []), ...extra];
}

export function getActiveTasks(s: WorkspaceState): SessionTask[] {
  // Session 2 runs through the Q-Matrix flow — it has no standard task list.
  if (s.sessionNumber === 2) return [];
  if (s.dynamicTasks) return s.dynamicTasks;
  // מודול 26 §ב: המאגר נקבע לפי המסלול שננעץ בתחילת התרגיל, לא לפי הערך
  // החי. שינוי מסלול באמצע תרגיל נכנס לתוקף רק בתרגיל הבא (ראו activeBankPath).
  return getSessionTasks(s.sessionNumber as any, s.activeBankPath ?? resolveLearningPath()) ?? [];
}

/**
 * The learner's approved learning path (PRD Module 20/26): the teacher-selected
 * path on the student record; green_path until one is approved.
 */
export function resolveLearningPath(): 'green_path' | 'remediation_path' {
  const authUser = useAuthStore.getState().user;
  const student = authUser?.uid ? useStore.getState().students[authUser.uid] : null;
  const rawPath = (student as any)?.pedagogicalPath;
  return rawPath === 'remediation_path' ? 'remediation_path' : 'green_path';
}

/**
 * The path to pin for the coming exercise, or null when the learner record has
 * not yet said which path was approved.
 *
 * Pinning an unknown path would be worse than not pinning: the RTDB listener
 * hydrates a moment after the workspace mounts, so a remediation learner would
 * be frozen on the green bank for the whole first exercise. Until the record
 * carries an explicit decision, the live resolution keeps applying.
 */
export function pinnableLearningPath(): 'green_path' | 'remediation_path' | null {
  const authUser = useAuthStore.getState().user;
  const student = authUser?.uid ? useStore.getState().students[authUser.uid] : null;
  const rawPath = (student as any)?.pedagogicalPath;
  return rawPath === 'remediation_path' || rawPath === 'green_path' ? rawPath : null;
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
    return Boolean((next && s.carryDigits[next]) || (isSubtraction && s.carryDigits[place]));
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
    const { a, b, target } = effectiveArithmetic(task, s.isASD);
    const hasDigits = answerDigitsToNumber(effectiveAnswerDigits(s, task, target)) !== null;
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

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  /** Show feedback and auto-hide after ms (nonce-guarded against stale hides). */
  function showFeedback(feedback: FeedbackState, ms: number, then?: () => void) {
    const nonce = get().feedbackNonce + 1;
    set({ feedback, feedbackNonce: nonce });
    setTimeout(() => {
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
    conversions?: ColumnConversions
  ): UndoFrame[] {
    const frame: UndoFrame = { counts: { ...counts }, actionType };
    if (input) {
      frame.answerDigits = { ...input.answerDigits };
      frame.carryDigits = { ...input.carryDigits };
      frame.operandDigits = { a: { ...input.operandDigits.a }, b: { ...input.operandDigits.b } };
    }
    if (conversions) frame.conversionsByColumn = normalizeColumnConversions(conversions);
    const stack = [...currentStack, frame];
    if (stack.length > UNDO_STACK_CAP) stack.shift();
    return stack;
  }

  /** The learner's typed state, for an undo frame. */
  function inputSnapshot(s: WorkspaceState): Pick<WorkspaceState, 'answerDigits' | 'carryDigits' | 'operandDigits'> {
    return { answerDigits: s.answerDigits, carryDigits: s.carryDigits, operandDigits: s.operandDigits };
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
      socraticDistractorHint: null,
      frictionTriggerSource: null,
    });
    applyPendingAdaptationAtBoundary();
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

  /** Session-2 transition script (vanilla onQTaskComplete, app.js 813–873). */
  function handleQFlowEvent(event: QFlowEvent) {
    const s = get();
    switch (event.type) {
      case 'primary_done':
        showFeedback({ correct: true, neutral: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה! 👍', sub: 'עוֹבְרִים לַמְּשִׂימָה הַבָּאָה...' }, 1500, () => {
          const { state, event: next } = advance(get().qflow);
          set({ qflow: state });
          if (next) handleQFlowEvent(next);
          else {
            startTask(getCurrentQTask(state)?.id ?? '');
            set({ awaitingNext: false });
          }
        });
        break;
      // The correction round has no hints and no right/wrong feedback (owner's
      // decision, 25.9.2026): it is still part of the diagnostic.
      case 'start_correction':
        showFeedback({ correct: true, neutral: true, title: 'מְשִׂימָה נוֹסֶפֶת 📝' }, 1800, () => {
          startTask(event.taskId);
          set({ awaitingNext: false });
        });
        break;
      case 'subtask_done':
        showFeedback(
          { correct: true, neutral: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה! 👍' },
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
        showFeedback({ correct: true, neutral: true, title: 'מְנַסִּים שׁוּב! 🔄', sub: 'הִנֵּה הַמְּשִׂימָה הַמְּקוֹרִית. נַסּוּ לִפְתֹּר אוֹתָהּ כָּעֵת:' }, 1800, () => {
          startTask(event.taskId);
          set({ awaitingNext: false });
        });
        break;
      case 'retry_done':
        showFeedback(
          { correct: true, neutral: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה! 👍' },
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
        showFeedback({ correct: true, title: 'סִיַּמְתֶּם! 🎉', sub: 'כָּל הַכָּבוֹד עַל הָעֲבוֹדָה הַטּוֹבָה!' }, 2200, () => {
          // מודול 16 §א: לוח הרפלקציה הוא "בסיום מפגש 8" — שם בלבד. מודול 14
          // §ב0 ומודול 20: מפגש 2 מסתיים במסך המתנה שקט עד שהמורה מאשרת את
          // המסלול. הקוד הציג כאן את לוח הרפלקציה המלא, כולל אחוז מדד ההתמדה —
          // לילד, ברגע שבו מוכרע לאיזה מסלול הוא הולך.
          set({ flowStatus: 'sessionDone', awaitingNext: false, currentState: 'COMPLETE' });
          const studentId = useAuthStore.getState().user?.uid;
          if (studentId) {
            const store = useStore.getState();
            store.markMeeting2Complete(studentId);
            const student = store.students[studentId];
            if (student) {
              const r = get().qflow.results;
              // מודול 20: ערך ריק פירושו "הלומד לא ניגש למשימה" בלבד.
              // לומד שניגש ונכשל בלי שסווג לו צומת שגיאה נרשם כ-Q_FAIL_TAG,
              // אחרת כישלון היה נראה למורה בדוח האבחון בדיוק כמו משימה
              // שהילד מעולם לא הגיע אליה.
              const getTag = (taskResult: any) => {
                if (!taskResult) return null;
                if (taskResult.tag) return taskResult.tag;
                if (taskResult.correct) return 'success';
                return Q_FAIL_TAG;
              };
              
              const realQMatrix = {
                task1_read_write_zero: getTag(r['task1_read_write_zero']),
                task2_digit_value: getTag(r['task2_digit_value']),
                task3_subtraction_regrouping: getTag(r['task3_subtraction_regrouping']),
                task4_decompose_number: getTag(r['task4_decompose_number']),
                task5_units_to_tens: getTag(r['task5_units_to_tens']),
                task6_vertical_addition: getTag(r['task6_vertical_addition']),
                task7_subtraction_zero_tens: getTag(r['task7_subtraction_zero_tens']),
              };
              store.updateQMatrix(studentId, realQMatrix);
              syncQMatrixEvaluation(studentId, realQMatrix).catch(console.error);
              
              const mastery = computeCognitiveMastery(realQMatrix);
              store.updateConceptMastery(studentId, mastery);

              const hesitations = get().hesitationCount;
              const undos = get().undoCount;
              const efficiency = Math.max(0, 100 - (undos * 5) - (hesitations * 10));
              const persistence = get().getPersistenceIndex();

              const realTraceData = { 
                hesitation_events: hesitations, 
                undo_clicks: undos,
                efficiency_score: efficiency,
                persistence_score: persistence
              };
              store.updateTraceData(studentId, realTraceData);
              const route = CurriculumRouter.evaluateRoute({
                ...student,
                qMatrixResults: { ...student.qMatrixResults, ...realQMatrix },
                conceptMastery: mastery,
                traceData: realTraceData,
              });
              store.setRouteRecommendation(studentId, route);

              // Phase 3: Exact PRD Module 20 & Appendix A §4 Session 2 Scoring & Path Recommendation
              const compulsoryKeys = [
                'task1_read_write_zero',
                'task2_digit_value',
                'task3_subtraction_regrouping',
                'task4_decompose_number',
                'task5_units_to_tens',
                'task6_vertical_addition',
                'task7_subtraction_zero_tens',
              ];
              // Module 23: "correct on first attempt" means PROBLEM_COMPLETE was not preceded by any DIGIT_ENTERED with is_correct === false.
              // Events with is_correct === null are ignored entirely.
              const compulsory_correct_first_attempt = compulsoryKeys.filter(k => {
                const res = r[k] || (k === 'task1_read_write_zero' ? r['task1_zero_placeholder'] :
                  k === 'task3_subtraction_regrouping' ? r['task6_subtraction_regrouping'] :
                  k === 'task4_decompose_number' ? r['task3_flexible_regrouping'] :
                  k === 'task5_units_to_tens' ? r['task5_small_change'] :
                  k === 'task6_vertical_addition' ? r['task4_basic_addition_fluency'] :
                  k === 'task7_subtraction_zero_tens' ? r['task7_missing_subtrahend'] : undefined);
                return res?.correct === true && res?.had_digit_error !== true;
              }).length;
              const session_score_percent = Math.round((compulsory_correct_first_attempt / 7) * 100);
              const matrix_recommended_path = session_score_percent >= 50 ? 'green_path' : 'remediation_path';

              // The pilot's one class (Module 25 §ב.1) — the same id the learner's
              // signed claim carries. This used to take activeClass.school_id, so
              // every SessionDocument said class_id "school_bikorot" and the class
              // report and the research export, which filtered on "class_1", found none.
              const classId = 'class_1';
              firebaseSyncService.syncSession2Completion(studentId, session_score_percent, matrix_recommended_path, classId).catch(console.error);
            }
          }
        });
        break;
    }
    void s;
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
    // PRD 14 §ג: a learner who is done waits on the quiet end screen. This used
    // to set 'reflection' for every meeting, and each one then rendered the
    // MEETING-2 reflection screen: it overwrote the learner's diagnostic
    // Q-matrix with nulls, replaced the meeting-2 reflection record, set the
    // gate back to PENDING_TEACHER_APPROVAL and filed a reflection under meeting 8.
    //
    // Fixing that sent every meeting to the quiet screen — meeting 8 with
    // them, and meeting 8 is the one meeting whose ending IS the reflection
    // board (Module 16 §א; Module 14 calls it "סיכום ורפלקציית SRL").
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

  /** Sessions 1/3/4 proceed (vanilla handleSession1Proceed, app.js 999–1110). */
  function proceedStandard() {
    const s = get();
    const tasks = getActiveTasks(s);
    const task = tasks[s.standardTaskIdx];
    if (!task) return;

    const handleFailure = (detail: string, feedbackTitle: string, feedbackSub: string, feedbackMs: number) => {
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

      // PRD Module 12 & 14: the card never opens in the diagnostic. מסמך 03 §3.1
      // names this trigger for meeting 1 too.
      if (s.sessionNumber !== 2) {
        // Owner rulings 14.9.2026 and 16.9.2026: support stays inside the exercise,
        // and it is contingent (Wood et al.; מסמך 03 §1.3 ד' "שגיאות חוזרות").
        // The first wrong answer gets the feedback line below and the learner's
        // own tools (Undo, memory circles, blocks). The coaching card opens on the
        // second wrong answer in a row on the same exercise. An empty answer or an
        // unanswered question is not a wrong answer and never opens the card.
        if (!incomplete) {
          const streak = (s.wrongAnswerTaskId === task.id ? s.wrongAnswerStreak : 0) + 1;
          set({ wrongAnswerStreak: streak, wrongAnswerTaskId: task.id });
          if (streak >= 2) {
            set({ helpState: 'friction', frictionTriggerSource: 'mistake' });
          }
        }
      }
      showFeedback({ correct: false, title: feedbackTitle, sub: feedbackSub }, feedbackMs);
    };

    const handleSuccess = (feedbackTitle: string, feedbackSub: string, feedbackMs: number) => {
      get().resetConsecutiveErrors();
      set({ awaitingNext: true, wrongAnswerStreak: 0, wrongAnswerTaskId: null });

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

    if (task.type === 'session1_intro') {
      // Meeting 1 tool steps (מסמך 03 §3.1): the checklist on the card is the rule.
      if (session1Checklist(task.id, s)) {
        const nextStep = session1NextStep(task.id, s);
        if (nextStep) {
          handleFailure('sandbox_incomplete', 'עוד צעד אחד 🛠️', `${nextStep}.`, 3500);
          return;
        }
        handleSuccess('כל הכבוד! 🌟', 'ממשיכים לשלב הבא.', 2000);
        return;
      }
      if (task.correctAnswer === 'proceed_any' || !task.choices?.length) {
        handleSuccess('מעולה! 🌟', 'ממשיכים הלאה.', 1500);
        return;
      }
      if (!s.selectedChoiceId) {
        handleFailure('no_choice', 'עֲנוּ עַל שְׁאֵלַת הַחֲשִׁיבָה 🤔', 'בַּחֲרוּ אַחַת מֵהָאֶפְשָׁרֻיּוֹת כְּדֵי לְהַמְשִׁיךְ.', 2500);
        return;
      }
      if (s.selectedChoiceId !== task.correctAnswer) {
        handleFailure('wrong_choice', 'בּוֹאוּ נַחְשֹׁב שׁוּב 🤔', 'הַאִם הוֹסַפְנוּ אוֹ גָּרַעְנוּ קֻבִּיּוֹת כָּלְשֵׁהֵן מִבֵּית הַמְּסִפָּרִים?', 2800);
        return;
      }
      handleSuccess('נכון מאוד! 🌟', 'הערך נשאר זהה לחלוטין מכיוון שלא שינינו את הכמות הכוללת.', 2500);
      return;
    }
    if (task.type === 'addition_simple' || task.type === 'vertical_addition') {
      const { target } = effectiveArithmetic(task, s.isASD);
      const boardVal = selectBoardValue(s);
      const isBoardEmpty = boardVal === 0 && target !== 0;

      if (s.sessionNumber !== 8) {
        if (isBoardEmpty) {
          handleFailure(
            'empty_board',
            'בְּנִיַּת הַמִּסְפָּר בַּבַּיִת 🧱',
            'עֲדַיִן לֹא הִנַּחְתֶּם קֻבִּיּוֹת בְּבֵית הַמְּסִפָּרִים. לַחֲצוּ אוֹ גִּרְרוּ אֶת קֻבִּיּוֹת הַדִּינֶס מֵאַרְגַּז הַכֵּלִים כְּדֵי לִבְנוֹת אֶת הַמִּסְפָּר!',
            3500
          );
          return;
        }

        if (boardVal !== target) {
          handleFailure(
            'wrong_blocks',
            'בּוֹאוּ נְדַיֵּק אֶת הַמִּבְנֶה 🔍',
            'הלבנים שבבית המספרים אינן מתאימות לתוצאת התרגיל. בדקו שוב.',
            3500
          );
          return;
        }

        const hasOvercrowded = s.counts.units >= 10 || s.counts.tens >= 10 || s.counts.hundreds >= 10;
        if (hasOvercrowded) {
          // Names the column and the one action (מסמך 02: "כפתור הקבץ 10 שבראש הטור").
          const crowded = s.counts.units >= 10 ? 'היחידות' : s.counts.tens >= 10 ? 'העשרות' : 'המאות';
          handleFailure(
            'overcrowded_columns',
            'בּוֹאוּ נְקַבֵּץ 🧱',
            `בטור ${crowded} יש 10 לבנים או יותר. לחצו על כפתור הקבץ 10 שבראש הטור.`,
            4000
          );
          return;
        }
      }

      const { a: opA, b: opB } = effectiveArithmetic(task, s.isASD);
      const hidden = hiddenDigitsStatus(s, task, opA, opB);
      if (!hidden.complete) {
        handleFailure('missing_answer', 'הַקְלָדַת תְּשׁוּבָה ✏️', 'כתבו את הספרה החסרה בתיבה הריקה כדי להמשיך.', 3000);
        return;
      }
      if (!hidden.correct) {
        handleFailure('wrong_numeric', 'כִּמְעַט... 🧐', 'הספרה החסרה שכתבתם אינה נכונה. בדקו שוב בעזרת הלבנים בלוח.', 2800);
        return;
      }

      const typedDigits = effectiveAnswerDigits(s, task, target);
      const hasTypedDigits = Object.keys(typedDigits).some(
        (k) => typedDigits[k as Place] !== undefined && typedDigits[k as Place] !== ''
      );

      if (!hasTypedDigits) {
        handleFailure(
          'missing_answer',
          'הַקְלָדַת תְּשׁוּבָה ✏️',
          'הִנַּחְתֶּם אֶת הַקֻּבִּיּוֹת בְּבֵית הַמְּסִפָּרִים בְּצוּרָה מְעֻלָּה! כָּעֵת, הַקְלִידוּ אֶת הַתְּשׁוּבָה בְּתֵיבַת הַמַּעֲנֶה כְּדֵי לְהַמְשִׁיךְ.',
          3500
        );
        return;
      }

      const ansVal = answerDigitsToNumber(typedDigits);
      if (ansVal !== target) {
        if (s.sessionNumber === 8) {
          handleFailure('wrong_numeric', 'נסו שוב 🤔', 'התשובה שהזנתם אינה נכונה. בדקו שוב!', 2800);
        } else {
          handleFailure(
            'wrong_numeric',
            'כִּמְעַט... 🧐',
            'הַתְּשׁוּבָה שֶׁכְּתַבְתֶּם אֵינָהּ תּוֹאֶמֶת לְסַךְ הַקֻּבִּיּוֹת בְּבֵית הַמְּסִפָּרִים. בִּדְקוּ שׁוּב!',
            2800
          );
        }
        return;
      }

      // Memory circles are introduced in meeting 4 (מסמך 03 §3.4); meeting 1 does
      // not mention them, so its refresh exercises get the plain success.
      if (task.type === 'vertical_addition' && (task.requiresGrouping || task.requiresUngrouping) && s.sessionNumber !== 1) {
        const hasCarriesEntered = Object.values(s.carryDigits).some((v) => v !== undefined && v !== '');
        if (!hasCarriesEntered) {
          // A correct answer with the memory circles left empty is still a
          // solved exercise. This branch used to advance on its own and skip
          // handleSuccess: no PROBLEM_COMPLETE (the report said "לא השלים את
          // התרגיל" and scored it 0), no Q-matrix success, and the error streak
          // carried into the next exercise.
          handleSuccess(
            'שימו לב לעיגולי הזיכרון 💡',
            'פתרתם נכון! בתרגילי המרה ופריטה כדאי לרשום את ההמרה בעיגולי הזיכרון שבראש הטורים.',
            3000
          );
          return;
        }
      }

      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'פְּתַרְתֶּם נָכוֹן וְיִצַּגְתֶּם זֹאת מְצֻיָּן בְּבֵית הַמְּסִפָּרִים.', 2500);
      return;
    }

    if (task.type === 'small_change') {
      if (!s.selectedChoiceId) {
        // "התקדם" is enabled by any board touch in meetings 3-5, so a press
        // with no option chosen used to do nothing at all — no message.
        showFeedback({ correct: false, title: 'בַּחֲרוּ תְּשׁוּבָה', sub: 'סַמְּנוּ אַחַת מֵהָאֶפְשָׁרֻיּוֹת, וְאָז לַחֲצוּ "הִתְקַדֵּם".' }, 1800);
        return;
      }
      if (s.selectedChoiceId !== task.correctAnswer) {
        handleFailure('wrong_choice', 'נסו שוב 🤔', 'התשובה שבחרתם אינה נכונה.', 2500);
        return;
      }
      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'תשובה נכונה.', 2500);
      return;
    }

    if (task.type === 'missing_element') {
      const answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
      if (answer === null || Number.isNaN(answer)) {
        showFeedback({ correct: false, title: 'נָא לְהַקְלִיד תְּשׁוּבָה', sub: 'כִּתְבוּ אֶת הַחֵלֶק הֶחָסֵר בַּתֵּיבָה, וְאָז לַחֲצוּ "הִתְקַדֵּם".' }, 1800);
        return;
      }
      if (answer !== task.correctAnswer) {
        handleFailure('wrong_answer', 'נסו שוב 🤔', 'המספר שהזנתם אינו נכון.', 2500);
        return;
      }
      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'תשובה נכונה.', 2500);
      return;
    }

    if (task.type === 'representation') {
      const required = requiredCountsOf(task);
      if (!countsEqual(s.counts, required)) {
        handleFailure(
          'wrong_representation',
          'בּוֹאוּ נְדַיֵּק אֶת הַמִּבְנֶה 🔍',
          task.hideRequiredCounts
            ? 'הלוח עדיין אינו מציג את מה שההנחיה מבקשת. קראו אותה שוב ובדקו את הלוח.'
            : `הלוח צריך להציג בדיוק: ${describeCountsHe(required)}. כרגע יש בו: ${describeCountsHe(s.counts)}.`,
          3500
        );
        return;
      }
      // Meeting 1: the exercise is the conversion itself, not only its result.
      if (task.requiresGrouping && !s.hasGrouped) {
        handleFailure('conversion_skipped', 'בּוֹאוּ נְקַבֵּץ 🧱', 'הלוח נכון, אבל המשימה היא לקבץ בעצמכם: 10 קוביות יחידה בכל פעם, בעזרת כפתור הקבץ 10 שבראש הטור.', 3500);
        return;
      }
      if (task.requiresUngrouping && !s.hasUngrouped) {
        handleFailure('conversion_skipped', 'בּוֹאוּ נִפְרֹט 🧱', 'הלוח נכון, אבל המשימה היא לפרוט בעצמכם: בנו את המספר ולחצו על לבנה כדי לפרק אותה.', 3500);
        return;
      }
      const typed = answerDigitsToNumber(s.answerDigits);
      if (typed === null) {
        handleFailure('missing_answer', 'הַקְלָדַת תְּשׁוּבָה ✏️', 'הלוח מסודר בדיוק כנדרש! כעת כתבו את המספר בשורת התוצאה.', 3000);
        return;
      }
      if (typed !== (task.numberA ?? 0)) {
        handleFailure('wrong_numeric', 'כִּמְעַט... 🧐', 'המספר שכתבתם אינו תואם לכמות שבלוח. בדקו שוב!', 2800);
        return;
      }
      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'ייצגתם את המספר בדיוק כפי שנדרש, והמספר שכתבתם תואם ללוח.', 2500);
      return;
    }

    if (task.type === 'flexible_decomp') {
      if (task.requireEvenTens && s.q3Reps.some((r) => r.tens % 2 !== 0)) {
        handleFailure('odd_tens', 'בּוֹאוּ נִבְדֹּק אֶת הָעֲשָׂרוֹת 🤔', 'בכל דרך מספר העשרות צריך להיות זוגי. נסו שוב!', 2800);
        set({ q3Reps: [] });
        return;
      }
      if (s.q3Reps.length < 2) {
        showFeedback({ correct: false, title: 'נִדְרָשִׁים שְׁנֵי יִצּוּגִים שׁוֹנִים', sub: 'הוֹסִיפוּ יִצּוּג שֵׁנִי!' }, 1800);
        return;
      }
      const [r1, r2] = s.q3Reps;
      const isIdentical = (['units', 'tens', 'hundreds', 'thousands'] as Place[]).every((p) => r1[p] === r2[p]);
      if (isIdentical) {
        handleFailure('canonical_fixation', 'הַיִּצּוּגִים זֵהִים 🤔', 'נַסּוּ לִיצֹר אֶת אוֹתוֹ מִסְפָּר בְּדֶרֶךְ אַחֶרֶת (לְמָשָׁל עַל יְדֵי פְּרִיטַת עֲשֶׂרֶת).', 2800);
        set({ q3Reps: [] });
        return;
      }
      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'הצלחתם להציג שני ייצוגים שונים.', 2500);
      return;
    }

    handleSuccess('כָּל הַכָּבוֹד! 🌟', 'המשך לשלב הבא.', 2500);
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
    set({ activeBankPath: pinnableLearningPath() });
    const s = get();
    const tasks = getActiveTasks(s);
    const nextIdx = s.standardTaskIdx + 1;

    // Module 14: Choice screen (Reinforcement vs Challenge) must only be triggered in Sessions 3–7
    if (nextIdx >= tasks.length && !s.selectedBranch) {
      if (s.sessionNumber >= 3 && s.sessionNumber <= 7) {
        set({ flowStatus: 'choice_branch', awaitingNext: false });
        const studentId = useAuthStore.getState().user?.uid;
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

      set({ awaitingNext: true, currentState: 'COMPLETE' });
      showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! 🎉', sub: `מִפְגָּשׁ ${s.sessionNumber} הוּשְׁלַם בְּהַצְלָחָה!` }, 2500);
      // מודול 16: מפגש 8 מסתיים בלוח הרפלקציה התלת-שלבי — זו כל מטרתו
      // ("חוקר-על — סיכום ורפלקציית SRL", מודול 14). הלוח היה בנוי, נבדק
      // ונשמר כהלכה, אבל שום מסלול בקוד לא הוביל אליו: כל מפגש הסתיים
      // במסך "כל הכבוד", והלוח לא נפתח לאף ילד מעולם.
      // The end used to be the toast’s callback, which runs only if no newer
      // toast appeared: the help button’s toast in those 2.5 seconds left
      // "התקדם" off and the meeting unfinished until a reload (PRD Module 14).
      setTimeout(() => set({ flowStatus: s.sessionNumber === 8 ? 'reflection' : 'sessionDone', awaitingNext: false }), 2500);
      return;
    }

    if (nextIdx < tasks.length) {
      // Module 19: Apply pending teacher support profile strictly at task boundary
      if (s.pendingSupportProfileId) {
        set({ activeSupportProfileId: s.pendingSupportProfileId, pendingSupportProfileId: null });
      }

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

    set({ awaitingNext: true, currentState: 'COMPLETE' });
    showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! 🎉', sub: `מִפְגָּשׁ ${s.sessionNumber} הוּשְׁלַם בְּהַצְלָחָה!` }, 2500);
    // מודול 16: מפגש 8 מסתיים בלוח הרפלקציה התלת-שלבי — זו כל מטרתו
    // ("חוקר-על — סיכום ורפלקציית SRL", מודול 14). הלוח היה בנוי, נבדק
    // ונשמר כהלכה, אבל שום מסלול בקוד לא הוביל אליו: כל מפגש הסתיים
    // במסך "כל הכבוד", והלוח לא נפתח לאף ילד מעולם.
    // The end used to be the toast’s callback, which runs only if no newer
    // toast appeared: the help button’s toast in those 2.5 seconds left
    // "התקדם" off and the meeting unfinished until a reload (PRD Module 14).
    setTimeout(() => set({ flowStatus: s.sessionNumber === 8 ? 'reflection' : 'sessionDone', awaitingNext: false }), 2500);
  }

  /** Session-2 proceed (vanilla handleQTaskProceed, app.js 1112–1162). */
  function proceedQ() {
    const s = get();
    const task = getCurrentQTask(s.qflow);
    if (!task || s.awaitingNext) return;
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
    } else {
      answer = answerDigitsToNumber(s.answerDigits);
      if ((answer === null || isNaN(answer)) && s.probeAnswer) {
        answer = parseInt(s.probeAnswer, 10);
      }
    }

    if (answer === null || Number.isNaN(answer)) {
      showFeedback({ correct: false, title: 'נָא לְהַקְלִיד תְּשׁוּבָה', sub: 'הַקְלִידוּ אֶת הַתְּשׁוּבָה בַּתֵּיבוֹת' }, 1500);
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
      set({ awaitingNext: true });
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

    hasInteracted: false,
    undoTimestamps: [],
    isBoardLocked: false,
    pendingAdaptation: null,
    hasRequestedBasicHelp: false,
    helpRequestCount: 0,
    taskStartTime: Date.now(),
    hasDeletedBlock: false,
    hasClearedBoard: false,
    blocksAddedCount: 0,
    consecutiveDeletions: 0,
    hasUngrouped: false,
    hasGrouped: false,
    conversionsByColumn: emptyColumnConversions(),
    selectedChoiceId: null,
    answerDigits: {},
    carryDigits: {},
    probeAnswer: '',
    q3Reps: [],
    operandDigits: { a: {}, b: {} },
    socraticTriggerReason: null,

    feedback: null,
    feedbackNonce: 0,
    helpState: 'closed',
    frictionTriggerSource: null,
    wrongAnswerStreak: 0,
    wrongAnswerTaskId: null,
    boardCheckFailures: 0,
    boardCheckFailuresTaskId: null,
    aiSocraticHint: null,
    socraticDistractorHint: null,
    typedErrorCount: 0,
    hasDigitErrorInTask: false,
    socraticDistractorErrors: 0,
    lastInteractionTime: Date.now(),
    dynamicTasks: null,
    activeBankPath: null,
    helpRequested: false,
    pendingSupportProfileId: null,
    activeSupportProfileId: null,
    activeDeviceId: null,
    isSupersededByOtherDevice: false,

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

    setPendingSupportProfile: (profileId) => {
      // Module 19: Stores pending support profile without altering the active workspace/board/keyboard state
      set({ pendingSupportProfileId: profileId });
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
      const sanitized = sanitizeSessionNumber(meeting);
      // PRD v7.1 Module 26: promote pending curriculum-catalog updates only at
      // session initialization — a live exercise is never disturbed.
      curriculumCatalog.activateForSession();
      // PRD v7.1 Module 14 §ב: Session 1 sandbox = 20 min; Sessions 3-7 = 15 min; Sessions 2 & 8 = 25 min
      const durationMin = sanitized === 1 ? 20 : (sanitized >= 3 && sanitized <= 7) ? 15 : 25;

      let deadline = existingDeadline || null;
      if (!deadline && typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(`mathmaticore_session_${sanitized}_deadline`);
        if (stored) {
          const parsed = parseInt(stored, 10);
          // serverNow() — מסנכרן עם שרת Firebase לפני הבדיקה
          if (parsed > serverNow()) {
            deadline = parsed;
          }
        }
      }
      if (!deadline) {
        // יש לקרוא fetchServerClockOffset לפני כן (StudentHubPage / StudentWorkspacePage)
        // אם עדיין לא נקרא — serverNow() == Date.now() (offset=0, בטוח)
        deadline = serverNow() + durationMin * 60 * 1000;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(`mathmaticore_session_${sanitized}_deadline`, deadline.toString());
          }
        } catch (e) {
          console.error('Failed to store session deadline', e);
        }
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
        ...resetTaskInteraction(isASD),
      });

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
      const branchTasks = getSessionBranchTasks(s.sessionNumber, branch, resolveLearningPath());
      if (branchTasks.length === 0) return;

      set({
        selectedBranch: branch,
        dynamicTasks: [...currentTasks, ...branchTasks],
        standardTaskIdx: currentTasks.length,
        flowStatus: 'task',
        awaitingNext: false,
      });

      const studentId = useAuthStore.getState().user?.uid;
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
      const storedDeadline = getStoredSocraticLockDeadline();
      const sanitized = sanitizeSessionNumber(saved.sessionNumber);
      // PRD Module 14 §ב — the same table initSession uses: meeting 1 is 20
      // minutes, 3-7 are 15, 2 and 8 are 25. This copy said 25 for meeting 1,
      // so a refresh mid-sandbox handed the teacher a "עברו 25 דקות" popup
      // five minutes late.
      const durationMin = sanitized === 1 ? 20 : (sanitized >= 3 && sanitized <= 7) ? 15 : 25;
      let sessionDeadline = saved.sessionDeadlineTime || null;
      if (!sessionDeadline && typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(`mathmaticore_session_${sanitized}_deadline`);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (parsed > Date.now()) {
            sessionDeadline = parsed;
          }
        }
      }

      set({
        sessionNumber: sanitized,
        isASD: saved.isASD ?? false,
        sessionDurationMinutes: durationMin,
        sessionDeadlineTime: sessionDeadline,
        selectedBranch: saved.selectedBranch ?? null,
        standardTaskIdx: saved.standardTaskIdx ?? 0,
        qflow: saved.qflow ?? initQFlow(),
        flowStatus: saved.flowStatus ?? 'task',
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
        dynamicTasks: restoredBranchTasks(sanitized, saved.selectedBranch ?? null),
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
        isSocraticCardLocked: Boolean(storedDeadline && storedDeadline > Date.now()),
        socraticLockDeadline: storedDeadline,
        socraticDistractorHint: saved.socraticDistractorHint ?? null,
        selectedChoiceId: saved.selectedChoiceId ?? null,
        answerDigits: saved.answerDigits ?? {},
        carryDigits: saved.carryDigits ?? {},
        probeAnswer: saved.probeAnswer ?? '',
        q3Reps: saved.q3Reps ?? [],
        operandDigits: saved.operandDigits ?? { a: {}, b: {} },
        // Now that the snapshot carries them, they are restored as saved —
        // including meeting 1's first step, which used to start over.
        hasDeletedBlock: saved.hasDeletedBlock ?? false,
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
      });
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
      set((s) => {
        if (s.isBoardLocked) return s;
        const result = resolveDrop(s.counts, input, selectScaffoldLevel(s));
        if (!result.ok) {
          if (result.reason === 'constraint') flagConstraintError(result.place);
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
        const stack = createNextUndoStack(
          s.undoStack,
          s.counts,
          actionType,
          undefined,
          isGroup || isUngroup ? s.conversionsByColumn : undefined
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

        if (isGroup || isUngroup) {
          get().transitionTo('REGROUPING_ACTIVE');
          const regroupCol = placeToColumnIndex(input.target.kind === 'column' ? input.target.place : (input.sourcePlace || 'units'));
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
          const sourceColIdx = input.sourcePlace ? placeToColumnIndex(input.sourcePlace) : null;
          const blockVal = input.target.place === 'thousands' ? 1000 : input.target.place === 'hundreds' ? 100 : input.target.place === 'tens' ? 10 : 1;
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
    },

    removeBlockClick: (place) => {
      set((state) => {
        if (state.isBoardLocked) return state;
        const next = removeBlock(state.counts, place);
        if (!next) {
          flagConstraintError(place);
          return state;
        }
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'BLOCK_DRAG_COMPLETE');

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

        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'BLOCK_DRAG_COMPLETE');
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
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'REGROUPING_SUCCESS', undefined, state.conversionsByColumn);

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

        get().transitionTo('REGROUPING_ACTIVE');

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
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'REGROUPING_SUCCESS', undefined, state.conversionsByColumn);

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

        get().transitionTo('REGROUPING_ACTIVE');

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
          details: {
            undo_stack_depth_before: depthBefore,
            reverted_event_type: revertedType,
          },
        }).catch(console.error);

        const nextConsecutiveUndos = (s.consecutiveUndoCount || 0) + 1;

        // Module 12(c): 3 consecutive UNDO_EXECUTED actions within a single exercise trigger Socratic coach, ONLY in Session 8
        if (nextConsecutiveUndos >= 3 && s.sessionNumber === 8 && s.currentState !== 'SOCRATIC_ACTIVE' && !s.isSocraticCardLocked) {
          setTimeout(() => {
            set({ helpState: 'socratic', currentState: 'SOCRATIC_ACTIVE', socraticTriggerReason: 'consecutive_undos_3' });
            get().fetchSocraticHint();
          }, 0);
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
          undoStack: stack,
          undoCount: s.undoCount + 1,
          consecutiveUndoCount: nextConsecutiveUndos,
          undoTimestamps: [],
          keyboardState: stateReducer(s.keyboardState, { type: 'UNDO_CLICK' })
        };
      });
    },

    toggleBoard: () => set((s) => ({ boardOpen: !s.boardOpen })),
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
        const nextDeletions = isDelete ? s.consecutiveDeletions + 1 : (val !== '' ? 0 : s.consecutiveDeletions);

        const studentId = currentStudentUid();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = activeExerciseId(s);
        const colIdx = placeToColumnIndex(place);

        if (val !== '') {
          const numVal = parseInt(val, 10);
          if (!isNaN(numVal) && numVal >= 0 && numVal <= 9) {
            const expectedDigit = computeExpectedDigitForColumn(task, place, s.isASD, false);
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
            if (isCorrect === false && task) {
              const { a, b } = effectiveArithmetic(task, s.isASD);
              if (
                columnRequiresConversion(place, a, b, task.isSubtraction) &&
                !conversionRecordedInColumn(s, place, task.isSubtraction)
              ) {
                setTimeout(() => get().openSocraticCard('conversion_not_performed'), 0);
              }
            }

            if (isCorrect === false) {
              setTimeout(() => {
                if (get().consecutiveDeletions >= 4) get().openSocraticCard('consecutive_errors_4');
              }, 0);
            }

            return {
              answerDigits: { ...s.answerDigits, [place]: val },
              hasInteracted: true,
              // Typing is an action the learner can take back (Module 11 §א).
              undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_ENTERED', inputSnapshot(s)),
              // "שלוש פעולות ביטול רצופות" means consecutive: any other action ends the run.
              consecutiveUndoCount: 0,
              // מסמך 03 counts "four consecutive deletions"; PRD Module 12 counts
              // "4 consecutive wrong typing attempts or deletions". One failed
              // attempt must count once, so a wrong digit typed into an empty
              // cell leaves the streak to the erasure that follows it, while a
              // wrong digit typed OVER an existing one is a second attempt and
              // counts here. A correct digit is productive and restarts it.
              consecutiveDeletions:
                isCorrect === false
                  ? s.consecutiveDeletions + (s.answerDigits[place] ? 1 : 0)
                  : 0,
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
        }


        // מסמך 03, trigger 2: four consecutive deletions in the active column.
        // The count was kept but never read, so this trigger did not exist.
        if (nextDeletions >= 4) {
          setTimeout(() => get().openSocraticCard('consecutive_errors_4'), 0);
        }

        return {
          answerDigits: { ...s.answerDigits, [place]: val },
          hasInteracted: true,
          consecutiveDeletions: nextDeletions,
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
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = activeExerciseId(s);
        const colIdx = placeToColumnIndex(place);

        if (val !== '') {
          const numVal = parseInt(val, 10);
          if (!isNaN(numVal) && numVal >= 0 && numVal <= 9) {
            const expectedCarry = computeExpectedDigitForColumn(task, place, s.isASD, true);
            const isCorrect = expectedCarry !== null ? numVal === expectedCarry : null;
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

            return {
              carryDigits: { ...s.carryDigits, [place]: val },
              hasInteracted: true,
              undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_ENTERED', inputSnapshot(s)),
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
            },
          }).catch(console.error);
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
      if (s.sessionNumber === 2) {
        const task = getCurrentQTask(s.qflow);
        target = task ? getEffectiveNumber(task, s.qflow, s.isASD) : undefined;
      } else {
        const task = getActiveTasks(s)[s.standardTaskIdx];
        target = task?.numberA;
        lessonTaskId = isRepresentationTask(task) ? task.id : null;
        if (task?.requireEvenTens && s.counts.tens % 2 !== 0) {
          if (lessonTaskId) recordBoardCheckFailure(lessonTaskId);
          showFeedback({ correct: false, title: 'בּוֹאוּ נִבְדֹּק אֶת הָעֲשָׂרוֹת 🤔', sub: 'בדרך הזאת מספר העשרות צריך להיות זוגי. נסו לפרוט או להקבץ עשרת אחת.' }, 3200);
          return;
        }
      }

      if (target !== undefined && value !== target) {
        if (lessonTaskId) recordBoardCheckFailure(lessonTaskId);
        const hint =
          s.sessionNumber === 2
            ? 'סריקת הרדאר מזהה שכמות הבלוקים בלוח אינה תואמת למבוקש. איך נוכל לשנות זאת כדי להגיע לכמות המדויקת?'
            : 'הסכום הנוכחי אינו תואם לערך היעד של הניסוי. נסו שוב!';
        showFeedback({ correct: false, title: 'בּוֹאוּ נְדַיֵּק אֶת הַמִּבְנֶה 🔍', sub: hint }, 3200);
        return;
      }
      
      // The second representation has to be a different one. With the board
      // kept between the two (below), pressing the button twice must not count.
      if (s.q3Reps.length === 1 && countsEqual(s.counts, s.q3Reps[0])) {
        if (lessonTaskId) recordBoardCheckFailure(lessonTaskId);
        showFeedback({ correct: false, title: 'זוֹ אוֹתָהּ דֶּרֶךְ 🤔', sub: 'הַרְאוּ אֶת אוֹתוֹ מִסְפָּר בְּדֶרֶךְ שׁוֹנָה: פִּרְטוּ אוֹ הַקְבִּיצוּ, וְאָז הוֹסִיפוּ.' }, 3200);
        return;
      }

      const q3Reps = [...s.q3Reps, { ...s.counts }];
      set({ q3Reps, hasInteracted: true });
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
        const undoStack = createNextUndoStack(s.undoStack, s.counts, 'REGROUPING_SUCCESS');
        get().transitionTo('REGROUPING_ACTIVE');
        set({ counts: result.counts, undoStack, hasInteracted: true, hasUngrouped: true });
      }
    },

    finishMeetingEarly,
    proceed: () => {
      const s = get();
      if (s.awaitingNext || s.flowStatus !== 'task' || !selectCanProceed(s)) return;
      if (s.sessionNumber === 2) proceedQ();
      else proceedStandard();
    },

    fetchSocraticHint: async () => {
      const s = get();
      const currentTask = getActiveTasks(s)[s.standardTaskIdx];
      const targetNode = currentTask?.targetNode || 'q_matrix_general';
      
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
          activeColumnIndex: s.focusedPlace ? placeToColumnIndex(s.focusedPlace) : (s.activeColumnIndex || 0),
          hasRegroupedInCanvas: Boolean(s.hasUngrouped || s.hasGrouped),
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
        
        const now = get();
        const stillTheSameCard = now.helpState === 'socratic' && selectStandardTask(now)?.id === currentTask?.id;
        if (!stillTheSameCard) return;
        if (hint) {
          set({ aiSocraticHint: hint });
        } else if (!get().aiSocraticHint) {
          set({ aiSocraticHint: DEFAULT_SOCRATIC_HINT });
        }
      } catch (error) {
        console.error("LLM Socratic Hint failed. Falling back to static hints.", error);
        if (!get().aiSocraticHint) {
          set({ aiSocraticHint: DEFAULT_SOCRATIC_HINT });
        }
      }
    },

    /** PRD Module 12: after a mistake, a 300ms "let's think" beat, then the Socratic card. */
    requestSilentHelp: () => {
      const s = get();
      const rawUser = useAuthStore.getState().user;
      if (!rawUser?.uid || s.isSupersededByOtherDevice) return;

      const clean = rawUser.uid.trim().toLowerCase();
      const studentId = normalizeStudentId(clean) || (clean.startsWith('student_') ? clean : `student_${clean}`);

      // PRD 7.3 (useWorkspaceStore: "מיתוג דו-כיווני לקריאת עזרה") and מסמך 03
      // §3.1 ("בלחיצה הפיכה (ניתנת לביטול בכל עת)"): a second press takes the
      // call back.
      if (s.hasRequestedBasicHelp) {
        AuditLogger.log('HELP_REQUESTED', studentId, 'Student took back the silent help call');
        throttledRtdbUpdate(`users/students/${studentId}`, {
          helpRequested: false,
          lastAction: 'ביטל את הקריאה למורה',
        }).catch(console.error);
        set({ hasRequestedBasicHelp: false });
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
      showSideFeedback({ correct: true, neutral: true, title: 'המורה יודעת 🤝', sub: 'הסימן נשלח בשקט. אפשר להמשיך לעבוד. לחיצה נוספת על הכפתור מבטלת את הקריאה.' }, 4000);
    },

    helpFrictionDone: () => {
      const s = get();
      if (s.helpState === 'friction') {
        get().openSocraticCard('repeated_errors');
        // openSocraticCard declines during the 30s card lockout; the beat must
        // still end, or its overlay would stay on screen.
        if (get().helpState === 'friction') set({ helpState: 'closed' });
      }
    },

    closeHelp: () => {
      set((s) => ({
        helpState: 'closed',
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
      set({ isAdditionHelperOpen: true, additionHelperOffered: true });
      emitScaffoldEvent(get(), 'ADAPTIVE_GRID_TOGGLED', { action: 'opened', source });
    },
    closeAdditionHelper: () => {
      if (!get().isAdditionHelperOpen) return;
      set({ isAdditionHelperOpen: false });
      emitScaffoldEvent(get(), 'ADAPTIVE_GRID_TOGGLED', { action: 'closed', source: 'learner' });
    },
    recordBlockedKeystroke: (place) => {
      const s = get();
      const task = getActiveTasks(s)[s.standardTaskIdx] || null;
      emitScaffoldEvent(
        s,
        'KEYBOARD_LOCK_BLOCKED',
        { conversion_required: task?.isSubtraction ? 'decomposition' : 'composition' },
        placeToColumnIndex(place)
      );
    },
    toggleAdditionHelper: () => set((s) => ({ isAdditionHelperOpen: !s.isAdditionHelperOpen })),
    setKeyboardSocratic: () => {
      get().openSocraticCard('hesitation_45s');
    },

    openSocraticCard: (reason) => {
      const s = get();
      // PRD Module 12 & 14: the card is disabled outright in session 2, and never
      // reopens over an open card or during the 30s wrong-answer lockout.
      if (s.sessionNumber === 2) return;
      if (s.currentState === 'SOCRATIC_ACTIVE' || s.helpState === 'socratic') return;
      // The lock is released by the countdown the OPEN card polls. Closing the
      // card during the 30 seconds (its close button stays enabled, and typing a
      // digit closes it too) stopped the polling, the lock never ended, and no
      // card could open again until the page was reloaded.
      if (s.isSocraticCardLocked) {
        if (get().getSocraticPenaltyRemaining() > 0) return;
        if (get().isSocraticCardLocked) get().unlockSocraticCard();
      }
      const currentTask = selectStandardTask(s);
      // An exercise that is already solved has nothing left to coach: a learner
      // who typed the right result and paused before pressing "התקדם" was
      // getting a card about a regrouping the exercise never needed.
      if (currentTask && (currentTask.type === 'addition_simple' || currentTask.type === 'vertical_addition')) {
        const { a, b, target } = effectiveArithmetic(currentTask, s.isASD);
        const typed = answerDigitsToNumber(effectiveAnswerDigits(s, currentTask, target));
        if (typed === target && hiddenDigitsStatus(s, currentTask, a, b).complete) return;
      }
      const initialHint = SocraticEngine.getSynchronousTaskHint(currentTask, s.counts);
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
        socraticTriggerReason: reason,
        aiSocraticHint: initialHint || st.aiSocraticHint,
      }));
      get().fetchSocraticHint();
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
    triggerSocraticPenaltyLockout: (hintText) => {
      get().lockSocraticCard(30000);
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
        set({
          operandDigits: { ...s.operandDigits, [which]: { ...s.operandDigits[which], [place]: clean } },
          hasInteracted: true,
          undoStack: createNextUndoStack(s.undoStack, s.counts, 'DIGIT_ENTERED', inputSnapshot(s)),
          consecutiveUndoCount: 0,
          consecutiveDeletions: 0,
          hasDigitErrorInTask: isCorrect ? s.hasDigitErrorInTask : true,
          typedErrorCount: isCorrect ? s.typedErrorCount : s.typedErrorCount + 1,
        });
        return;
      }
      const wasSet = Boolean(s.operandDigits[which][place]);
      if (wasSet && task) {
        emitTelemetry({
          session_id: `session_${s.sessionNumber}_student_${studentId}`,
          student_id: studentId,
          exercise_id: task.id,
          event_type: 'DIGIT_DELETED',
          column_index: placeToColumnIndex(place),
          details: { deleted_digit_value: parseInt(s.operandDigits[which][place] as string, 10) },
        }).catch(console.error);
      }
      set({
        operandDigits: { ...s.operandDigits, [which]: { ...s.operandDigits[which], [place]: '' } },
        hasInteracted: true,
        consecutiveDeletions: wasSet ? s.consecutiveDeletions + 1 : s.consecutiveDeletions,
      });
    },

    isRepresentationInputLocked: () => {
      const s = get();
      if (s.sessionNumber === 2 || s.sessionNumber === 8) return false;
      // PRD Module 9: the lock exists for enhanced_cognitive_support only; every other learner's row stays open.
      const authUser = useAuthStore.getState().user;
      const supportProfile = (authUser as any)?.support_profile_id ?? (s as any).support_profile_id;
      if (supportProfile !== 'enhanced_cognitive_support') return false;
      const task = getActiveTasks(s)[s.standardTaskIdx] || null;
      if (!task || task.type !== 'representation') return false;
      // מסמך 03 §3.3: the row opens only after the virtual conversion — i.e. once the board shows the prescribed blocks.
      return !countsEqual(s.counts, requiredCountsOf(task));
    },

    isColumnInputLocked: (place, numberA, numberB, isSubtraction) => {
      const s = get();
      // PRD v7.0 Module 14: In sessions 2 and 8, the keyboard lock is disabled for every learner regardless of profile
      if (s.sessionNumber === 2 || s.sessionNumber === 8) return false;

      // PRD v7.0 Module 9: Lock columns requiring regrouping ONLY when support_profile_id === 'enhanced_cognitive_support'.
      // For every other learner the dynamic keyboard remains fully open at all times.
      const authUser = useAuthStore.getState().user;
      const supportProfile = (authUser as any)?.support_profile_id ?? (s as any).support_profile_id;
      if (supportProfile !== 'enhanced_cognitive_support') {
        return false;
      }

      if (s.keyboardState === 'LOCKED' || s.keyboardState === 'SOCRATIC_ONLY') return true;

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
        hasInteracted: false,
        undoTimestamps: [],
        isBoardLocked: false,
        pendingAdaptation: null,
        hasRequestedBasicHelp: false,
    helpRequestCount: 0,
        taskStartTime: Date.now(),
        hasDeletedBlock: false,
        hasClearedBoard: false,
        blocksAddedCount: 0,
        consecutiveDeletions: 0,
        hasUngrouped: false,
        hasGrouped: false,
        conversionsByColumn: emptyColumnConversions(),
        selectedChoiceId: null,
        answerDigits: {},
        carryDigits: {},
        probeAnswer: '',
        q3Reps: [],
        feedback: null,
        feedbackNonce: 0,
        helpState: 'closed',
        frictionTriggerSource: null,
    wrongAnswerStreak: 0,
    wrongAnswerTaskId: null,
    boardCheckFailures: 0,
    boardCheckFailuresTaskId: null,
        aiSocraticHint: null,
        socraticDistractorHint: null,
        typedErrorCount: 0,
        socraticDistractorErrors: 0,
        lastInteractionTime: Date.now(),
        dynamicTasks: null,
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

    lockSocraticCard: (durationMs = 30000) => {
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

    // Module 12: Trigger 2 — 4 consecutive errors triggers Socratic coach across ALL sessions
    incrementConsecutiveErrors: () => {
      set((state) => {
        const nextErrors = state.consecutiveErrorCount + 1;
        if (nextErrors >= 4) {
          setTimeout(() => get().openSocraticCard('consecutive_errors_4'), 0);
        }
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

/* Re-exports used by components */
export { getCurrentQTask, getEffectiveChoices, getEffectiveNumber, getExpectedBlocks, isSubtaskActive };

/* Dev-only test hook: lets E2E scripts drive the store deterministically. Stripped from prod builds. */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__wsStore = useWorkspaceStore;
}
