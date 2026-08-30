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
} from '@/core/placeValue';
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
import { computeCognitiveMastery } from '@/core/QMatrix';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { CurriculumRouter } from '@/core/CurriculumRouter';
import { syncQMatrixEvaluation } from '@/core/ExerciseValidationEngine';
import { QMatrixEvaluator } from '@/core/QMatrix';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { ref, update, push } from 'firebase/database';
import { database, serverNow, fetchServerClockOffset } from '@/infrastructure/firebase';
import { throttledRtdbUpdate } from '@/infrastructure/services/ThrottledRtdbWriter';
import { normalizeStudentId } from '@/application/useChatStore';
import { firebaseSyncService, emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import type { TelemetryEventType } from '@/types/telemetry';
import type { VRAWorkspaceState } from '@/types';

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
export type SupportType = 'metacognitive' | 'socratic' | 'worked_example';
export type HelpState = 'closed' | 'friction' | 'palette' | SupportType;
export type FlowStatus = 'task' | 'choice_branch' | 'reflection' | 'sessionDone';
export type KeyboardState = 'LOCKED' | 'UNLOCKED' | 'SOCRATIC_ONLY';

export interface FeedbackState {
  correct: boolean;
  title: string;
  sub?: string;
}

export interface UndoFrame {
  counts: PlaceCounts;
  actionType?: TelemetryEventType | null;
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
  hasRequestedBasicHelp: boolean;
  hasInteracted: boolean;
  hasDeletedBlock: boolean;
  blocksAddedCount: number; // Added to enforce the 5 block rule in Sandbox
  consecutiveDeletions: number;
  hasUngrouped: boolean;
  hasGrouped: boolean;
  selectedChoiceId: string | null;
  answerDigits: Partial<Record<Place, string>>;
  carryDigits: Partial<Record<Place, string>>;
  probeAnswer: string;
  q3Reps: PlaceCounts[];
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
  frictionTriggerSource: 'lightbulb' | 'mistake' | null;

  /** Teacher-approved AI-generated task list (Socratic Engine); overrides session tasks when set. */
  aiTasks: SessionTask[] | null;
  /** Dynamically injected tasks for the current session (Micro-Agility engine). Takes precedence if length > 0. */
  dynamicTasks: SessionTask[] | null;
  nodeStrikes: Record<string, number>;
  successStreak: number;
  keyboardState: KeyboardState;
  isAdditionHelperOpen: boolean;
  pendingSupportProfileId: string | null;
  activeSupportProfileId: string | null;
  activeDeviceId: string | null;
  isSupersededByOtherDevice: boolean;

  // actions
  setActiveDeviceId: (id: string) => void;
  setSupersededByOtherDevice: (superseded: boolean) => void;
  setPendingSupportProfile: (profileId: string | null) => void;
  openAdditionHelper: () => void;
  closeAdditionHelper: () => void;
  toggleAdditionHelper: () => void;
  injectTask: (task: SessionTask, position: 'next' | 'end') => void;
  startSession: (meeting: number) => void;
  initSession: (meeting: SessionNumber, isASD: boolean, aiTasks?: SessionTask[] | null, startingTaskIdx?: number, existingDeadline?: number | null) => void;
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
  checkTimeExceeded: () => void;
  /** "החזרת עזרים" — bidirectional scaffold fading per spec: temporarily restore faded aids. */
  restoreScaffolds: () => void;
  addRepresentation: () => void;
  demoUngroup: () => void;
  proceed: () => void;
  requestHelp: () => void;
  helpFrictionDone: () => void;
  chooseSupport: (type: SupportType) => void;
  closeHelp: () => void;
  setAITasks: (tasks: SessionTask[] | null) => void;
  showFeedback: (feedback: FeedbackState, ms: number, then?: () => void) => void;
  fetchSocraticHint: () => Promise<void>;
  unlockKeyboard: () => void;
  lockKeyboard: () => void;
  setKeyboardSocratic: () => void;
  triggerSocraticPenaltyLockout: (hintText?: string) => void;
  clearSocraticPenaltyLockout: () => void;
  getSocraticPenaltyRemaining: () => number;
  isColumnInputLocked: (place: Place, numberA: number, numberB: number, isSubtraction?: boolean) => boolean;
  resetWorkspace: () => void;

  // Canonical VRA handlers (Module 29 / Appendix A §5)
  transitionTo: (newState: VRAWorkspaceState) => void;
  resetHesitationTimer: () => void;
  tickHesitationTimer: () => void;
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

function resetTaskInteraction(isASD = false) {
  return {
    counts: { ...EMPTY_COUNTS },
    undoStack: [] as UndoFrame[],
    regroupTriggerTimestamps: {} as Record<number, number>,
    hasInteracted: false,
    hasDeletedBlock: false,
    blocksAddedCount: 0,
    hasUngrouped: false,
    hasGrouped: false,
    selectedChoiceId: null as string | null,
    answerDigits: {} as Partial<Record<Place, string>>,
    carryDigits: {} as Partial<Record<Place, string>>,
    probeAnswer: '',
    q3Reps: [] as PlaceCounts[],
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
    taskStartTime: Date.now(),
    keyboardState: 'UNLOCKED' as KeyboardState,
    hasDigitErrorInTask: false,
    isAdditionHelperOpen: false,
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

export function getActiveTasks(s: WorkspaceState): SessionTask[] {
  // Session 2 runs through the Q-Matrix flow — it has no standard task list.
  if (s.sessionNumber === 2) return [];
  if (s.dynamicTasks) return s.dynamicTasks;
  if (s.sessionNumber >= 3 && s.aiTasks) return s.aiTasks;
  const authUser = useAuthStore.getState().user;
  const student = authUser?.uid ? useStore.getState().students[authUser.uid] : null;
  const rawPath = s.selectedBranch || (student as any)?.pedagogicalPath;
  const path: 'green_path' | 'remediation_path' =
    rawPath === 'remediation_path' ? 'remediation_path' : 'green_path';
  return getSessionTasks(s.sessionNumber as any, path) ?? [];
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
      return answerDigitsToNumber(s.answerDigits) !== null;
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
    if (task.id === 's1_sandbox_controlled') {
      return s.blocksAddedCount >= 5 && s.hasDeletedBlock;
    }
    if (task.correctAnswer === 'proceed_any' || !task.choices?.length) {
      return true;
    }
    return s.selectedChoiceId !== null;
  }
  if (task.type === 'flexible_decomp') {
    return s.q3Reps.length >= 2;
  }
  if (task.type === 'addition_simple' || task.type === 'vertical_addition') {
    const hasDigits = answerDigitsToNumber(s.answerDigits) !== null;
    const hasBoardBlocks = selectBoardValue(s) > 0;
    return hasBoardBlocks && hasDigits;
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

  function createNextUndoStack(
    currentStack: UndoFrame[],
    counts: PlaceCounts,
    actionType: TelemetryEventType = 'BLOCK_DRAG_COMPLETE'
  ): UndoFrame[] {
    const stack = [...currentStack, { counts: { ...counts }, actionType }];
    if (stack.length > UNDO_STACK_CAP) stack.shift();
    return stack;
  }

  function computeExpectedDigitForColumn(
    task: any,
    place: Place,
    isASD: boolean = false,
    isCarry: boolean = false
  ): number | null {
    if (!task) return null;

    if (isCarry) {
      if (!task.numberA || !task.numberB || task.isSubtraction) return 0;
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

  function startTask(taskId: string) {
    set(resetTaskInteraction());
    set({ keyboardState: 'UNLOCKED', currentState: 'PROBLEM_ACTIVE', taskStartTime: Date.now() });

    if (taskId) {
      const s = get();
      const studentId = useAuthStore.getState().user?.uid || 'student_1';
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
        showFeedback({ correct: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה! 👍', sub: 'עוֹבְרִים לַמְּשִׂימָה הַבָּאָה...' }, 1500, () => {
          const { state, event: next } = advance(get().qflow);
          set({ qflow: state });
          if (next) handleQFlowEvent(next);
          else {
            startTask(getCurrentQTask(state)?.id ?? '');
            set({ awaitingNext: false });
          }
        });
        break;
      case 'start_correction':
        showFeedback({ correct: false, title: 'סֶבֶב תִּקּוּנִים 🔍', sub: 'בּוֹאוּ נַעֲבֹר יַחַד עַל כַּמָּה דְּבָרִים...' }, 1800, () => {
          startTask(event.taskId);
          set({ awaitingNext: false });
        });
        break;
      case 'subtask_done':
        showFeedback(
          { correct: event.correct, title: event.correct ? 'מְצֻיָּן! 🟢' : 'הֵבַנְתִּי, נַמְשִׁיךְ... 🟡' },
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
        showFeedback({ correct: true, title: 'מְנַסִּים שׁוּב! 🔄', sub: 'הִנֵּה הַמְּשִׂימָה הַמְּקוֹרִית. נַסּוּ לִפְתֹּר אוֹתָהּ כָּעֵת:' }, 1800, () => {
          startTask(event.taskId);
          set({ awaitingNext: false });
        });
        break;
      case 'retry_done':
        showFeedback(
          { correct: event.correct, title: event.correct ? 'מְעֻלֶּה, הִצְלַחְתֶּם! 🎉' : 'הַתְּשׁוּבָה נִשְׁמְרָה. 👍' },
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
          set({ flowStatus: 'reflection', awaitingNext: false, currentState: 'COMPLETE' });
          const studentId = useAuthStore.getState().user?.uid;
          if (studentId) {
            const store = useStore.getState();
            store.markMeeting2Complete(studentId);
            const student = store.students[studentId];
            if (student) {
              const r = get().qflow.results;
              const getTag = (taskResult: any) => {
                if (!taskResult) return null;
                if (taskResult.tag) return taskResult.tag;
                if (taskResult.correct) return 'success';
                return null;
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
              const persistence = Math.min(100, 50 + (hesitations * 5) + (undos * 2));

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
                'task1_zero_placeholder',
                'task3_flexible_regrouping',
                'task4_basic_addition_fluency',
                'task5_small_change',
                'task6_subtraction_regrouping',
                'task7_missing_subtrahend',
                'task8_missing_addend'
              ];
              // Module 23: "correct on first attempt" means PROBLEM_COMPLETE was not preceded by any DIGIT_ENTERED with is_correct === false.
              // Events with is_correct === null are ignored entirely.
              const compulsory_correct_first_attempt = compulsoryKeys.filter(k => r[k]?.correct === true && r[k]?.had_digit_error !== true).length;
              const session_score_percent = Math.round((compulsory_correct_first_attempt / 7) * 100);
              const matrix_recommended_path = session_score_percent >= 50 ? 'green_path' : 'remediation_path';

              const activeClass = useAuthStore.getState().activeClass;
              const classId = activeClass?.school_id || 'class_1';
              firebaseSyncService.syncSession2Completion(studentId, session_score_percent, matrix_recommended_path, classId).catch(console.error);
            }
          }
        });
        break;
    }
    void s;
  }

  /** Sessions 1/3/4 proceed (vanilla handleSession1Proceed, app.js 999–1110). */
  function proceedStandard() {
    const s = get();
    const tasks = getActiveTasks(s);
    const task = tasks[s.standardTaskIdx];
    if (!task) return;

    const handleFailure = (detail: string, feedbackTitle: string, feedbackSub: string, feedbackMs: number) => {
      get().incrementConsecutiveErrors();
      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        let errorCategory: 'FACTUAL_ERROR' | 'PROCEDURAL_ERROR' | 'STRATEGIC_ERROR' = 'FACTUAL_ERROR';
        if (detail.includes('overcrowded_columns') || detail.includes('wrong_blocks')) {
          errorCategory = 'PROCEDURAL_ERROR';
        } else if (detail.includes('no_choice') || detail.includes('canonical_fixation')) {
          errorCategory = 'STRATEGIC_ERROR';
        }
        AuditLogger.log(errorCategory, studentId, `Task: ${task.id}, Detail: ${detail}`);
        const qKey = (task as any).qMatrixKey || (task as any).targetNode || task.id;
        const qUpdate = { [qKey]: detail };
        firebaseSyncService.syncQMatrix(studentId, qUpdate as any).catch(console.error);
        useStore.getState().updateQMatrix(studentId, qUpdate as any);
      }

      if (task.targetNode && s.sessionNumber >= 3) {
        const strikes = (s.nodeStrikes[task.targetNode] || 0) + 1;
        set({ nodeStrikes: { ...s.nodeStrikes, [task.targetNode]: strikes }, successStreak: 0 });
        
        if (strikes === 1) {
          set({ helpState: 'friction', frictionTriggerSource: 'mistake' });
        } else if (strikes >= 2) {
          get().injectTask({
            id: `scaffold_${task.id}_${Date.now()}`,
            type: task.type,
            titleHe: 'תרגיל חיזוק (הזרקה)',
            instructionHe: 'בואו ננסה תרגיל נוסף כדי לחזק את ההבנה, במספרים קטנים יותר:',
            targetNode: task.targetNode,
            scaffoldLevel: 1,
            numberA: task.numberA ? Math.floor(task.numberA / 2) : undefined,
            numberB: task.numberB ? Math.floor(task.numberB / 2) : undefined,
            isSubtraction: task.isSubtraction,
            requiresGrouping: task.requiresGrouping,
            requiresUngrouping: task.requiresUngrouping,
          }, 'next');
        }
      }
      showFeedback({ correct: false, title: feedbackTitle, sub: feedbackSub }, feedbackMs);
    };

    const handleSuccess = (feedbackTitle: string, feedbackSub: string, feedbackMs: number) => {
      get().resetConsecutiveErrors();
      set({ awaitingNext: true });

      const studentId = useAuthStore.getState().user?.uid || 'student_1';
      const durationMs = Math.max(0, Date.now() - (s.taskStartTime || Date.now()));
      emitTelemetry({
        session_id: `session_${s.sessionNumber}_student_${studentId}`,
        student_id: studentId,
        exercise_id: task.id,
        event_type: 'PROBLEM_COMPLETE',
        details: {
          total_duration_ms: durationMs,
          undo_count: s.undoCount,
          error_count: s.consecutiveErrorCount || 0,
        },
      }).catch(console.error);

      // Module 14: Choice branch tasks are strictly excluded from baseline Q-Matrix mastery
      if (studentId && !task.isOptionalChoiceTask) {
        const qKey = (task as any).qMatrixKey || (task as any).targetNode || task.id;
        const qUpdate = { [qKey]: 'success' };
        firebaseSyncService.syncQMatrix(studentId, qUpdate as any).catch(console.error);
        useStore.getState().updateQMatrix(studentId, qUpdate as any);
      }
      if (task.targetNode && s.sessionNumber >= 3 && !task.isOptionalChoiceTask) {
        set({ nodeStrikes: { ...s.nodeStrikes, [task.targetNode]: 0 }, successStreak: s.successStreak + 1 });
        if (s.successStreak + 1 >= 3) {
          get().injectTask({
            id: `challenge_${task.id}_${Date.now()}`,
            type: task.type,
            titleHe: 'אתגר מצוינות (הזרקה)',
            instructionHe: 'מעולה! בואו נראה איך אתם מתמודדים עם אתגר במספרים מורכבים יותר:',
            targetNode: task.targetNode,
            numberA: task.numberA ? task.numberA * 10 : undefined,
            numberB: task.numberB ? task.numberB * 10 : undefined,
            isSubtraction: task.isSubtraction,
            requiresGrouping: task.requiresGrouping,
            requiresUngrouping: task.requiresUngrouping,
          }, 'next');
        }
      }
      
      if ((task.scaffoldLevel ?? 0) >= 1) {
        set({ scaffoldFadeLevel: Math.min(2, get().scaffoldFadeLevel + 1) });
      }
      
      showFeedback({ correct: true, title: feedbackTitle, sub: feedbackSub }, feedbackMs);
      advanceStandard();
    };

    if (task.type === 'session1_intro') {
      if (task.id === 's1_sandbox_controlled') {
        if (s.blocksAddedCount < 5 || !s.hasDeletedBlock) {
          handleFailure(
            'sandbox_incomplete',
            'עֲדַיִן לֹא הִשְׁלַמְתֶּם אֶת הַמְּשִׂימָה 🛠️',
            'יֵשׁ לִגְרֹר לְפָחוֹת 5 פְּרִיטִים לְבֵית הַמִּסְפָּרִים וּלִמְחֹק לְפָחוֹת פְּרִיט אֶחָד (לַפַּח אוֹ מִחוּץ לַלּוּחַ).',
            3500
          );
          return;
        }
        handleSuccess('כָּל הַכָּבוֹד! 🌟', 'הִשְׁלַמְתֶּם אֶת אִמּוּן אַרְגַּז הַחוֹל וְקִבַּלְתֶּם אֶת רִשְׁיוֹן הַחוֹקֵר!', 2500);
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
            'עֲדַיִן לֹא הִנַּחְתֶּם קֻבִּיּוֹת בְּבֵית הַמְּסִפָּרִים. גִּרְרוּ אֶת קֻבִּיּוֹת הַדִּינֶס כְּדֵי לִבְנוֹת אֶת הַמִּסְפָּר!',
            3500
          );
          return;
        }

        if (boardVal !== target) {
          handleFailure(
            'wrong_blocks',
            'מערכת המעבדה 🤔',
            'בואו נבדוק שוב את בית המספרים. הכמות של הקוביות שהנחתם אינה תואמת לתוצאת התרגיל.',
            3500
          );
          return;
        }

        const hasOvercrowded = s.counts.units >= 10 || s.counts.tens >= 10 || s.counts.hundreds >= 10;
        if (hasOvercrowded) {
          const title = 'בית המספרים לא מסודר 🧐';
          const msg = task.isSubtraction
            ? 'נראה שיש מעל 9 יחידות או עשרות בעמודה. בתרגילי חיסור, האם שכחתם לבצע פריטה או להחסיר קוביות כדי להגיע לתוצאה הסופית?'
            : 'נראה שיש מעל 9 יחידות או עשרות בעמודה. בתרגילי חיבור, יש לבצע המרה/קיבוץ כדי לסדר את בית המספרים בצורה תקנית!';
          handleFailure('overcrowded_columns', title, msg, 4000);
          return;
        }
      }

      const hasTypedDigits = Object.keys(s.answerDigits).some(
        (k) => s.answerDigits[k as Place] !== undefined && s.answerDigits[k as Place] !== ''
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

      const ansVal = answerDigitsToNumber(s.answerDigits);
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

      if (task.type === 'vertical_addition' && (task.requiresGrouping || task.requiresUngrouping)) {
        const hasCarriesEntered = Object.values(s.carryDigits).some((v) => v !== undefined && v !== '');
        if (!hasCarriesEntered) {
          showFeedback(
            {
              correct: true,
              title: 'שימו לב לתיבות הזיכרון 💡',
              sub: 'פתרתם נכון! זכרו שבתרגילי המרה ופריטה מומלץ להיעזר בחלוניות הזיכרון העליונות כדי לסמן את השאריות.',
            },
            3000,
            () => {
              advanceStandard();
            }
          );
          return;
        }
      }

      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'פְּתַרְתֶּם נָכוֹן וְיִצַּגְתֶּם זֹאת מְצֻיָּן בְּבֵית הַמְּסִפָּרִים.', 2500);
      return;
    }

    if (task.type === 'small_change') {
      if (!s.selectedChoiceId) return;
      if (s.selectedChoiceId !== task.correctAnswer) {
        handleFailure('wrong_choice', 'נסו שוב 🤔', 'התשובה שבחרתם אינה נכונה.', 2500);
        return;
      }
      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'תשובה נכונה.', 2500);
      return;
    }

    if (task.type === 'missing_element') {
      const answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
      if (answer === null || Number.isNaN(answer)) return;
      if (answer !== task.correctAnswer) {
        handleFailure('wrong_answer', 'נסו שוב 🤔', 'המספר שהזנתם אינו נכון.', 2500);
        return;
      }
      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'תשובה נכונה.', 2500);
      return;
    }

    if (task.type === 'flexible_decomp') {
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
      const authUser = useAuthStore.getState().user;
      const studentId = authUser?.uid || (authUser?.student_id ? `student_user${authUser.student_id}` : 'student_user1');
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
      showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! 🎉', sub: `מִפְגָּשׁ ${s.sessionNumber} הוּשְׁלַם בְּהַצְלָחָה!` }, 2500, () => {
        set({ flowStatus: 'sessionDone', awaitingNext: false });
      });
      return;
    }

    if (nextIdx < tasks.length) {
      // Module 19: Apply pending teacher support profile strictly at task boundary
      if (s.pendingSupportProfileId) {
        set({ activeSupportProfileId: s.pendingSupportProfileId, pendingSupportProfileId: null });
      }

      set({ standardTaskIdx: nextIdx, awaitingNext: false });
      const studentId = useAuthStore.getState().user?.uid || 'student_1';
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

      const nextTask = tasks[nextIdx];
      if (nextTask) {
        emitTelemetry({
          session_id: `session_${s.sessionNumber}_student_${studentId}`,
          student_id: studentId,
          exercise_id: nextTask.id,
          event_type: 'PROBLEM_LOAD',
          details: {
            exercise_template_id: nextTask.id,
            path_type: nextTask.isOptionalChoiceTask ? (s.selectedBranch === 'challenge' ? 'challenge' : 'consolidation') : 'compulsory',
          },
        }).catch(console.error);
      }

      startTask(tasks[nextIdx].id);
      return;
    }

    // Session complete
    const authUser = useAuthStore.getState().user;
    const studentId = authUser?.uid || (authUser?.student_id ? `student_user${authUser.student_id}` : 'student_user1');
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
    showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! 🎉', sub: `מִפְגָּשׁ ${s.sessionNumber} הוּשְׁלַם בְּהַצְלָחָה!` }, 2500, () => {
      set({ flowStatus: 'sessionDone', awaitingNext: false });
    });
  }

  /** Session-2 proceed (vanilla handleQTaskProceed, app.js 1112–1162). */
  function proceedQ() {
    const s = get();
    const task = getCurrentQTask(s.qflow);
    if (!task || s.awaitingNext) return;
    const subtask = isSubtaskActive(s.qflow);

    let answer: number | null = null;
    if (subtask) {
      answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
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

    const isCorrect = answer === task.correctAnswer;
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
      } else {
        get().resetConsecutiveErrors();
        const studentId = useAuthStore.getState().user?.uid || 'student_1';
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

    hasInteracted: false,
    undoTimestamps: [],
    isBoardLocked: false,
    hasRequestedBasicHelp: false,
    taskStartTime: Date.now(),
    hasDeletedBlock: false,
    blocksAddedCount: 0,
    consecutiveDeletions: 0,
    hasUngrouped: false,
    hasGrouped: false,
    selectedChoiceId: null,
    answerDigits: {},
    carryDigits: {},
    probeAnswer: '',
    q3Reps: [],

    feedback: null,
    feedbackNonce: 0,
    helpState: 'closed',
    frictionTriggerSource: null,
    aiSocraticHint: null,
    socraticDistractorHint: null,
    typedErrorCount: 0,
    hasDigitErrorInTask: false,
    socraticDistractorErrors: 0,
    lastInteractionTime: Date.now(),
    aiTasks: null,
    dynamicTasks: null,
    nodeStrikes: {},
    successStreak: 0,
    pendingSupportProfileId: null,
    activeSupportProfileId: null,
    activeDeviceId: null,
    isSupersededByOtherDevice: false,

    setActiveDeviceId: (id) => set({ activeDeviceId: id }),
    setSupersededByOtherDevice: (superseded) => set({ isSupersededByOtherDevice: superseded }),

    setPendingSupportProfile: (profileId) => {
      // Module 19: Stores pending support profile without altering the active workspace/board/keyboard state
      set({ pendingSupportProfileId: profileId });
    },

    setAITasks: (newTasks) => {
      set((state) => {
        if (!newTasks || newTasks.length === 0) return { aiTasks: newTasks };
        const currentActiveTasks = getActiveTasks(state);
        // PRD v7.0 Module 26: Apply changes exclusively to pending or unstarted worksheets to prevent workspace corruption during live sessions
        const currentIdx = state.standardTaskIdx;
        if (currentActiveTasks.length > 0 && currentIdx < currentActiveTasks.length) {
          const preservedCurrentAndPast = currentActiveTasks.slice(0, currentIdx + 1);
          const pendingUpdates = newTasks.slice(currentIdx + 1);
          return { aiTasks: [...preservedCurrentAndPast, ...pendingUpdates] };
        }
        return { aiTasks: newTasks };
      });
    },

    startSession: (meeting: number) => {
      get().initSession(sanitizeSessionNumber(meeting), get().isASD);
    },

    initSession: (meeting, isASD, initialAITasks, startingTaskIdx, existingDeadline) => {
      const sanitized = sanitizeSessionNumber(meeting);
      // Master PRD v6.4 Module 14: Sessions 3-7 are 15 min; Sessions 2 & 8 (and Session 1) are 25 min
      const durationMin = (sanitized >= 3 && sanitized <= 7) ? 15 : 25;

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
        aiTasks: initialAITasks ?? null,
        dynamicTasks: null,
        nodeStrikes: {},
        successStreak: 0,
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
        sessionStartTimeMs: Date.now(),
        isTimeExceeded: false,
        currentState: 'PROBLEM_ACTIVE',
        ...resetTaskInteraction(isASD),
      });

      const initialTask = sanitized === 2 ? getCurrentQTask(qflow) : getSessionTasks(sanitized as any)[startingTaskIdx ?? 0];
      const studentId = useAuthStore.getState().user?.uid || 'student_1';
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
      const branchTasks = getSessionBranchTasks(s.sessionNumber, branch);

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
      // Master PRD v6.4 Module 14: Sessions 3-7 are 15 min; Sessions 2 & 8 (and Session 1) are 25 min
      const durationMin = (sanitized >= 3 && sanitized <= 7) ? 15 : 25;
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
        aiTasks: saved.aiTasks ?? null,
        dynamicTasks: null,
        nodeStrikes: {},
        successStreak: 0,
        awaitingNext: false,
        boardOpen: true,
        keyboardState: saved.keyboardState ?? (saved.isASD ? 'LOCKED' : 'UNLOCKED'),
        scaffoldFadeLevel: 0,
        errorPlace: null,
        feedback: null,
        helpState: 'closed',
        frictionTriggerSource: null,
        isSocraticCardLocked: Boolean(storedDeadline && storedDeadline > Date.now()),
        socraticLockDeadline: storedDeadline,
        socraticDistractorHint: saved.socraticDistractorHint ?? null,
        selectedChoiceId: saved.selectedChoiceId ?? null,
        answerDigits: saved.answerDigits ?? {},
        carryDigits: saved.carryDigits ?? {},
        probeAnswer: saved.probeAnswer ?? '',
        q3Reps: saved.q3Reps ?? [],
        hasDeletedBlock: saved.standardTaskIdx === 0 && sanitized === 1 ? false : (saved.hasDeletedBlock ?? false),
        blocksAddedCount: saved.standardTaskIdx === 0 && sanitized === 1 ? 0 : (saved.blocksAddedCount ?? 0),
        focusedPlace: null,
        undoStack: saved.undoStack ?? [],
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
        const stack = [...s.undoStack, { counts: { ...s.counts }, actionType }];
        if (stack.length > UNDO_STACK_CAP) stack.shift();

        const studentId = useAuthStore.getState().user?.uid || 'student_1';
        const currentTask = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = currentTask?.id || `ex_${s.sessionNumber}_01`;

        const updatedTriggerTimestamps = { ...s.regroupTriggerTimestamps };

        if (isGroup || isUngroup) {
          get().transitionTo('REGROUPING_ACTIVE');
          const regroupCol = placeToColumnIndex(input.target.kind === 'column' ? input.target.place : (input.sourcePlace || 'units'));
          const regroupType = isUngroup ? 'decomposition' : 'composition';
          const triggerTime = s.regroupTriggerTimestamps?.[regroupCol];
          const durationMs = triggerTime ? Math.max(0, Date.now() - triggerTime) : null;
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
        if (!hasBlocks) return state;

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

        return { 
          counts: { ...EMPTY_COUNTS },
          undoStack,
          hasInteracted: true,
          hasDeletedBlock: true, 
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
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'REGROUPING_SUCCESS');

        const studentId = useAuthStore.getState().user?.uid || 'student_1';
        const task = getActiveTasks(state)[state.standardTaskIdx] || null;
        const sessionId = `session_${state.sessionNumber}_student_${studentId}`;
        const taskId = task?.id || `ex_${state.sessionNumber}_01`;
        const colIdx = placeToColumnIndex(place);

        const updatedTriggerTimestamps = { ...state.regroupTriggerTimestamps };
        const triggerTime = state.regroupTriggerTimestamps?.[colIdx];
        const durationMs = triggerTime ? Math.max(0, Date.now() - triggerTime) : null;
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
        const undoStack = createNextUndoStack(state.undoStack, state.counts, 'REGROUPING_SUCCESS');

        const studentId = useAuthStore.getState().user?.uid || 'student_1';
        const task = getActiveTasks(state)[state.standardTaskIdx] || null;
        const sessionId = `session_${state.sessionNumber}_student_${studentId}`;
        const taskId = task?.id || `ex_${state.sessionNumber}_01`;
        const colIdx = placeToColumnIndex(place);

        const updatedTriggerTimestamps = { ...state.regroupTriggerTimestamps };
        const triggerTime = state.regroupTriggerTimestamps?.[colIdx];
        const durationMs = triggerTime ? Math.max(0, Date.now() - triggerTime) : null;
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

        const studentId = useAuthStore.getState().user?.uid || 'student_1';
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = task?.id || `ex_${s.sessionNumber}_01`;
        const depthBefore = Math.min(10, Math.max(1, s.undoStack.length));
        const revertedType = snapshot.actionType || null;

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
            get().fetchSocraticHint();
            set({ helpState: 'socratic', currentState: 'SOCRATIC_ACTIVE' });
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

        const studentId = useAuthStore.getState().user?.uid || 'student_1';
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = task?.id || `ex_${s.sessionNumber}_01`;
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

            return {
              answerDigits: { ...s.answerDigits, [place]: val },
              hasInteracted: true,
              consecutiveDeletions: 0,
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

        if (val !== '' && s.helpState === 'socratic') {
          setTimeout(() => {
            if (get().helpState === 'socratic') {
              get().closeHelp();
            }
          }, 3000);
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
        const studentId = useAuthStore.getState().user?.uid || 'student_1';
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        const sessionId = `session_${s.sessionNumber}_student_${studentId}`;
        const taskId = task?.id || `ex_${s.sessionNumber}_01`;
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

        if (val !== '' && s.helpState === 'socratic') {
          setTimeout(() => {
            if (get().helpState === 'socratic') {
              get().closeHelp();
            }
          }, 3000);
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
      if (s.sessionNumber === 2) {
        const task = getCurrentQTask(s.qflow);
        target = task ? getEffectiveNumber(task, s.qflow, s.isASD) : undefined;
      } else {
        const tasks = getSessionTasks(s.sessionNumber);
        const task = tasks[s.standardTaskIdx];
        target = task?.numberA;
      }

      if (target !== undefined && value !== target) {
        const hint =
          s.sessionNumber === 2
            ? 'סריקת הרדאר מזהה שכמות הבלוקים בלוח אינה תואמת למבוקש. איך נוכל לשנות זאת כדי להגיע לכמות המדויקת?'
            : 'הסכום הנוכחי אינו תואם לערך היעד של הניסוי. נסו שוב!';
        showFeedback({ correct: false, title: 'מערכת המעבדה 🤔', sub: hint }, 3200);
        return;
      }
      
      if (s.sessionNumber === 1 && target === 20) {
        const is2Tens = s.counts.tens === 2 && s.counts.units === 0 && s.counts.hundreds === 0 && s.counts.thousands === 0;
        const is20Units = s.counts.units === 20 && s.counts.tens === 0 && s.counts.hundreds === 0 && s.counts.thousands === 0;
        if (!is2Tens && !is20Units) {
          showFeedback({ correct: false, title: 'בּוֹאוּ נְדַיֵּק אֶת הַמִּבְנֶה 🔍', sub: 'בְּנוּ אֶת הַמִּסְפָּר 20 בְּעֶזְרַת 2 עֲשָׂרוֹת, אוֹ בְּעֶזְרַת 20 יְחִידוֹת.' }, 3500);
          return;
        }
      }

      const q3Reps = [...s.q3Reps, { ...s.counts }];
      set({ q3Reps, hasInteracted: true });
      if (q3Reps.length < 2) {
        set({ counts: { ...EMPTY_COUNTS }, undoStack: [] });
      }
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
        
        const hint = await SocraticEngine.getSocraticHint(
          currentTask || {},
          targetNode,
          s.counts,
          traceData,
          false,
          s.activeColumnIndex || 0,
          recentActions
        );
        
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

    /** Help flow: lightbulb → 3s "productive metacognitive friction" → calibrated choice. */
    requestHelp: () => {
      const s = get();
      if (s.helpState !== 'closed') {
        set({ helpState: 'closed' });
        return;
      }
      if (s.sessionNumber === 2) {
        showFeedback({ correct: false, title: 'מפגש אבחון 📡', sub: 'במפגש אבחון זה עובדים באופן עצמאי ללא תמיכת רמזים.' }, 3000);
        return;
      }

      const currentTask = getActiveTasks(s)[s.standardTaskIdx];
      if (currentTask?.type === 'session1_intro' || currentTask?.id === 's1_sandbox_controlled') {
        showFeedback(
          { correct: true, title: 'טיפ 💡', sub: 'גרור לפחות 5 פריטים לבית המספרים ומחק פריט אחד לפח המחזור — כפתור "התקדם" ייפתח אוטומטית!' },
          5000
        );
        return;
      }
      
      const rawUser = useAuthStore.getState().user;
      if (rawUser?.uid && !s.isSupersededByOtherDevice) {
        const clean = rawUser.uid.trim().toLowerCase();
        const studentId = clean.startsWith('student_') ? clean : `student_${clean}`;
        AuditLogger.log('HINT_REQUESTED', studentId, 'Student clicked the hint lightbulb');

        const alertId = `${studentId}_help_${Date.now()}`;
        const helpKey = `help_${Date.now()}`;

        // Sync to Realtime DB: STRICT Zero PII — NO studentName / displayName!
        const studentHelpPayload = {
          helpRequested: true,
          handRaised: true,
          isStruggling: true,
          lastHelpTimestamp: Date.now(),
          lastAction: 'תלמיד לחץ על נורת העזרה!',
          last_alert: 'תלמיד לחץ על נורת העזרה!',
        };
        throttledRtdbUpdate(`users/students/${studentId}`, studentHelpPayload).catch(console.error);
        throttledRtdbUpdate(`users/students/${studentId}/helpHistory/${helpKey}`, {
          timestamp: Date.now(),
          sessionNumber: s.sessionNumber || 1,
          type: 'HINT_REQUESTED',
          message: 'תלמיד לחץ על נורת העזרה והחניכה!',
          status: 'pending'
        }).catch(console.error);
        update(ref(database, `radar_alerts/${alertId}`), {
          studentId: studentId,
          rawStudentId: studentId,
          timestamp: Date.now(),
          type: 'HESITATION',
          message: 'תלמיד לחץ על נורת העזרה!',
          severity: 'warning',
          persistent: true
        }).catch(console.error);
      }

      set({ helpState: 'friction', frictionTriggerSource: 'lightbulb', aiSocraticHint: null });
      get().transitionTo('SOCRATIC_ACTIVE');
      get().fetchSocraticHint();
    },

    helpFrictionDone: () => {
      const s = get();
      if (s.helpState === 'friction') {
        if (s.frictionTriggerSource === 'mistake') {
          set({ helpState: 'socratic' });
          get().transitionTo('SOCRATIC_ACTIVE');
        } else {
          set({ helpState: 'palette' });
        }
      }
    },

    chooseSupport: (type) => {
      const s = get();
      if (Date.now() - s.taskStartTime < 10000) return;
      if (type === 'worked_example' && (!s.hasRequestedBasicHelp || !s.hasInteracted)) {
        return;
      }
      if (type === 'socratic') {
        get().transitionTo('SOCRATIC_ACTIVE');
      }
      set({ 
        helpState: type,
        ...((type as string) !== 'worked_example' && (type as string) !== 'closed' ? { hasRequestedBasicHelp: true } : {})
      });
    },

    closeHelp: () => {
      set({ helpState: 'closed' });
      if (get().currentState === 'SOCRATIC_ACTIVE') {
        get().transitionTo('PROBLEM_ACTIVE');
      }
    },
    showFeedback,
    unlockKeyboard: () => set({ keyboardState: 'UNLOCKED' }),
    lockKeyboard: () => set({ keyboardState: 'LOCKED' }),
    openAdditionHelper: () => set({ isAdditionHelperOpen: true }),
    closeAdditionHelper: () => set({ isAdditionHelperOpen: false }),
    toggleAdditionHelper: () => set((s) => ({ isAdditionHelperOpen: !s.isAdditionHelperOpen })),
    setKeyboardSocratic: () => {
      if (get().sessionNumber === 2) return; // PRD v7.0 Module 12 & 14: Socratic card completely disabled in Session 2
      set((s) => ({
        keyboardState: 'SOCRATIC_ONLY',
        helpState: 'socratic',
        currentState: 'SOCRATIC_ACTIVE',
        aiSocraticHint: s.aiSocraticHint || DEFAULT_SOCRATIC_HINT
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

      const padDigits = (str: string): number => {
        const idx = colIdx - (cols - str.length);
        return idx >= 0 ? parseInt(str[idx], 10) : 0;
      };

      const da = padDigits(aStr);
      const db = padDigits(bStr);
      const carry = parseInt(s.carryDigits[place] || '0', 10);

      const requiresExchange = isSubtraction ? (da < db) : (da + db + carry >= 10);
      if (requiresExchange) {
        const conversionDone = isSubtraction ? s.hasUngrouped : s.hasGrouped;
        if (!conversionDone && !s.carryDigits[place]) {
          return true;
        }
      }
      return false;
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
        hasInteracted: false,
        undoTimestamps: [],
        isBoardLocked: false,
        hasRequestedBasicHelp: false,
        taskStartTime: Date.now(),
        hasDeletedBlock: false,
        blocksAddedCount: 0,
        consecutiveDeletions: 0,
        hasUngrouped: false,
        hasGrouped: false,
        selectedChoiceId: null,
        answerDigits: {},
        carryDigits: {},
        probeAnswer: '',
        q3Reps: [],
        feedback: null,
        feedbackNonce: 0,
        helpState: 'closed',
        frictionTriggerSource: null,
        aiSocraticHint: null,
        socraticDistractorHint: null,
        typedErrorCount: 0,
        socraticDistractorErrors: 0,
        lastInteractionTime: Date.now(),
        aiTasks: null,
        dynamicTasks: null,
        nodeStrikes: {},
        successStreak: 0,
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

    // Module 10 (30s) & Module 12 (45s): Pedagogical Hesitation Triggers
    tickHesitationTimer: () => {
      set((state) => {
        const nextSec = state.hesitationTimerSeconds + 1;
        const authUser = useAuthStore.getState().user;
        const supportProfile = (authUser as any)?.support_profile_id ?? (state as any).support_profile_id;
        const hasEnhancedSupport = supportProfile === 'enhanced_cognitive_support';
        const shouldOpenAddition = nextSec >= 30 && !state.isAdditionHelperOpen && state.sessionNumber !== 2 && state.sessionNumber !== 8 && hasEnhancedSupport;

        // Module 12: Trigger 1 — 45 seconds of hesitation triggers Socratic coach across ALL sessions (except session 2)
        const currentTask = selectStandardTask(state);
        const isSandbox = currentTask?.id === 's1_sandbox_controlled' || currentTask?.type === 'session1_intro';
        if (nextSec >= 45 && state.currentState !== 'SOCRATIC_ACTIVE' && !state.isSocraticCardLocked && state.sessionNumber !== 2 && !isSandbox) {
          setTimeout(() => {
            get().fetchSocraticHint();
            set({ helpState: 'socratic', currentState: 'SOCRATIC_ACTIVE' });
          }, 0);
        }
        return { 
          hesitationTimerSeconds: nextSec,
          hesitationCount: nextSec >= 45 ? state.hesitationCount + 1 : state.hesitationCount,
          ...(shouldOpenAddition ? { isAdditionHelperOpen: true } : {})
        };
      });
    },

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
        if (nextErrors >= 4 && state.currentState !== 'SOCRATIC_ACTIVE' && !state.isSocraticCardLocked && state.sessionNumber !== 2) {
          setTimeout(() => {
            get().fetchSocraticHint();
            set({ helpState: 'socratic', currentState: 'SOCRATIC_ACTIVE' });
          }, 0);
        }
        return { 
          consecutiveErrorCount: nextErrors, 
          typedErrorCount: state.typedErrorCount + 1, 
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
