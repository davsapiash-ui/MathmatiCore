/**
 * The mastery profile (conceptMastery) of a learner's diagnostic meeting, on
 * the server.
 *
 * The learner's browser builds this profile when it answers the seventh task
 * (react-ts-version useWorkspaceStore writeDiagnosticCompletion →
 * core/QMatrix.ts computeCognitiveMastery), and the "מיפוי מיומנויות כיתתי"
 * tab builds its groups, its chart and its counter from it. A learner whom
 * the teacher's close completed (meeting2Close.ts) never reaches that seventh
 * answer, so without this copy exactly the learners who did not finish — the
 * weaker ones — were missing from the clustering screen.
 *
 * A copy of the client's mapping and rule, held identical to it by
 * react-ts-version src/core/__tests__/DiagnosticMastery_ClientServerParity.test.ts.
 * Change both or neither. No firebase import here, so the client test can load it.
 */

export type CognitiveConcept =
  | "decimal_structure"
  | "number_magnitude"
  | "regrouping_fluency"
  | "procedural_fluency"
  | "relational_thinking"
  | "algebraic_reasoning";

export const COGNITIVE_CONCEPTS: readonly CognitiveConcept[] = [
  "decimal_structure",
  "number_magnitude",
  "regrouping_fluency",
  "procedural_fluency",
  "relational_thinking",
  "algebraic_reasoning",
];

/** core/QMatrix.ts Q_MATRIX_MAPPING: each diagnostic task (and its legacy alias) → the concepts it measures. */
export const Q_MATRIX_MAPPING: Record<string, CognitiveConcept[]> = {
  task1_read_write_zero: ["decimal_structure"],
  task2_digit_value: ["decimal_structure"],
  task3_subtraction_regrouping: ["procedural_fluency", "regrouping_fluency"],
  task4_decompose_number: ["decimal_structure"],
  task5_units_to_tens: ["regrouping_fluency"],
  task6_vertical_addition: ["procedural_fluency", "regrouping_fluency"],
  task7_subtraction_zero_tens: ["decimal_structure", "procedural_fluency", "regrouping_fluency"],
  task1_zero_placeholder: ["decimal_structure"],
  task3_flexible_regrouping: ["decimal_structure"],
  task4_basic_addition_fluency: ["procedural_fluency", "regrouping_fluency"],
  task5_small_change: ["regrouping_fluency"],
  task6_subtraction_regrouping: ["procedural_fluency", "regrouping_fluency"],
  task7_missing_subtrahend: ["decimal_structure", "procedural_fluency", "regrouping_fluency"],
};

export type MasteryProfile = Record<CognitiveConcept, number>;

/**
 * core/QMatrix.ts computeCognitiveMastery: per concept, the share of its
 * tasks tagged 'success' (or 'correct'); a concept no task measured is 1.0.
 */
export function computeCognitiveMastery(results: Record<string, string | null>): MasteryProfile {
  const attempts = {} as Record<CognitiveConcept, number>;
  const successes = {} as Record<CognitiveConcept, number>;
  for (const c of COGNITIVE_CONCEPTS) {
    attempts[c] = 0;
    successes[c] = 0;
  }
  for (const [taskId, tag] of Object.entries(results)) {
    const concepts = Q_MATRIX_MAPPING[taskId];
    if (!concepts) continue;
    for (const c of concepts) {
      attempts[c]++;
      if (tag === "success" || tag === "correct") successes[c]++;
    }
  }
  const profile = {} as MasteryProfile;
  for (const c of COGNITIVE_CONCEPTS) {
    profile[c] = attempts[c] > 0 ? successes[c] / attempts[c] : 1.0;
  }
  return profile;
}
