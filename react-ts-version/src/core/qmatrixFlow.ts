/**
 * Q-Matrix two-phase flow engine — pure port of vanilla_audit/js/qmatrix.js (lines 155–532).
 * Phase 'primary': all 5 diagnostic tasks run linearly; errors are recorded but never block.
 * Phase 'correction': for each failed task — a simpler backward-diagnosis subtask, then a retry.
 * No React, no side effects; the store owns the state object and applies transitions.
 */

import type { QMatrixTask, TaskPhase, CorrectionSubphase } from '@/core/QMatrix';
import { TASKS } from '@/core/QMatrix';

export interface QTaskResult {
  correct: boolean;
  detail: string;
  had_digit_error?: boolean;
  subtaskCorrect?: boolean;
  subtaskDetail?: string;
  secondAttemptCorrect?: boolean;
  secondAttemptDetail?: string;
  tag?: string;
}

export interface QMatrixFlowState {
  taskIdx: number;
  phase: TaskPhase;
  subphase: CorrectionSubphase;
  failedTasks: string[];
  correctionIdx: number;
  results: Record<string, QTaskResult>;
}

export type QFlowEvent =
  | { type: 'primary_done'; taskId: string; correct: boolean }
  | { type: 'subtask_done'; taskId: string; correct: boolean }
  | { type: 'retry_done'; taskId: string; correct: boolean }
  | { type: 'start_correction'; taskId: string }
  | { type: 'start_retry'; taskId: string }
  | { type: 'all_complete' };

export function initQFlow(): QMatrixFlowState {
  return { taskIdx: 0, phase: 'primary', subphase: 'subtask', failedTasks: [], correctionIdx: 0, results: {} };
}

export function getCurrentQTask(state: QMatrixFlowState): QMatrixTask | null {
  return TASKS[state.taskIdx] ?? null;
}

/**
 * The correction round has no hints (owner's decision, 25.9.2026). Addition and
 * subtraction tasks first show a simpler exercise in round numbers, then the task
 * itself again. The other tasks have no simpler exercise, so the task itself is
 * shown again, in its own screen — one second attempt, not two.
 */
export function hasProbeExercise(task: QMatrixTask): boolean {
  return task.backwardDiagnosis?.probeA !== undefined;
}

function firstSubphase(taskId: string): CorrectionSubphase {
  const task = TASKS.find((t) => t.id === taskId);
  return task && hasProbeExercise(task) ? 'subtask' : 'retry';
}

/** The diagnostic tag of a failed task, from its answer in the correction round. */
function diagnosticTag(taskId: string, correct: boolean): string | undefined {
  if (taskId === 'task1_read_write_zero' || taskId === 'task1_zero_placeholder') return correct ? 'zero_placeholder_hundreds_error' : 'zero_placeholder_global_error';
  if (taskId === 'task2_digit_value') return correct ? 'digit_value_procedural_error' : 'digit_value_conceptual_error';
  if (taskId === 'task3_subtraction_regrouping' || taskId === 'task6_subtraction_regrouping') return correct ? 'regrouping_anxiety' : 'subtraction_operation_deficit';
  if (taskId === 'task4_decompose_number' || taskId === 'task3_flexible_regrouping') return correct ? 'canonical_fixation' : 'regrouping_deficit';
  if (taskId === 'task5_units_to_tens' || taskId === 'task5_small_change') return correct ? 'small_change_confusion' : 'directional_error';
  if (taskId === 'task6_vertical_addition' || taskId === 'task4_basic_addition_fluency') return correct ? 'procedural_error' : 'basic_facts_deficit';
  if (taskId === 'task7_subtraction_zero_tens' || taskId === 'task7_missing_subtrahend') return correct ? 'computational_fluency_deficit' : 'algebraic_concept_deficit';
  if (taskId === 'task8_missing_addend') return correct ? 'inverse_operation_gap' : 'missing_addend_deficit';
  return undefined;
}

/** Record an evaluation result (vanilla handleTaskResult). Returns new state + the feedback event. */
export function recordResult(
  state: QMatrixFlowState,
  evalResult: { correct: boolean; detail: string; had_digit_error?: boolean }
): { state: QMatrixFlowState; event: QFlowEvent } {
  const task = getCurrentQTask(state);
  if (!task) return { state, event: { type: 'all_complete' } };
  const results = { ...state.results };

  if (state.phase === 'primary') {
    results[task.id] = { correct: evalResult.correct, detail: evalResult.detail, had_digit_error: evalResult.had_digit_error };
    return {
      state: { ...state, results },
      event: { type: 'primary_done', taskId: task.id, correct: evalResult.correct },
    };
  }

  const prev: QTaskResult = results[task.id] ?? { correct: false, detail: '' };
    if (state.subphase === 'subtask') {
      const updated: QTaskResult = { ...prev, subtaskCorrect: evalResult.correct, subtaskDetail: evalResult.detail };
      updated.tag = diagnosticTag(task.id, evalResult.correct) ?? updated.tag;
      results[task.id] = updated;
      return {
        state: { ...state, results },
        event: { type: 'subtask_done', taskId: task.id, correct: evalResult.correct },
      };
    }

  results[task.id] = { ...prev, secondAttemptCorrect: evalResult.correct, secondAttemptDetail: evalResult.detail };
  if (!hasProbeExercise(task)) results[task.id].tag = diagnosticTag(task.id, evalResult.correct) ?? prev.tag;
  return {
    state: { ...state, results },
    event: { type: 'retry_done', taskId: task.id, correct: evalResult.correct },
  };
}

/** Advance after feedback display (vanilla advanceToNextTask). */
export function advance(state: QMatrixFlowState): { state: QMatrixFlowState; event: QFlowEvent | null } {
  if (state.phase === 'primary') {
    const nextIdx = state.taskIdx + 1;
    if (nextIdx < TASKS.length) {
      return { state: { ...state, taskIdx: nextIdx }, event: null };
    }
    // Primary round complete — collect failures.
    const failedTasks = TASKS.filter((t) => state.results[t.id] && !state.results[t.id].correct).map((t) => t.id);
    if (failedTasks.length > 0) {
      const firstFailedId = failedTasks[0];
      return {
        state: {
          ...state,
          phase: 'correction',
          subphase: firstSubphase(firstFailedId),
          failedTasks,
          correctionIdx: 0,
          taskIdx: TASKS.findIndex((t) => t.id === firstFailedId),
        },
        event: { type: 'start_correction', taskId: firstFailedId },
      };
    }
    return { state: { ...state, taskIdx: nextIdx, failedTasks }, event: { type: 'all_complete' } };
  }

  // correction phase
  if (state.subphase === 'subtask') {
    const task = getCurrentQTask(state);
    return {
      state: { ...state, subphase: 'retry' },
      event: { type: 'start_retry', taskId: task?.id ?? '' },
    };
  }

  const nextCorrectionIdx = state.correctionIdx + 1;
  if (nextCorrectionIdx < state.failedTasks.length) {
    const nextFailedId = state.failedTasks[nextCorrectionIdx];
    return {
      state: {
        ...state,
        correctionIdx: nextCorrectionIdx,
        subphase: firstSubphase(nextFailedId),
        taskIdx: TASKS.findIndex((t) => t.id === nextFailedId),
      },
      event: { type: 'start_correction', taskId: nextFailedId },
    };
  }
  return { state: { ...state, correctionIdx: nextCorrectionIdx }, event: { type: 'all_complete' } };
}

// ── Effective-value helpers (ASD + correction-subtask aware; vanilla 188–232) ──

export function isSubtaskActive(state: QMatrixFlowState): boolean {
  return state.phase === 'correction' && state.subphase === 'subtask';
}

export function getEffectiveNumber(task: QMatrixTask, state: QMatrixFlowState, isASD: boolean): number | undefined {
  if (isSubtaskActive(state)) {
    if (isASD && task.backwardDiagnosis?.asdSubtaskNumber !== undefined) return task.backwardDiagnosis.asdSubtaskNumber;
    if (task.backwardDiagnosis?.subtaskNumber !== undefined) return task.backwardDiagnosis.subtaskNumber;
  }
  if (isASD && task.asdNumber !== undefined) return task.asdNumber;
  return task.number;
}

export function getEffectiveRange(task: QMatrixTask, state: QMatrixFlowState, isASD: boolean): [number, number] | undefined {
  if (isSubtaskActive(state)) {
    if (isASD && task.backwardDiagnosis?.asdSubtaskRange !== undefined) return task.backwardDiagnosis.asdSubtaskRange;
    if (task.backwardDiagnosis?.subtaskRange) return task.backwardDiagnosis.subtaskRange;
  }
  if (isASD && task.asdRange) return task.asdRange;
  return task.range;
}

export function getEffectiveChoices(task: QMatrixTask, state: QMatrixFlowState): { id: string; textHe: string }[] {
  if (isSubtaskActive(state) && task.backwardDiagnosis?.subtaskChoices) return task.backwardDiagnosis.subtaskChoices;
  return task.choices ?? [];
}

export function getExpectedBlocks(
  task: QMatrixTask,
  state: QMatrixFlowState,
  isASD: boolean
): { hundreds?: number; tens?: number; units?: number } | null {
  if (isSubtaskActive(state)) return null; // blocks are not validated in backward subtasks
  if (isASD && task.asdExpectedBlocks) return task.asdExpectedBlocks;
  return task.expectedBlocks ?? null;
}

export type RoutePath = 'RED' | 'YELLOW' | 'GREEN';

/**
 * Evaluates the 3 adaptive paths starting Session 3 based on Q-Matrix results.
 * RED: Needs intensive intervention (e.g. multiple core tasks failed or high hesitation)
 * YELLOW: Needs scaffolding (e.g. minor struggles or some tasks failed)
 * GREEN: Advanced / Challenge ready (passed cleanly)
 */
export function determineAdaptivePath(
  state: QMatrixFlowState,
  hesitationCount: number = 0,
  undoCount: number = 0
): RoutePath {
  const failedTasks = Object.values(state.results).filter(r => !r.correct && !r.secondAttemptCorrect);
  const failedCount = failedTasks.length;

  if (failedCount >= 3 || hesitationCount >= 10 || undoCount >= 20) {
    return 'RED';
  }
  
  if (failedCount > 0 || hesitationCount >= 5 || undoCount >= 10) {
    return 'YELLOW';
  }

  return 'GREEN';
}
