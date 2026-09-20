import type { PedagogicalPath } from '@/types';

/**
 * The diagnostic's recommendation for one learner, read from the learner's own
 * record — the ONE place every teacher screen takes it from.
 *
 * PRD Module 20 §ב: score ≥ 50 → green_path, otherwise remediation_path. The
 * learner's client writes both `matrix_recommended_path` and
 * `session_score_percent` onto the record when meeting 2 is completed.
 *
 * Before this helper the radar, the class-management card and the approval
 * drawer each read `routeRecommendation` / `sessionState.current_path` instead.
 * `routeRecommendation` never reaches the database (its write is refused by the
 * rules), and `current_path` is 'green_path' for everyone until the teacher
 * approves — so a learner who scored 29% was shown "המלצה: ירוק" next to the
 * approve button, with green preselected in the drawer.
 *
 * Returns null when the diagnostic produced no recommendation yet: a screen
 * must then say so, never default to a colour.
 */
export function recommendedPathOf(row: unknown): PedagogicalPath | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const direct = r.matrix_recommended_path;
  if (direct === 'green_path' || direct === 'remediation_path') return direct;
  const score = r.session_score_percent;
  if (typeof score === 'number' && Number.isFinite(score)) return score >= 50 ? 'green_path' : 'remediation_path';
  return null;
}
