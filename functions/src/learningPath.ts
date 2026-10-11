/**
 * The learning paths, as the server reads them (owner, 11.10.2026: three paths).
 *
 *   green_path        — המסלול הירוק
 *   remediation_path  — מסלול צמצום פערי קדם
 *   graded_path       — המסלול המדורג (special education: the same topics, within 1,000)
 *
 * The matrix recommendation of meeting 2 stays two-valued (score ≥ 50 → green,
 * else remediation): the graded path is only ever the teacher's choice — at the
 * gate (teacher_selected_path), or before meeting 1 by marking the learner
 * record with `graded_track: true`.
 *
 * Before this module every reader resolved "not remediation ⇒ green", which
 * would have counted, scored and exported a graded learner as green.
 */

export type LearningPath = "green_path" | "remediation_path" | "graded_path";

/** What the diagnostic recommends: never graded. */
export type RecommendedPath = "green_path" | "remediation_path";

export const LEARNING_PATHS: readonly LearningPath[] = ["green_path", "remediation_path", "graded_path"];

/** The value as a path, or null for anything else. */
export function asLearningPath(value: unknown): LearningPath | null {
  return value === "green_path" || value === "remediation_path" || value === "graded_path" ? value : null;
}

/** The learner record says the teacher marked this learner for the graded path. */
export function isGradedTrack(record: Record<string, any> | null | undefined): boolean {
  return record?.graded_track === true;
}

/**
 * The path a learner record carries. The gate writes teacher_selected_path and
 * pedagogicalPath together; when they differ the old rule stands (remediation
 * on either wins), extended to the third path. With no path at all yet (before
 * the gate), a learner the teacher marked as graded is on the graded path, any
 * other on the green one, as before.
 */
export function learnerPathOf(record: Record<string, any> | null | undefined): LearningPath {
  const named = [asLearningPath(record?.teacher_selected_path), asLearningPath(record?.pedagogicalPath)];
  if (named.includes("remediation_path")) return "remediation_path";
  if (named.includes("graded_path")) return "graded_path";
  if (named.includes("green_path")) return "green_path";
  return isGradedTrack(record) ? "graded_path" : "green_path";
}

/** The id letter of a path's banks: s4_g_t1, s4_r_t1, s4_d_t1. */
export const PATH_ID_LETTER: Readonly<Record<LearningPath, "g" | "r" | "d">> = {
  green_path: "g",
  remediation_path: "r",
  graded_path: "d",
};

/** The path a bank id letter names, or null. */
export function pathOfIdLetter(letter: string): LearningPath | null {
  return letter === "g" ? "green_path" : letter === "r" ? "remediation_path" : letter === "d" ? "graded_path" : null;
}
