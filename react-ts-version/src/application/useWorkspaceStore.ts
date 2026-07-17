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
import { computeCognitiveMastery } from '@/core/QMatrix';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { CurriculumRouter } from '@/core/CurriculumRouter';
import { QMatrixEvaluator } from '@/core/QMatrix';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';

const UNDO_STACK_CAP = 50;

export type SessionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type SupportType = 'metacognitive' | 'socratic' | 'worked_example';
export type HelpState = 'closed' | 'friction' | 'palette' | SupportType;
export type FlowStatus = 'task' | 'reflection' | 'sessionDone';

export interface FeedbackState {
  correct: boolean;
  title: string;
  sub?: string;
}

interface WorkspaceState {
  // session / flow
  sessionNumber: SessionNumber;
  isASD: boolean;
  standardTaskIdx: number;
  qflow: QMatrixFlowState;
  flowStatus: FlowStatus;
  awaitingNext: boolean;

  // board
  counts: PlaceCounts;
  undoStack: { counts: PlaceCounts }[];
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
  consecutiveUndos: number;
  isBoardLocked: boolean;
  hasRequestedBasicHelp: boolean;
  hasInteracted: boolean;
  hasDeletedBlock: boolean;
  blocksAddedCount: number; // Added to enforce the 5 block rule in Sandbox
  hasUngrouped: boolean;
  hasGrouped: boolean;
  selectedChoiceId: string | null;
  numberLineValue: number | null;
  answerDigits: Partial<Record<Place, string>>;
  carryDigits: Partial<Record<Place, string>>;
  probeAnswer: string;
  q3Reps: PlaceCounts[];
  aiSocraticHint: string | null;

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

  // actions
  injectTask: (task: SessionTask, position: 'next' | 'end') => void;
  initSession: (meeting: SessionNumber, isASD: boolean, aiTasks?: SessionTask[] | null, startingTaskIdx?: number) => void;
  restoreSession: (savedState: any) => void;
  applyDrop: (input: DropInput) => void;
  removeBlockClick: (place: Place) => void;
  undo: () => void;
  toggleBoard: () => void;
  setFocusedPlace: (place: Place | null) => void;
  selectChoice: (id: string) => void;
  setNumberLineValue: (v: number) => void;
  setAnswerDigit: (place: Place, val: string) => void;
  setCarryDigit: (place: Place, val: string) => void;
  setProbeAnswer: (v: string) => void;
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
}

/* ── Pure helpers ── */

function resetTaskInteraction() {
  return {
    counts: { ...EMPTY_COUNTS },
    undoStack: [] as { counts: PlaceCounts }[],
    hasInteracted: false,
    hasDeletedBlock: false,
    blocksAddedCount: 0,
    hasUngrouped: false,
    hasGrouped: false,
    selectedChoiceId: null as string | null,
    numberLineValue: null as number | null,
    answerDigits: {} as Partial<Record<Place, string>>,
    carryDigits: {} as Partial<Record<Place, string>>,
    probeAnswer: '',
    q3Reps: [] as PlaceCounts[],
    focusedPlace: null as Place | null,
    undoCount: 0,
    hesitationCount: 0,
    consecutiveUndos: 0,
    isBoardLocked: false,
    hasRequestedBasicHelp: false,
    taskStartTime: Date.now(),
  };
}

/**
 * Effective operands + result for an arithmetic task, ASD-aware.
 * The result is DERIVED from the displayed operands so the shown exercise and the
 * validated answer can never diverge (the ASD 12+14 vs 36 bug).
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
  return getSessionTasks(s.sessionNumber as any) ?? [];
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
    if (task.type === 'number_line') {
      return s.numberLineValue !== null;
    }
    if (task.type === 'addition_simple' || task.type === 'vertical_addition') {
      return answerDigitsToNumber(s.answerDigits) !== null;
    }
    return s.hasInteracted;
  }
  if (s.sessionNumber === 2) {
    const task = getCurrentQTask(s.qflow);
    if (!task) return false;
    if (!s.hasInteracted) return false;
    if ((task.type === 'place_value_zero' || task.type === 'small_change') && !s.selectedChoiceId) return false;
    if (task.type === 'number_line' && s.numberLineValue === null) return false;
    if (task.type === 'missing_element' && !s.probeAnswer) return false;
    if (task.type === 'vertical_addition') {
      const subtask = isSubtaskActive(s.qflow);
      if (subtask && !s.probeAnswer) return false;
      if (!subtask && answerDigitsToNumber(s.answerDigits) === null) return false;
    }
    return true;
  }
  const task = selectStandardTask(s);
  if (!task) return false;
  if (task.type === 'session1_intro') {
    // Choiceless exploration tasks (correctAnswer 'proceed_any') pass on any interaction;
    // question intros still require a selected choice.
    if (task.correctAnswer === 'proceed_any' || !task.choices?.length) {
      // Standard progress logic
      if (task.id === 's1_sandbox_controlled') {
        return s.blocksAddedCount >= 5 && s.hasDeletedBlock;
      }
      if (task.id === 's1_t3' && (!s.hasDeletedBlock || selectBoardValue(s) !== 50)) return false;
      if (task.id === 's1_t5' && (!s.hasUngrouped || selectBoardValue(s) !== 40)) return false;
      return s.hasInteracted;
    }
    return s.selectedChoiceId !== null;
  }
  if (task.type === 'flexible_decomp') {
    return s.q3Reps.length >= 2;
  }
  if (!s.hasInteracted) return false;
  // Phase 1: Progression Locks
  if (task.requiresGrouping && !s.hasGrouped) return false;
  if (task.requiresUngrouping && !s.hasUngrouped) return false;

  return true;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  /** Show feedback and auto-hide after ms (nonce-guarded against stale hides). */
  function showFeedback(feedback: FeedbackState, ms: number, then?: () => void) {
    const nonce = get().feedbackNonce + 1;
    set({ feedback, feedbackNonce: nonce });
    window.setTimeout(() => {
      if (get().feedbackNonce === nonce) set({ feedback: null });
      then?.();
    }, ms);
  }

  function pushSnapshot(counts: PlaceCounts) {
    const stack = [...get().undoStack, { counts: { ...counts } }];
    if (stack.length > UNDO_STACK_CAP) stack.shift();
    set({ undoStack: stack });
  }

  /** Flash a constraint violation on a column, then clear the tint (shake lasts 400ms). */
  function flagConstraintError(place: Place) {
    const nonce = get().errorNonce + 1;
    set({ errorPlace: place, errorNonce: nonce });
    window.setTimeout(() => {
      if (get().errorNonce === nonce) set({ errorPlace: null });
    }, 500);
  }

  function startTask(taskId: string) {
    set(resetTaskInteraction());

    // Auto-close the board if the incoming task is a number_line task
    const s = get();
    let isNumberLine = false;
    if (s.sessionNumber === 2) {
      isNumberLine = getCurrentQTask(s.qflow)?.type === 'number_line';
    } else {
      isNumberLine = selectStandardTask(s)?.type === 'number_line';
    }
    set({ boardOpen: !isNumberLine });
  }

  /** Session-2 transition script (vanilla onQTaskComplete, app.js 813–873). */
  function handleQFlowEvent(event: QFlowEvent) {
    const s = get();
    switch (event.type) {
      case 'primary_done':
        showFeedback({ correct: true, title: 'הַתְּשׁוּבָה הִתְקַבְּלָה! 👍', sub: 'עוֹבְרִים לַמְּשִׂימָה הַבָּאָה...' }, 1500, () => {
          const { state, event: next } = advance(get().qflow);
          set({ qflow: state });
          // awaitingNext stays true through the whole transition chain — released only
          // when the next task is actually live (prevents mid-transition clicks being eaten).
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
          set({ flowStatus: 'reflection', awaitingNext: false });
          // Curriculum Router trigger (uid is the ONE canonical identity field)
          const studentId = useAuthStore.getState().user?.uid;
          if (studentId) {
            const store = useStore.getState();
            store.markMeeting2Complete(studentId);
            const student = store.students[studentId];
            if (student) {
              // Route from the REAL diagnostics of this run — useStore's seeded
              // qMatrixResults/traceData are never written by live code, so routing
              // from them made every student 'GREEN' regardless of performance.
              const r = get().qflow.results;
              const getTag = (taskResult: any) => {
                if (!taskResult) return null;
                if (taskResult.tag) return taskResult.tag;
                if (taskResult.correct) return 'success';
                return null;
              };
              
              const realQMatrix = {
                task1_zero_placeholder: getTag(r['task1_zero_placeholder']),
                task2_estimation_error_margin: getTag(r['task2_estimation_error_margin']),
                task3_flexible_regrouping: getTag(r['task3_flexible_regrouping']),
                task4_basic_addition_fluency: getTag(r['task4_basic_addition_fluency']),
                task5_small_change: getTag(r['task5_small_change']),
                task6_subtraction_regrouping: getTag(r['task6_subtraction_regrouping']),
                task7_missing_subtrahend: getTag(r['task7_missing_subtrahend']),
                task8_missing_addend: getTag(r['task8_missing_addend']),
              };
              // Persist truth so the dashboard clustering reflects this student too.
              store.updateQMatrix(studentId, realQMatrix);
              
              const mastery = computeCognitiveMastery(realQMatrix);
              store.updateConceptMastery(studentId, mastery);

              const realTraceData = { hesitation_events: get().hesitationCount, undo_clicks: get().undoCount };
              store.updateTraceData(studentId, realTraceData);
              const route = CurriculumRouter.evaluateRoute({
                ...student,
                qMatrixResults: { ...student.qMatrixResults, ...realQMatrix },
                conceptMastery: mastery,
                traceData: realTraceData,
              });
              store.setRouteRecommendation(studentId, route);
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
      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        let errorCategory: 'FACTUAL_ERROR' | 'PROCEDURAL_ERROR' | 'STRATEGIC_ERROR' = 'FACTUAL_ERROR';
        if (detail.includes('overcrowded_columns') || detail.includes('wrong_blocks')) {
          errorCategory = 'PROCEDURAL_ERROR';
        } else if (detail.includes('no_choice') || detail.includes('canonical_fixation')) {
          errorCategory = 'STRATEGIC_ERROR';
        }
        AuditLogger.log(errorCategory, studentId, `Task: ${task.id}, Detail: ${detail}`);
      }

      if (task.targetNode && s.sessionNumber >= 3) {
        const strikes = (s.nodeStrikes[task.targetNode] || 0) + 1;
        set({ nodeStrikes: { ...s.nodeStrikes, [task.targetNode]: strikes }, successStreak: 0 });
        
        if (strikes === 1) {
          // Micro-Agility: Socratic Buffer
          set({ helpState: 'friction', frictionTriggerSource: 'mistake' });
        } else if (strikes >= 2) {
          // Micro-Agility: Decoupled Vector Scaling
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
      set({ awaitingNext: true });
      if (task.targetNode && s.sessionNumber >= 3) {
        set({ nodeStrikes: { ...s.nodeStrikes, [task.targetNode]: 0 }, successStreak: s.successStreak + 1 });
        if (s.successStreak + 1 >= 3) {
          // Micro-Agility: Cognitive Acceleration
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
      
      // Scaffold fading (UDL): fade a step on success for scaffolded tasks; capped at 2 by design decision.
      if ((task.scaffoldLevel ?? 0) >= 1) {
        set({ scaffoldFadeLevel: Math.min(2, get().scaffoldFadeLevel + 1) });
      }
      
      showFeedback({ correct: true, title: feedbackTitle, sub: feedbackSub }, feedbackMs, () => {
        advanceStandard();
      });
    };

    if (task.type === 'session1_intro') {
      // Choiceless exploration tasks ('proceed_any'): any interaction passes — no question to answer.
      if (task.correctAnswer === 'proceed_any' || !task.choices?.length) {
        
        // Strict verification for specific tutorial tasks to ensure pedagogical compliance
        if (task.id === 's1_sandbox_controlled') {
          if (!s.hasDeletedBlock) {
            showFeedback({ correct: false, title: 'עוד לא סיימנו', sub: 'אנא ודאו שגררתם בלוקים ומחקתם לפחות בלוק אחד בעזרת פח המחזור.' }, 3000);
            return;
          }
        }

        handleSuccess('מעולה! 🌟', 'ממשיכים הלאה.', 1500);
        return;
      }
      if (!s.selectedChoiceId) {
        handleFailure('no_choice', 'עֲנוּ עַל שְׁאֵלַת הַחֲשִׁיבָה 🤔', 'בַּחֲרוּ אַחַת מֵהָאֶפְשָׁרֻיּוֹת כְּדֵי לְהַמְשִׁיךְ.', 2500);
        return;
      }
      if (s.selectedChoiceId !== task.correctAnswer) {
        handleFailure('wrong_choice', 'בּוֹאוּ נַחְשֹׁב שׁוּב 🤔', 'הַאִם הוֹסַפְנוּ אוֹ גָּרַעְנוּ קֻבִּיּוֹת כָּלְשֵׁהֵן מִבֵּית הַמִּסְפָּרִים?', 2800);
        return;
      }
      // Correct — vanilla text carried a "(100)" copy bug; ported without the number.
      handleSuccess('נָכוֹן מְאוֹד! 🌟', 'הָעֵרֶךְ נִשְׁאַר זֶהֶה לַחֲלוּטִין כִּי לֹא שִׁנִּינוּ אֶת הַכַּמּוּת הַכּוֹלֶלֶת.', 2500);
      return;
    }
    if (task.type === 'addition_simple' || task.type === 'vertical_addition') {
      // Target derived from the DISPLAYED (ASD-aware) operands — never from a hardcoded
      // correctAnswer that could mismatch the shown exercise.
      const { target } = effectiveArithmetic(task, s.isASD);
      // Gate 1: the blocks must represent the result (forced manipulative representation).
      if (s.sessionNumber !== 8) {
        if (selectBoardValue(s) !== target) {
          handleFailure('wrong_blocks', 'מערכת המעבדה 🤔', 'בואו נבדוק שוב את הלוח. האם הכמות של הקוביות שהנחתם תואמת בדיוק למה שמופיע בניסוי?', 3500);
          return;
        }
        // Gate 1.5: the representation must be canonical (properly grouped) at submission.
        const hasOvercrowded = s.counts.units >= 10 || s.counts.tens >= 10;
        if (hasOvercrowded) {
          const title = 'לוח לא תקין 🧐';
          const msg = task.isSubtraction
            ? 'נראה שיש מעל 9 יחידות או עשרות בעמודה. בתרגילי חיסור, האם שכחתם לבצע פריטה או להחסיר קוביות כדי להגיע לתוצאה הסופית?'
            : 'נראה שיש מעל 9 יחידות או עשרות בעמודה. בתרגילי חיבור, יש לבצע המרה/קיבוץ כדי לסדר את הלוח בצורה תקנית!';
          handleFailure('overcrowded_columns', title, msg, 4000);
          return;
        }
      }
      // Gate 2: the written answer must match.
      const ansVal = answerDigitsToNumber(s.answerDigits);
      if (ansVal !== target) {
        handleFailure('wrong_numeric', 'כִּמְעַט... 🧐', 'הַתְּשׁוּבָה שֶׁכְּתַבְתֶּם אֵינָהּ זֵהָה לְסַךְ הַקֻּבִּיּוֹת בַּטַּבְלָה. בִּדְקוּ שׁוּב!', 2800);
        return;
      }
      // Gate 3: pedagogical progression compliance (grouping/ungrouping actions)
      // Removed hard-blocks: UDL dictates we shouldn't force the concrete action if they got the right answer.
      // The AI and radar will analyze `s.hasGrouped` in the trace data to assess procedural fluency.

      // All gates passed.
      handleSuccess('כָּל הַכָּבוֹד! 🌟', 'פְּתַרְתֶּם נָכוֹן וְיִצַּגְתֶּם זֹאת מְצֻיָּן בְּבֵית הַמִּסְפָּרִים.', 2500);
      return;
    }

    if (task.type === 'number_line') {
      if (s.numberLineValue === null) return;
      const target = task.numberA ?? 0;
      if (s.sessionNumber === 8) {
        const correct = s.numberLineValue === target;
        if (!correct) {
          handleFailure('wrong_answer', 'נסו שוב 🤔', 'התשובה שהזנתם אינה נכונה.', 2500);
          return;
        }
        handleSuccess('מְעֻלֶּה! 🌟', 'פתרתם נכון.', 2500);
        return;
      }
      const range = task.range ?? [0, 100];
      const rangeSize = range[1] - range[0];
      const deviation = Math.abs(s.numberLineValue - target);
      const deviationPct = deviation / rangeSize;
      const correct = deviationPct <= 0.07;
      if (!correct) {
        handleFailure(`deviation_${Math.round(deviationPct * 100)}pct`, 'נסו שוב 🤔', 'החץ רחוק מדי מהמיקום המבוקש.', 2500);
        return;
      }
      handleSuccess('מְעֻלֶּה! 🌟', 'מִקַּמְתֶּם אֶת הַחֵץ בַּמָּקוֹם הַנָּכוֹן.', 2500);
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

    // Fallback if none matched
    handleSuccess('כָּל הַכָּבוֹד! 🌟', 'המשך לשלב הבא.', 2500);
  }

  function advanceStandard() {
    const s = get();
    const tasks = getActiveTasks(s);
    const nextIdx = s.standardTaskIdx + 1;

    if (nextIdx < tasks.length) {
      set({ standardTaskIdx: nextIdx, awaitingNext: false });
      startTask(tasks[nextIdx].id);
      return;
    }

    // Session complete (vanilla auto-chains 1→2 and 3→4).
    const studentId = useAuthStore.getState().user?.uid;
    if (studentId) {
      useStore.getState().updateHighestCompletedMeeting(studentId, s.sessionNumber);
    }

    if (s.sessionNumber === 1) {
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! מִפְגָּשׁ 1 הוּשְׁלַם בְּהַצְלָחָה! 🎉', sub: 'עוֹבְרִים כָּעֵת אוֹטוֹמָטִית לְמִפְגָּשׁ 2...' }, 2500, () => {
        get().initSession(2, get().isASD);
      });
    } else {
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! 🎉', sub: 'הִצְלַחְתֶּם בַּמְּשִׂימָה! נַעֲבֹר לַמְּשִׂימָה הַבָּאָה...' }, 2500, () => {
        set({ flowStatus: 'sessionDone', awaitingNext: false });
      });
    }
  }

  /** Session-2 proceed (vanilla handleQTaskProceed, app.js 1112–1162). */
  function proceedQ() {
    const s = get();
    const task = getCurrentQTask(s.qflow);
    if (!task || s.awaitingNext) return;
    const subtask = isSubtaskActive(s.qflow);

    let evalResult: { correct: boolean; detail: string } | null = null;

    switch (task.type) {
      case 'place_value_zero': {
        if (!s.selectedChoiceId) return;
        const r = QMatrixEvaluator.evaluateQ1(task, s.selectedChoiceId, s.counts, s.qflow.phase, s.qflow.subphase, s.isASD);
        evalResult = { correct: r.correct, detail: r.detail };
        break;
      }
      case 'number_line': {
        if (s.numberLineValue === null) return;
        const r = QMatrixEvaluator.evaluateQ2(task, s.numberLineValue, s.qflow.phase, s.qflow.subphase, s.isASD);
        evalResult = { correct: r.correct, detail: r.detail };
        break;
      }
      case 'flexible_decomp': {
        if (s.q3Reps.length < 2) {
          showFeedback({ correct: false, title: 'נִדְרָשִׁים שְׁנֵי יִצּוּגִים שׁוֹנִים', sub: 'הוֹסִיפוּ יִצּוּג שֵׁנִי!' }, 1800);
          return;
        }
        const r = QMatrixEvaluator.evaluateQ3(task, s.q3Reps, s.qflow.phase, s.qflow.subphase, s.isASD);
        evalResult = { correct: r.correct, detail: r.detail };
        break;
      }
      case 'vertical_addition': {
        const answer = subtask ? (s.probeAnswer ? parseInt(s.probeAnswer, 10) : null) : answerDigitsToNumber(s.answerDigits);
        if (answer === null || Number.isNaN(answer)) return;
        const r = QMatrixEvaluator.evaluateQ4(task, answer, s.qflow.phase, s.qflow.subphase, s.isASD);
        evalResult = { correct: r.correct, detail: r.detail };
        break;
      }
      case 'small_change': {
        if (!s.selectedChoiceId) return;
        const r = QMatrixEvaluator.evaluateQ5(task, s.selectedChoiceId, s.qflow.phase, s.qflow.subphase);
        evalResult = { correct: r.correct, detail: r.detail };
        break;
      }
      case 'missing_element': {
        const answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
        if (answer === null || Number.isNaN(answer)) return;
        const r = QMatrixEvaluator.evaluateQ7(task, answer, s.qflow.phase, s.qflow.subphase, s.isASD);
        evalResult = { correct: r.correct, detail: r.detail };
        break;
      }
    }

    if (evalResult) {
      if (!evalResult.correct) {
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
      }
      set({ awaitingNext: true });
      const { state, event } = recordResult(s.qflow, evalResult);
      set({ qflow: state });
      handleQFlowEvent(event);
    }
  }

  return {
    sessionNumber: 1,
    isASD: false,
    standardTaskIdx: 0,
    qflow: initQFlow(),
    flowStatus: 'task',
    awaitingNext: false,

    counts: { ...EMPTY_COUNTS },
    undoStack: [],
    undoCount: 0,
    hesitationCount: 0,
    boardOpen: true,
    scaffoldFadeLevel: 0,
    errorPlace: null,
    errorNonce: 0,
    focusedPlace: null,

    hasInteracted: false,
    consecutiveUndos: 0,
    isBoardLocked: false,
    hasRequestedBasicHelp: false,
    taskStartTime: Date.now(),
    hasDeletedBlock: false,
    blocksAddedCount: 0,
    hasUngrouped: false,
    hasGrouped: false,
    selectedChoiceId: null,
    numberLineValue: null,
    answerDigits: {},
    carryDigits: {},
    probeAnswer: '',
    q3Reps: [],

    feedback: null,
    feedbackNonce: 0,
    helpState: 'closed',
    frictionTriggerSource: null,
    aiSocraticHint: null,
    aiTasks: null,
    dynamicTasks: null,
    nodeStrikes: {},
    successStreak: 0,

    setAITasks: (tasks) => set({ aiTasks: tasks }),

    initSession: (meeting, isASD, initialAITasks, startingTaskIdx) => {
      const qflow = initQFlow();
      set({
        sessionNumber: meeting,
        isASD,
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
        ...resetTaskInteraction(),
      });
      const firstId = meeting === 2 ? getCurrentQTask(qflow)?.id ?? '' : (initialAITasks ?? getSessionTasks(meeting as any))[startingTaskIdx ?? 0]?.id ?? '';
    },

    restoreSession: (saved) => {
      if (!saved) return;
      set({
        sessionNumber: saved.sessionNumber ?? 1,
        isASD: saved.isASD ?? false,
        standardTaskIdx: saved.standardTaskIdx ?? 0,
        qflow: saved.qflow ?? initQFlow(),
        flowStatus: saved.flowStatus ?? 'task',
        counts: saved.counts ?? { ...EMPTY_COUNTS },
        undoCount: saved.undoCount ?? 0,
        hesitationCount: saved.hesitationCount ?? 0,
        hasInteracted: saved.hasInteracted ?? false,
        taskStartTime: saved.taskStartTime ?? Date.now(),
        aiTasks: saved.aiTasks ?? null,
        dynamicTasks: null,
        nodeStrikes: {},
        successStreak: 0,
        awaitingNext: false,
        boardOpen: true,
        scaffoldFadeLevel: 0,
        errorPlace: null,
        feedback: null,
        helpState: 'closed',
        frictionTriggerSource: null,
        selectedChoiceId: null,
        numberLineValue: null,
        answerDigits: {},
        carryDigits: {},
        probeAnswer: '',
        q3Reps: [],
        focusedPlace: null,
        undoStack: [],
      });
      const s = get();
      const firstId = s.sessionNumber === 2 ? getCurrentQTask(s.qflow)?.id ?? '' : (s.aiTasks ?? getSessionTasks(s.sessionNumber as any))[s.standardTaskIdx ?? 0]?.id ?? '';
    },

    injectTask: (task, position) => {
      const s = get();
      if (s.sessionNumber === 2) return; // Q-Matrix engine handles its own flow

      // Initialize dynamicTasks from current active tasks if null
      const currentTasks = s.dynamicTasks ? [...s.dynamicTasks] : [...getActiveTasks(s)];
      
      if (position === 'next') {
        currentTasks.splice(s.standardTaskIdx + 1, 0, task);
      } else {
        currentTasks.push(task);
      }
      
      set({ dynamicTasks: currentTasks });
    },

    applyDrop: (input) => {
      const s = get();
      if (s.isBoardLocked) return;
      const result = resolveDrop(s.counts, input, selectScaffoldLevel(s));
      if (!result.ok) {
        if (result.reason === 'constraint') flagConstraintError(result.place);
        
        // Log semantic event for invalid drop
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
        return;
      }
      pushSnapshot(s.counts);
      const isDelete = result.removed && input.target.kind === 'trash';
      const isUngroup = !!result.ungroupEvent;
      const isGroup = result.regroupEvents && result.regroupEvents.length > 0;
      const isFromStore = input.source === 'palette';
      const addedCount = isFromStore ? (s.blocksAddedCount + 1) : s.blocksAddedCount;

      set({ 
        counts: result.counts, 
        hasInteracted: true,
        consecutiveUndos: 0,
        blocksAddedCount: addedCount,
        undoCount: isDelete ? s.undoCount + 1 : s.undoCount,
        ...(isDelete ? { hasDeletedBlock: true } : {}),
        ...(isUngroup ? { hasUngrouped: true } : {}),
        ...(isGroup ? { hasGrouped: true } : {})
      });
      
      // Only a TRASH drop is a delete. Manual regrouping also sets `removed` (blocks leave
      // the source column) — counting it fired false PASSIVE_DRIFTING radar alerts after
      // three quick regroups, flagging exactly the students doing the RIGHT thing.

      // Log semantic event for valid drop
      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        let action = 'drag_moved';
        if (isDelete) action = 'drag_deleted';
        else if (isFromStore) action = 'drag_added';
        else if (isGroup) action = 'drag_grouped';
        else if (isUngroup) action = 'drag_ungrouped';
        
        useStore.getState().logSemanticEvent(studentId, {
          action,
          element: isFromStore ? `palette_block` : `${input.sourcePlace}_block`,
          target: input.target.kind === 'column' ? `${input.target.place}_column` : 'trash',
          context: action,
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Units: ${result.counts.units}, Tens: ${result.counts.tens}, Hundreds: ${result.counts.hundreds}, Thousands: ${result.counts.thousands}`
        });
      }
    },

    removeBlockClick: (place) => {
      const s = get();
      if (s.isBoardLocked) return;
      const next = removeBlock(s.counts, place);
      if (!next) {
        flagConstraintError(place);
        return;
      }
      pushSnapshot(s.counts);
      set({ 
        counts: next, 
        hasInteracted: true, 
        hasDeletedBlock: true, 
        undoCount: s.undoCount + 1,
        consecutiveUndos: 0 
      });

      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'block_clicked_to_remove',
          element: `${place}_block`,
          context: `Removed a block from ${place}`,
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Units: ${next.units}, Tens: ${next.tens}, Hundreds: ${next.hundreds}, Thousands: ${next.thousands}`
        });
      }
    },

    undo: () => {
      const s = get();
      if (s.isBoardLocked) return;

      const newConsecutiveUndos = s.consecutiveUndos + 1;
      
      if (newConsecutiveUndos >= 3) {
        set({ isBoardLocked: true, consecutiveUndos: newConsecutiveUndos });
        s.showFeedback({ 
          correct: false, 
          title: 'בואו נעצור לרגע...', 
          sub: 'נראה שאתם צריכים עזרה. נסו לבקש רמז!' 
        }, 5000, () => {
          set({ isBoardLocked: false, consecutiveUndos: 0 });
        });
        return;
      }

      const stack = [...s.undoStack];
      const snapshot = stack.pop();
      if (!snapshot) {
        set({ consecutiveUndos: newConsecutiveUndos });
        return;
      }
      
      set({ 
        counts: snapshot.counts, 
        undoStack: stack, 
        undoCount: s.undoCount + 1,
        consecutiveUndos: newConsecutiveUndos 
      });

      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'undo',
          element: 'undo_button',
          context: 'User clicked undo',
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Units: ${snapshot.counts.units}, Tens: ${snapshot.counts.tens}, Hundreds: ${snapshot.counts.hundreds}, Thousands: ${snapshot.counts.thousands}`
        });
      }
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

    setNumberLineValue: (v) => {
      set({ numberLineValue: v, hasInteracted: true });

      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const s = get();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'number_line_drag',
          element: 'number_line_thumb',
          context: `Value: ${v}`,
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `NumberLine Value: ${v}`
        });
      }
    },

    setAnswerDigit: (place, val) => {
      set((s) => ({ answerDigits: { ...s.answerDigits, [place]: val }, hasInteracted: true }));
      
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
      set((s) => ({ carryDigits: { ...s.carryDigits, [place]: val }, hasInteracted: true }));

      const studentId = useAuthStore.getState().user?.uid;
      if (studentId) {
        const s = get();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'carry_changed',
          element: `carry_digit_${place}`,
          context: val ? `Typed carry ${val} in ${place}` : `Cleared carry in ${place}`,
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Current carries: ${JSON.stringify(s.carryDigits)}, Board Value: ${selectBoardValue(s)}`
        });
      }
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
      
      // Strict structural validation for the tutorial task s1_t4 (2 tens, or 20 units)
      if (s.sessionNumber === 1 && target === 20) {
        const is2Tens = s.counts.tens === 2 && s.counts.units === 0 && s.counts.hundreds === 0 && s.counts.thousands === 0;
        const is20Units = s.counts.units === 20 && s.counts.tens === 0 && s.counts.hundreds === 0 && s.counts.thousands === 0;
        if (!is2Tens && !is20Units) {
          showFeedback({ correct: false, title: 'לֹא לְפִי הַהוֹרָאוֹת', sub: 'עֲלֵיכֶם לִבְנוֹת אֶת הַמִּסְפָּר 20 מִ-2 עֲשָׂרוֹת בִּלְבַד, אוֹ מִ-20 יְחִידוֹת בִּלְבַד.' }, 3500);
          return;
        }
      }

      const q3Reps = [...s.q3Reps, { ...s.counts }];
      set({ q3Reps, hasInteracted: true });
      // Reset the board for the next representation (vanilla resets below 2).
      if (q3Reps.length < 2) {
        set({ counts: { ...EMPTY_COUNTS }, undoStack: [] });
      }
    },

    /** "החזרת עזרים" (spec M4, Responsive Fading): the student may temporarily bring
        faded scaffolds back to full visibility when hitting a new difficulty. */
    restoreScaffolds: () => {
      set({ scaffoldFadeLevel: 0 });
    },

    /** Q3 backward-diagnosis guided demo: decompose one ten into 10 units. */
    demoUngroup: () => {
      const s = get();
      const result = resolveDrop(s.counts, { source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } }, selectScaffoldLevel(s));
      if (result.ok) {
        pushSnapshot(s.counts);
        set({ counts: result.counts, hasInteracted: true, hasUngrouped: true });
      }
    },

    markInteracted: () => set(() => ({ hasInteracted: true })),

    proceed: () => {
      const s = get();
      if (s.awaitingNext || s.flowStatus !== 'task' || !selectCanProceed(s)) return;
      if (s.sessionNumber === 2) proceedQ();
      else proceedStandard();
    },

    fetchSocraticHint: async () => {
      const s = get();
      if (s.aiSocraticHint !== null) return; // Already fetched
      
      const currentTask = getActiveTasks(s)[s.standardTaskIdx];
      if (!currentTask || !currentTask.targetNode) return;
      
      try {
        const { httpsCallable } = await import('firebase/functions');
        const { functions } = await import('@/infrastructure/firebase');
        
        const generateHint = httpsCallable(functions, 'generateSocraticHint');
        const traceData = {
          undo_clicks: s.undoCount,
          hesitation_events: s.hesitationCount,
        };
        
        // Timeout using Promise.race (since httpsCallable itself doesn't take an abort signal trivially)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 5000)
        );
        
        const callPromise = generateHint({
          counts: s.counts,
          currentTask,
          targetNode: currentTask.targetNode,
          traceData
        });
        
        const result = await Promise.race([callPromise, timeoutPromise]) as any;
        set({ aiSocraticHint: result.data.hint });
      } catch (error) {
        console.error("LLM Socratic Hint failed or timed out. Falling back to static hints.", error);
        set({ aiSocraticHint: null });
      }
    },

    /** Help flow: lightbulb → 3s "productive metacognitive friction" → calibrated choice. */
    requestHelp: () => {
      const s = get();
      if (s.helpState !== 'closed') return;
      if (Date.now() - s.taskStartTime < 10000) return; // 10s delay before help is available
      set({ helpState: 'friction', frictionTriggerSource: 'lightbulb', aiSocraticHint: null });
      get().fetchSocraticHint();
    },

    helpFrictionDone: () => {
      const s = get();
      if (s.helpState === 'friction') {
        if (s.frictionTriggerSource === 'mistake') {
          set({ helpState: 'socratic' });
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
      set({ 
        helpState: type,
        ...((type as string) !== 'worked_example' && (type as string) !== 'closed' ? { hasRequestedBasicHelp: true } : {})
      });
    },
    closeHelp: () => set({ helpState: 'closed' }),
    showFeedback,
  };
});

/* Re-exports used by components */
export { getCurrentQTask, getEffectiveChoices, getEffectiveNumber, getExpectedBlocks, isSubtaskActive };

/* Dev-only test hook: lets E2E scripts drive the store deterministically. Stripped from prod builds. */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__wsStore = useWorkspaceStore;
}
