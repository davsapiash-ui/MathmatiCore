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
    const failedCoreTask = (
      (q.task1_zero_placeholder !== 'success' && q.task1_zero_placeholder !== null) ||
      (q.task3_flexible_regrouping !== 'success' && q.task3_flexible_regrouping !== null) ||
      (q.task4_basic_addition_fluency !== 'success' && q.task4_basic_addition_fluency !== null) ||
      (q.task6_subtraction_regrouping !== 'success' && q.task6_subtraction_regrouping !== null)
    );

    if (failedCoreTask || silentStruggle) {
      return 'YELLOW';
    }

    // Default to GREEN (Advanced/Challenge) if all diagnostics passed cleanly
    return 'GREEN';
  }
}
