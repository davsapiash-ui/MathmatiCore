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
  subtaskCorrect?: boolean;
  subtaskDetail?: string;
  secondAttemptCorrect?: boolean;
  secondAttemptDetail?: string;
  /** Q4 root-cause tag (vanilla qmatrix.js 449–451). */
  q4_backward_diag?: 'procedural_error' | 'basic_facts_error';
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

/** Record an evaluation result (vanilla handleTaskResult). Returns new state + the feedback event. */
export function recordResult(
  state: QMatrixFlowState,
  evalResult: { correct: boolean; detail: string }
): { state: QMatrixFlowState; event: QFlowEvent } {
  const task = getCurrentQTask(state);
  if (!task) return { state, event: { type: 'all_complete' } };
  const results = { ...state.results };

  if (state.phase === 'primary') {
    results[task.id] = { correct: evalResult.correct, detail: evalResult.detail };
    return {
      state: { ...state, results },
      event: { type: 'primary_done', taskId: task.id, correct: evalResult.correct },
    };
  }

  const prev: QTaskResult = results[task.id] ?? { correct: false, detail: '' };
  if (state.subphase === 'subtask') {
    const updated: QTaskResult = { ...prev, subtaskCorrect: evalResult.correct, subtaskDetail: evalResult.detail };
    if (task.id === 'task4_basic_addition_fluency') {
      updated.q4_backward_diag = evalResult.correct ? 'procedural_error' : 'basic_facts_error';
    }
    results[task.id] = updated;
    return {
      state: { ...state, results },
      event: { type: 'subtask_done', taskId: task.id, correct: evalResult.correct },
    };
  }

  results[task.id] = { ...prev, secondAttemptCorrect: evalResult.correct, secondAttemptDetail: evalResult.detail };
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
          subphase: 'subtask',
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
        subphase: 'subtask',
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
