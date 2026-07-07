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
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { CurriculumRouter } from '@/core/CurriculumRouter';
import { QMatrixEvaluator } from '@/core/QMatrix';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { radar } from '@/features/workspace/radarBus';

const UNDO_STACK_CAP = 50;

export type SessionNumber = 1 | 2 | 3 | 4;
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
  packagedBlocks: PlaceCounts;
  undoStack: { counts: PlaceCounts; packagedBlocks: PlaceCounts }[];
  undoCount: number;
  /** Covert hesitation counter (radar) — mirrored to traceData at reflection. */
  hesitationCount: number;
  boardOpen: boolean;
  scaffoldFadeLevel: number;
  errorPlace: Place | null;
  errorNonce: number;
  focusedPlace: Place | null;

  // per-task interaction
  hasInteracted: boolean;
  selectedChoiceId: string | null;
  numberLineValue: number | null;
  answerDigits: Partial<Record<Place, string>>;
  probeAnswer: string;
  q3Reps: PlaceCounts[];

  // overlays
  feedback: FeedbackState | null;
  feedbackNonce: number;
  helpState: HelpState;

  /** Teacher-approved AI-generated task list (Socratic Engine); overrides session tasks when set. */
  aiTasks: SessionTask[] | null;

  // actions
  initSession: (meeting: SessionNumber, isASD: boolean, aiTasks?: SessionTask[] | null) => void;
  applyDrop: (input: DropInput) => void;
  removeBlockClick: (place: Place) => void;
  packageBlocks: (place: Place) => void;
  undo: () => void;
  toggleBoard: () => void;
  setFocusedPlace: (place: Place | null) => void;
  selectChoice: (id: string) => void;
  setNumberLineValue: (v: number) => void;
  setAnswerDigit: (place: Place, v: string) => void;
  setProbeAnswer: (v: string) => void;
  /** "החזרת עזרים" — bidirectional scaffold fading per spec: temporarily restore faded aids. */
  restoreScaffolds: () => void;
  addRepresentation: () => void;
  demoUngroup: () => void;
  skipTutorial: () => void;
  proceed: () => void;
  requestHelp: () => void;
  helpFrictionDone: () => void;
  chooseSupport: (type: SupportType) => void;
  closeHelp: () => void;
  setAITasks: (tasks: SessionTask[] | null) => void;
  showFeedback: (feedback: FeedbackState, ms: number, then?: () => void) => void;
}

/* ── Pure helpers ── */

function resetTaskInteraction() {
  return {
    counts: { ...EMPTY_COUNTS },
    packagedBlocks: { ...EMPTY_COUNTS },
    undoStack: [] as { counts: PlaceCounts; packagedBlocks: PlaceCounts }[],
    hasInteracted: false,
    selectedChoiceId: null as string | null,
    numberLineValue: null as number | null,
    answerDigits: {} as Partial<Record<Place, string>>,
    probeAnswer: '',
    q3Reps: [] as PlaceCounts[],
    focusedPlace: null as Place | null,
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
  // (Calling getSessionTasks(2) returned undefined and crashed the topbar.)
  if (s.sessionNumber === 2) return [];
  if (s.sessionNumber === 3 && s.aiTasks) return s.aiTasks;
  return getSessionTasks(s.sessionNumber as 1 | 3 | 4) ?? [];
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
    if (task.correctAnswer === 'proceed_any' || !task.choices?.length) return s.hasInteracted;
    return s.selectedChoiceId !== null;
  }
  if (!s.hasInteracted) return false;
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

  function pushSnapshot(counts: PlaceCounts, packagedBlocks: PlaceCounts) {
    const stack = [...get().undoStack, { counts: { ...counts }, packagedBlocks: { ...packagedBlocks } }];
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
    radar.setTask(taskId);
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
              const realTraceData = { hesitation_events: get().hesitationCount, undo_clicks: get().undoCount };
              store.updateTraceData(studentId, realTraceData);
              const route = CurriculumRouter.evaluateRoute({
                ...student,
                qMatrixResults: { ...student.qMatrixResults, ...realQMatrix },
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

    if (task.type === 'session1_intro') {
      // Choiceless exploration tasks ('proceed_any'): any interaction passes — no question to answer.
      if (task.correctAnswer === 'proceed_any' || !task.choices?.length) {
        
        // Strict verification for specific tutorial tasks to ensure pedagogical compliance
        if (task.id === 's1_t3' && selectBoardValue(s) !== 50) {
          showFeedback({ correct: false, title: 'רגע, עדיין אין פה 50', sub: 'אנא ודאו שבניתם בדיוק 50 באמצעות הקוביות לפני שתמשיכו.' }, 3000);
          return;
        }
        if (task.id === 's1_t5' && selectBoardValue(s) !== 40) {
          showFeedback({ correct: false, title: 'היזהרו לא לאבד ערך', sub: 'אנא ודאו שבניתם בדיוק 40 (גם לאחר הפריטה) לפני שתמשיכו.' }, 3000);
          return;
        }

        set({ awaitingNext: true });
        showFeedback({ correct: true, title: 'מעולה! 🌟', sub: 'ממשיכים הלאה.' }, 1500, () => {
          advanceStandard();
        });
        return;
      }
      if (!s.selectedChoiceId) {
        showFeedback({ correct: false, title: 'עֲנוּ עַל שְׁאֵלַת הַחֲשִׁיבָה 🤔', sub: 'בַּחֲרוּ אַחַת מֵהָאֶפְשָׁרֻיּוֹת כְּדֵי לְהַמְשִׁיךְ.' }, 2500);
        return;
      }
      if (s.selectedChoiceId !== task.correctAnswer) {
        radar.recordTaskError(task.id, 'wrong_choice');
        showFeedback({ correct: false, title: 'בּוֹאוּ נַחְשֹׁב שׁוּב 🤔', sub: 'הַאִם הוֹסַפְנוּ אוֹ גָּרַעְנוּ קֻבִּיּוֹת כָּלְשֵׁהֵן מִבֵּית הַמִּסְפָּרִים?' }, 2800);
        return;
      }
      // Correct — vanilla text carried a "(100)" copy bug; ported without the number.
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'נָכוֹן מְאוֹד! 🌟', sub: 'הָעֵרֶךְ נִשְׁאַר זֶהֶה לַחֲלוּטִין כִּי לֹא שִׁנִּינוּ אֶת הַכַּמּוּת הַכּוֹלֶלֶת.' }, 2500, () => {
        advanceStandard();
      });
      return;
    }

    if (task.type === 'addition_simple' || task.type === 'vertical_addition') {
      // Target derived from the DISPLAYED (ASD-aware) operands — never from a hardcoded
      // correctAnswer that could mismatch the shown exercise.
      const { target } = effectiveArithmetic(task, s.isASD);
      // Gate 1: the blocks must represent the result (forced manipulative representation).
      if (selectBoardValue(s) !== target) {
        radar.recordTaskError(task.id, 'wrong_blocks');
        showFeedback(
          { correct: false, title: 'בּוֹאוּ נְיַצֵּג אֶת הַתַּרְגִּיל בְּבֵית הַמִּסְפָּרִים! 🧊', sub: `הַנִּיחוּ קֻבִּיּוֹת בַּטּוּרִים כָּךְ שֶׁסְּכוּמָן הַכּוֹלֵל יִהְיֶה בְּדִיּוּק ${target}.` },
          2800
        );
        return;
      }
      // Gate 2: the written answer must match.
      const ansVal = answerDigitsToNumber(s.answerDigits);
      if (ansVal !== target) {
        radar.recordTaskError(task.id, 'wrong_numeric');
        showFeedback({ correct: false, title: 'בִּדְקוּ אֶת הַתְּשׁוּבָה הַכְּתוּבָה שֶׁלָּכֶם ✏️', sub: 'הַקְלִידוּ אֶת הַתּוֹצָאָה הַנְּכוֹנָה בְּתֵבַת הַתְּשׁוּבָה.' }, 2500);
        return;
      }
    }

    if (task.type === 'number_line') {
      if (s.numberLineValue === null) return;
      const target = task.numberA ?? 0;
      const range = task.range ?? [0, 100];
      const rangeSize = range[1] - range[0];
      const deviation = Math.abs(s.numberLineValue - target);
      const deviationPct = deviation / rangeSize;
      const correct = deviationPct <= 0.07;
      if (!correct) {
        radar.recordTaskError(task.id, `deviation_${Math.round(deviationPct * 100)}pct`);
        showFeedback({ correct: false, title: 'נסו שוב 🤔', sub: 'החץ רחוק מדי מהמיקום המבוקש.' }, 2500);
        return;
      }
    }

    if (task.type === 'small_change') {
      if (!s.selectedChoiceId) return;
      if (s.selectedChoiceId !== task.correctAnswer) {
        radar.recordTaskError(task.id, 'wrong_choice');
        showFeedback({ correct: false, title: 'נסו שוב 🤔', sub: 'התשובה שבחרתם אינה נכונה.' }, 2500);
        return;
      }
    }

    if (task.type === 'missing_element') {
      const answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
      if (answer === null || Number.isNaN(answer)) return;
      if (answer !== task.correctAnswer) {
        radar.recordTaskError(task.id, 'wrong_answer');
        showFeedback({ correct: false, title: 'נסו שוב 🤔', sub: 'המספר שהזנתם אינו נכון.' }, 2500);
        return;
      }
    }

    if (task.type === 'flexible_decomp') {
      if (s.q3Reps.length < 2) {
        showFeedback({ correct: false, title: 'נִדְרָשִׁים שְׁנֵי יִצּוּגִים שׁוֹנִים', sub: 'הוֹסִיפוּ יִצּוּג שֵׁנִי!' }, 1800);
        return;
      }
      const [r1, r2] = s.q3Reps;
      const isIdentical = (['units', 'tens', 'hundreds', 'thousands'] as Place[]).every((p) => r1[p] === r2[p]);
      if (isIdentical) {
        radar.recordTaskError(task.id, 'canonical_fixation');
        showFeedback({ correct: false, title: 'הַיִּצּוּגִים זֵהִים 🤔', sub: 'נַסּוּ לִיצֹר אֶת אוֹתוֹ מִסְפָּר בְּדֶרֶךְ אַחֶרֶת (לְמָשָׁל עַל יְדֵי פְּרִיטַת עֲשֶׂרֶת).' }, 2800);
        set({ q3Reps: [] });
        return;
      }
    }

    // Scaffold fading (UDL): fade a step on success for scaffolded tasks; capped at 2 by design decision.
    if ((task.scaffoldLevel ?? 0) >= 1) {
      set({ scaffoldFadeLevel: Math.min(2, get().scaffoldFadeLevel + 1) });
    }
    advanceStandard();
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
    if (s.sessionNumber === 1) {
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! מִפְגָּשׁ 1 הוּשְׁלַם בְּהַצְלָחָה! 🎉', sub: 'עוֹבְרִים כָּעֵת אוֹטוֹמָטִית לְמִפְגָּשׁ 2...' }, 2500, () => {
        get().initSession(2, get().isASD);
      });
    } else if (s.sessionNumber === 3) {
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'כָּל הַכָּבוֹד! מִפְגָּשׁ 3 הוּשְׁלַם בְּהַצְלָחָה! 🎉', sub: 'עוֹבְרִים כָּעֵת אוֹטוֹמָטִית לְמִפְגָּשׁ 4...' }, 2500, () => {
        get().initSession(4, get().isASD);
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
      if (!evalResult.correct) radar.recordTaskError(task.id, evalResult.detail);
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
    packagedBlocks: { ...EMPTY_COUNTS },
    undoStack: [],
    undoCount: 0,
    hesitationCount: 0,
    boardOpen: true,
    scaffoldFadeLevel: 0,
    errorPlace: null,
    errorNonce: 0,
    focusedPlace: null,

    hasInteracted: false,
    selectedChoiceId: null,
    numberLineValue: null,
    answerDigits: {},
    probeAnswer: '',
    q3Reps: [],

    feedback: null,
    feedbackNonce: 0,
    helpState: 'closed',
    aiTasks: null,

    setAITasks: (tasks) => set({ aiTasks: tasks }),

    initSession: (meeting, isASD, initialAITasks) => {
      const qflow = initQFlow();
      set({
        sessionNumber: meeting,
        isASD,
        aiTasks: initialAITasks ?? null,
        standardTaskIdx: 0,
        qflow,
        flowStatus: 'task',
        awaitingNext: false,
        undoCount: 0,
        hesitationCount: 0,
        boardOpen: true,
        scaffoldFadeLevel: 0,
        errorPlace: null,
        feedback: null,
        helpState: 'closed',
        ...resetTaskInteraction(),
      });
      const firstId = meeting === 2 ? getCurrentQTask(qflow)?.id ?? '' : (initialAITasks ?? getSessionTasks(meeting as 1 | 3 | 4))[0]?.id ?? '';
      radar.setTask(firstId);
    },

    applyDrop: (input) => {
      const s = get();
      radar.recordAction();
      const result = resolveDrop(s.counts, s.packagedBlocks, input, selectScaffoldLevel(s));
      if (!result.ok) {
        if (result.reason === 'constraint') flagConstraintError(result.place);
        return;
      }
      pushSnapshot(s.counts, s.packagedBlocks);
      set({ counts: result.counts, packagedBlocks: result.packagedBlocks, hasInteracted: true });
      // Only a TRASH drop is a delete. Manual regrouping also sets `removed` (blocks leave
      // the source column) — counting it fired false PASSIVE_DRIFTING radar alerts after
      // three quick regroups, flagging exactly the students doing the RIGHT thing.
      if ((result.removed || result.packagedRemoved) && input.target.kind === 'trash') radar.recordDelete();
    },

    removeBlockClick: (place) => {
      const s = get();
      radar.recordAction();
      const next = removeBlock(s.counts, place);
      if (!next) {
        flagConstraintError(place);
        return;
      }
      pushSnapshot(s.counts, s.packagedBlocks);
      set({ counts: next, hasInteracted: true });
      radar.recordDelete();
    },

    packageBlocks: (place) => {
      const s = get();
      if (s.counts[place] < 10) return;
      radar.recordAction();
      pushSnapshot(s.counts, s.packagedBlocks);
      set({
        counts: { ...s.counts, [place]: s.counts[place] - 10 },
        packagedBlocks: { ...s.packagedBlocks, [place]: s.packagedBlocks[place] + 1 },
        hasInteracted: true,
      });
    },

    undo: () => {
      const s = get();
      const stack = [...s.undoStack];
      const snapshot = stack.pop();
      if (!snapshot) return;
      set({ counts: snapshot.counts, packagedBlocks: snapshot.packagedBlocks, undoStack: stack, undoCount: s.undoCount + 1 });
      radar.recordUndo();
      radar.recordAction();
    },

    toggleBoard: () => set((s) => ({ boardOpen: !s.boardOpen })),
    setFocusedPlace: (place) => set({ focusedPlace: place }),

    selectChoice: (id) => {
      set({ selectedChoiceId: id, hasInteracted: true });
      radar.recordAction();
    },

    setNumberLineValue: (v) => {
      set({ numberLineValue: v, hasInteracted: true });
      radar.recordAction();
    },

    setAnswerDigit: (place, v) => {
      set((s) => ({ answerDigits: { ...s.answerDigits, [place]: v }, hasInteracted: true }));
      radar.recordAction();
    },

    setProbeAnswer: (v) => {
      set({ probeAnswer: v, hasInteracted: true });
      radar.recordAction();
    },

    /** Q3 "הוסף ייצוג" (vanilla addQ3Representation, app.js 747–810). */
    addRepresentation: () => {
      const s = get();
      radar.recordAction();
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
        radar.recordTaskError('q3', 'wrong_sum');
        const hint =
          s.sessionNumber === 2
            ? `אֲנִי רוֹאֶה שֶׁשַּׂמְתֶּם ${s.counts.hundreds} מֵאוֹת, ${s.counts.tens} עֲשָׂרוֹת וְ-${s.counts.units} יְחִידוֹת (סַךְ הַכֹּל ${value}). אֵיךְ נוּכַל לְשַׁנּוֹת כְּדֵי לְהַגִּיעַ בְּדִיּוּק לְ-${target}?`
            : 'הַסְּכוּם לֹא מַתְאִים לַמִּסְפָּר. נַסּוּ שׁוּב!';
        showFeedback({ correct: false, title: 'חוֹנֵךְ סוֹקְרָטִי', sub: hint }, 3200);
        return;
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
      radar.recordAction();
      set({ scaffoldFadeLevel: 0 });
    },

    /** Q3 backward-diagnosis guided demo: decompose one ten into 10 units. */
    demoUngroup: () => {
      const s = get();
      radar.recordAction();
      const result = resolveDrop(s.counts, s.packagedBlocks, { source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } }, selectScaffoldLevel(s));
      if (result.ok) {
        pushSnapshot(s.counts, s.packagedBlocks);
        set({ counts: result.counts, packagedBlocks: result.packagedBlocks, hasInteracted: true });
      }
    },

    proceed: () => {
      const s = get();
      if (s.awaitingNext || s.flowStatus !== 'task') return;
      radar.recordAction();
      if (s.sessionNumber === 2) proceedQ();
      else proceedStandard();
    },

    skipTutorial: () => {
      const s = get();
      if (s.sessionNumber !== 1) return;
      
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'הדרכה הופסקה', sub: 'עוברים למשימות...' }, 1500, () => {
        set({ standardTaskIdx: 6, awaitingNext: false });
        startTask(getSessionTasks(1)[6].id);
      });
    },

    /** Help flow: lightbulb → 3s "productive metacognitive friction" → calibrated choice. */
    requestHelp: () => {
      const s = get();
      if (s.helpState !== 'closed') return;
      radar.recordHintRequest();
      set({ helpState: 'friction' });
    },

    helpFrictionDone: () => {
      if (get().helpState === 'friction') set({ helpState: 'palette' });
    },

    chooseSupport: (type) => set({ helpState: type }),
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
