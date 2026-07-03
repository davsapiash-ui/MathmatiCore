import type { StudentData, RoutePath } from '@/application/useStore';

export class CurriculumRouter {
  /**
   * Determines the recommended pedagogical path for the student based on Meeting 2 diagnostics.
   * 
   * @param student The student's data including QMatrix results and Trace data.
   * @returns 'YELLOW' if scaffolding is needed, 'GREEN' if ready for advanced challenges.
   */
  static evaluateRoute(student: StudentData): RoutePath {
    const q = student.qMatrixResults;
    const t = student.traceData;

    // 1. Check Q-Matrix Core Competencies
    // If ANY of the primary diagnostic tasks failed, the student needs the YELLOW path (Scaffolding).
    const failedCoreTask = (
      q.task1_zero_placeholder === false ||
      q.task3_flexible_regrouping === false ||
      q.task4_basic_addition_fluency === false ||
      q.task5_basic_subtraction_fluency === false
    );

    // 2. Check Estimation (Task 2)
    // High error margin indicates weak spatial number sense.
    const weakEstimation = q.task2_estimation_error_margin !== null && q.task2_estimation_error_margin > 0.2;

    // 3. Trace Data Analysis (Silent Radar)
    // If the student struggled silently (high hesitation or extreme undo usage)
    const silentStruggle = t.hesitation_events >= 10 || t.undo_clicks >= 15;

    if (failedCoreTask || weakEstimation || silentStruggle) {
      return 'YELLOW';
    }

    // Default to GREEN (Advanced/Challenge) if all diagnostics passed cleanly
    return 'GREEN';
  }
}
