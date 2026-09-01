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
    // If ANY of the primary diagnostic tasks have an error tag (not 'success' and not null),
    // the student needs the YELLOW path (Scaffolding).
    const checkFailed = (tag?: string | null) => tag !== undefined && tag !== null && tag !== 'success';

    const failedCoreTask = (
      // Canonical 7 Tasks (PRD v7.0)
      checkFailed(q.task1_read_write_zero) ||
      checkFailed(q.task2_digit_value) ||
      checkFailed(q.task3_subtraction_regrouping) ||
      checkFailed(q.task4_decompose_number) ||
      checkFailed(q.task5_units_to_tens) ||
      checkFailed(q.task6_vertical_addition) ||
      checkFailed(q.task7_subtraction_zero_tens) ||
      // Legacy Fallback Keys
      checkFailed(q.task1_zero_placeholder) ||
      checkFailed(q.task3_flexible_regrouping) ||
      checkFailed(q.task4_basic_addition_fluency) ||
      checkFailed(q.task6_subtraction_regrouping_legacy)
    );

    // 2. Trace Data Analysis (Silent Radar)
    // If the student struggled silently (high hesitation or extreme undo usage)
    const silentStruggle = (t.hesitation_events || 0) >= 10 || (t.undo_clicks || 0) >= 15;

    if (failedCoreTask || silentStruggle) {
      return 'YELLOW';
    }

    // Default to GREEN (Advanced/Challenge) if all diagnostics passed cleanly
    return 'GREEN';
  }
}
