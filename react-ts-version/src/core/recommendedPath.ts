import type { PedagogicalPath } from '@/types';

/**
 * The diagnostic's recommendation for one learner, read from the learner's own
 * record — the ONE place every teacher screen takes it from.
 *
 * PRD Module 20 §ב: score ≥ 50 → green_path, otherwise remediation_path. The
 * server's trigger (sessionTrigger.ts) writes both `matrix_recommended_path`
 * and `session_score_percent` onto the record when meeting 2 is completed;
 * the rules refuse them from the learner's client (owner, 29.9.2026).
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
 *
 * A learner the teacher marked as graded (graded_track) has two levels of their
 * own (owner, 11.10.2026): score ≥ 50 → graded_path, otherwise
 * graded_foundation_path. `gradedTrack` defaults to the row's own mark; pass it
 * when the row is not the learner record (the meeting-2 session document). A
 * recommendation stored before the server knew the two levels (green / remediation
 * for a graded learner) is read by the same line, ≥ 50 or below.
 */
export function recommendedPathOf(row: unknown, gradedTrack?: boolean): PedagogicalPath | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const graded = gradedTrack ?? r.graded_track === true;
  const direct = r.matrix_recommended_path;
  if (graded) {
    if (direct === 'graded_path' || direct === 'green_path') return 'graded_path';
    if (direct === 'graded_foundation_path' || direct === 'remediation_path') return 'graded_foundation_path';
  } else {
    if (direct === 'green_path' || direct === 'remediation_path') return direct;
    // A recommendation made while the learner was marked graded, and the mark removed since: the same line.
    if (direct === 'graded_path') return 'green_path';
    if (direct === 'graded_foundation_path') return 'remediation_path';
  }
  const score = r.session_score_percent;
  if (typeof score === 'number' && Number.isFinite(score)) {
    if (graded) return score >= 50 ? 'graded_path' : 'graded_foundation_path';
    return score >= 50 ? 'green_path' : 'remediation_path';
  }
  return null;
}
