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
  undoStack: PlaceCounts[];
  undoCount: number;
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
  undo: () => void;
  toggleBoard: () => void;
  setFocusedPlace: (place: Place | null) => void;
  selectChoice: (id: string) => void;
  setNumberLineValue: (v: number) => void;
  setAnswerDigit: (place: Place, v: string) => void;
  setProbeAnswer: (v: string) => void;
  addRepresentation: () => void;
  demoUngroup: () => void;
  proceed: () => void;
  requestHelp: () => void;
  helpFrictionDone: () => void;
  chooseSupport: (type: SupportType) => void;
  closeHelp: () => void;
  setAITasks: (tasks: SessionTask[] | null) => void;
}

/* ── Pure helpers ── */

function resetTaskInteraction() {
  return {
    counts: { ...EMPTY_COUNTS },
    undoStack: [] as PlaceCounts[],
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
  if (s.sessionNumber === 3 && s.aiTasks) return s.aiTasks;
  return getSessionTasks(s.sessionNumber as 1 | 3 | 4);
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
    return true;
  }
  const task = selectStandardTask(s);
  if (!task) return false;
  if (task.type === 'session1_intro') return true;
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

  function pushSnapshot(prev: PlaceCounts) {
    const stack = [...get().undoStack, { ...prev }];
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
        showFeedback({ correct: true, title: 'התשובה התקבלה! 👍', sub: 'עוברים למשימה הבאה...' }, 1500, () => {
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
        showFeedback({ correct: false, title: 'סבב תיקונים 🔍', sub: 'בואו נעבור יחד על כמה דברים...' }, 1800, () => {
          startTask(event.taskId);
          set({ awaitingNext: false });
        });
        break;
      case 'subtask_done':
        showFeedback(
          { correct: event.correct, title: event.correct ? 'מצוין! 🟢' : 'הבנתי, נמשיך... 🟡' },
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
        showFeedback({ correct: true, title: 'מנסים שוב! 🔄', sub: 'הנה המשימה המקורית. נסו לפתור אותה כעת:' }, 1800, () => {
          startTask(event.taskId);
          set({ awaitingNext: false });
        });
        break;
      case 'retry_done':
        showFeedback(
          { correct: event.correct, title: event.correct ? 'מעולה, הצלחתם! 🎉' : 'התשובה נשמרה. 👍' },
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
        showFeedback({ correct: true, title: 'סיימתם! 🎉', sub: 'כל הכבוד על העבודה הטובה!' }, 2200, () => {
          set({ flowStatus: 'reflection', awaitingNext: false });
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
      if (!s.selectedChoiceId) {
        showFeedback({ correct: false, title: 'ענו על שאלת החשיבה 🤔', sub: 'בחרו אחת מהאפשרויות כדי להמשיך.' }, 2500);
        return;
      }
      if (s.selectedChoiceId !== task.correctAnswer) {
        radar.recordTaskError(task.id, 'wrong_choice');
        showFeedback({ correct: false, title: 'בואו נחשוב שוב 🤔', sub: 'האם הוספנו או גרענו קוביות כלשהן מבית המספרים?' }, 2800);
        return;
      }
      // Correct — vanilla text carried a "(100)" copy bug; ported without the number.
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'נכון מאוד! 🌟', sub: 'הערך נשאר זהה לחלוטין כי לא שינינו את הכמות הכוללת.' }, 2500, () => {
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
          { correct: false, title: 'בואו נייצג את התרגיל בבית המספרים! 🧊', sub: `הניחו קוביות בטורים כך שסכומן הכולל יהיה בדיוק ${target}.` },
          2800
        );
        return;
      }
      // Gate 2: the written answer must match.
      const ansVal = answerDigitsToNumber(s.answerDigits);
      if (ansVal !== target) {
        radar.recordTaskError(task.id, 'wrong_numeric');
        showFeedback({ correct: false, title: 'בדקו את התשובה הכתובה שלכם ✏️', sub: 'הקלידו את התוצאה הנכונה בתיבת התשובה.' }, 2500);
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
      showFeedback({ correct: true, title: 'כל הכבוד! מפגש 1 הושלם בהצלחה! 🎉', sub: 'עוברים כעת אוטומטית למפגש 2...' }, 2500, () => {
        get().initSession(2, get().isASD);
      });
    } else if (s.sessionNumber === 3) {
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'כל הכבוד! מפגש 3 הושלם בהצלחה! 🎉', sub: 'עוברים כעת אוטומטית למפגש 4...' }, 2500, () => {
        get().initSession(4, get().isASD);
      });
    } else {
      set({ awaitingNext: true });
      showFeedback({ correct: true, title: 'כל הכבוד! 🎉', sub: 'עבודה מצוינת במפגש זה!' }, 2500, () => {
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
          showFeedback({ correct: false, title: 'נדרשים שני ייצוגים שונים', sub: 'הוסיפו ייצוג שני!' }, 1800);
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
    undoStack: [],
    undoCount: 0,
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
      const result = resolveDrop(s.counts, input, selectScaffoldLevel(s));
      if (!result.ok) {
        if (result.reason === 'constraint') flagConstraintError(result.place);
        return;
      }
      pushSnapshot(s.counts);
      set({ counts: result.counts, hasInteracted: true });
      if (result.removed) radar.recordDelete();
    },

    removeBlockClick: (place) => {
      const s = get();
      radar.recordAction();
      const next = removeBlock(s.counts, place);
      if (!next) {
        flagConstraintError(place);
        return;
      }
      pushSnapshot(s.counts);
      set({ counts: next, hasInteracted: true });
      radar.recordDelete();
    },

    undo: () => {
      const s = get();
      const stack = [...s.undoStack];
      const snapshot = stack.pop();
      if (!snapshot) return;
      set({ counts: snapshot, undoStack: stack, undoCount: s.undoCount + 1 });
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
        target = undefined;
      }

      if (target !== undefined && value !== target) {
        radar.recordTaskError('q3', 'wrong_sum');
        const hint =
          s.sessionNumber === 2
            ? `אני רואה ששמת ${s.counts.hundreds} מאיות, ${s.counts.tens} עשרות ו-${s.counts.units} יחידות (סך הכל ${value}). איך נוכל לשנות כדי להגיע בדיוק ל-${target}?`
            : 'הסכום לא מתאים למספר. נסו שוב!';
        showFeedback({ correct: false, title: 'חונך סוקרטי', sub: hint }, 3200);
        return;
      }

      const q3Reps = [...s.q3Reps, { ...s.counts }];
      set({ q3Reps, hasInteracted: true });
      // Reset the board for the next representation (vanilla resets below 2).
      if (q3Reps.length < 2) {
        set({ counts: { ...EMPTY_COUNTS }, undoStack: [] });
      }
    },

    /** Q3 backward-diagnosis guided demo: decompose one ten into 10 units. */
    demoUngroup: () => {
      const s = get();
      radar.recordAction();
      const result = resolveDrop(s.counts, { source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } }, selectScaffoldLevel(s));
      if (result.ok) {
        pushSnapshot(s.counts);
        set({ counts: result.counts, hasInteracted: true });
      }
    },

    proceed: () => {
      const s = get();
      if (s.awaitingNext || s.flowStatus !== 'task') return;
      radar.recordAction();
      if (s.sessionNumber === 2) proceedQ();
      else proceedStandard();
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
  };
});

/* Re-exports used by components */
export { getCurrentQTask, getEffectiveChoices, getEffectiveNumber, getExpectedBlocks, isSubtaskActive };

/* Dev-only test hook: lets E2E scripts drive the store deterministically. Stripped from prod builds. */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__wsStore = useWorkspaceStore;
}
