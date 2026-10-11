/**
 * The learning paths, as the server reads them (owner, 11.10.2026: four paths).
 *
 *   green_path              — המסלול הירוק
 *   remediation_path        — מסלול צמצום פערי קדם
 *   graded_path             — המסלול המדורג (special education: the same topics, within 1,000)
 *   graded_foundation_path  — המסלול המדורג – יסודות (special education: within the hundred,
 *                             place value from whole hundreds)
 *
 * The teacher marks a special-education learner before meeting 1
 * (`graded_track: true`): meetings 1–2 are then the graded refresh and the graded
 * diagnostic, shared by both special-education levels. The meeting-2
 * recommendation has two values for every learner (score ≥ 50 or below):
 * green_path / remediation_path for a regular learner, graded_path /
 * graded_foundation_path for a marked one (recommendedPathFor). The teacher
 * approves any of the four at the gate (teacher_selected_path).
 *
 * Before this module every reader resolved "not remediation ⇒ green", which
 * would have counted, scored and exported a graded learner as green.
 */

export type LearningPath = "green_path" | "remediation_path" | "graded_path" | "graded_foundation_path";

/** What the diagnostic recommends: one of four, but never across the teacher's graded mark. */
export type RecommendedPath = LearningPath;

export const LEARNING_PATHS: readonly LearningPath[] = ["green_path", "remediation_path", "graded_path", "graded_foundation_path"];

/** The value as a path, or null for anything else. */
export function asLearningPath(value: unknown): LearningPath | null {
  return value === "green_path" || value === "remediation_path" || value === "graded_path" || value === "graded_foundation_path"
    ? value
    : null;
}

/**
 * The path a meeting score recommends (PRD Module 20 §ב; owner, 11.10.2026): ≥ 50 →
 * green_path, else remediation_path; for a learner the teacher marked graded,
 * ≥ 50 → graded_path, else graded_foundation_path.
 */
export function recommendedPathFor(scorePercent: number, gradedTrack: boolean): RecommendedPath {
  if (gradedTrack) return scorePercent >= 50 ? "graded_path" : "graded_foundation_path";
  return scorePercent >= 50 ? "green_path" : "remediation_path";
}

/** The learner record says the teacher marked this learner for the graded path. */
export function isGradedTrack(record: Record<string, any> | null | undefined): boolean {
  return record?.graded_track === true;
}

/**
 * The path a learner record carries. The gate writes teacher_selected_path and
 * pedagogicalPath together; when they differ the old rule stands (remediation
 * on either wins), extended to the graded paths (the foundations level wins over the
 * graded one, as remediation over green). With no path at all yet (before the
 * gate), a learner the teacher marked as graded is on the graded path — meetings
 * 1–2 are the graded ones for both special-education levels — any other on the
 * green one, as before.
 */
export function learnerPathOf(record: Record<string, any> | null | undefined): LearningPath {
  const named = [asLearningPath(record?.teacher_selected_path), asLearningPath(record?.pedagogicalPath)];
  if (named.includes("remediation_path")) return "remediation_path";
  if (named.includes("graded_foundation_path")) return "graded_foundation_path";
  if (named.includes("graded_path")) return "graded_path";
  if (named.includes("green_path")) return "green_path";
  return isGradedTrack(record) ? "graded_path" : "green_path";
}

/** The id letter of a path's banks: s4_g_t1, s4_r_t1, s4_d_t1, s4_f_t1. */
export const PATH_ID_LETTER: Readonly<Record<LearningPath, "g" | "r" | "d" | "f">> = {
  green_path: "g",
  remediation_path: "r",
  graded_path: "d",
  graded_foundation_path: "f",
};

/** The path a bank id letter names, or null. */
export function pathOfIdLetter(letter: string): LearningPath | null {
  return letter === "g" ? "green_path"
    : letter === "r" ? "remediation_path"
    : letter === "d" ? "graded_path"
    : letter === "f" ? "graded_foundation_path"
    : null;
}
