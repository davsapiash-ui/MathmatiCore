/**
 * PRD Modules 10 & 12 — the two-stage cognitive hesitation hierarchy.
 *
 * Both stages are measured from the same mark: the learner's last cognitive
 * action. They are stages of one silent escalation, not two independent
 * timers, and neither is ever shown to the learner as a countdown.
 *
 *   30s  — Module 10: the adaptive addition grid opens, and only for learners
 *          carrying the `enhanced_cognitive_support` profile.
 *   45s  — Module 12: the Socratic coach is offered. This one is fixed. The
 *          module says the card fires "strictly upon: (a) 45 seconds of
 *          continuous column hesitation", and Appendix A §3 stamps the event
 *          `trigger_reason: 'hesitation_45s'`. A slider that moved it would
 *          have made that label a lie and the pilot's hesitation data
 *          incomparable between learners. The Module 26 calibration governs
 *          the teacher's radar — when a tile turns yellow — and not this.
 *
 * The stage predicates live here, as pure functions, so they can be pinned by
 * tests directly. `useCognitiveHesitationRadar` is the only runtime caller —
 * it owns the timers; this module owns the rules.
 */

/** Module 10: unbroken hesitation, in seconds, before the adaptive grid opens. */
export const GRID_STAGE_SECONDS = 30;

/**
 * Module 12 §ד: unbroken hesitation, in seconds, before the Socratic card is
 * offered. Fixed — see the header. Not admin-calibrated, and not a default.
 */
export const SOCRATIC_STAGE_SECONDS = 45;

/**
 * Owner decision (7.9.2026, register decision ב): the board fades in softly over
 * 2 seconds and stays until the learner closes it with the X. The matrix's
 * automatic hide 3 seconds after a correct digit was built and then rejected:
 * a board that vanishes mid-exercise surprises exactly the learner it serves.
 */
export const GRID_FADE_IN_SECONDS = 2;

export interface AdaptiveGridStageInput {
  /** The learner's Module 19 support profile applied to the exercise on screen. */
  supportProfileId?: string | null;
  /** 1-8. Only meetings 3–7 receive the grid (register 18); never 1, 2 or 8. */
  sessionNumber: number;
  /** The grid is already on screen — reopening it would be a no-op. */
  isAdditionHelperOpen: boolean;
}

/**
 * Module 10 §ב: the adaptive addition grid is a targeted accommodation, not a
 * general hint. It is offered strictly to `enhanced_cognitive_support`
 * learners, and never during the diagnostic session (which must measure
 * unaided performance) or the Master Researcher reflection board (which has no
 * arithmetic task to support) — nor in meeting 1: register 18 keeps the grid
 * and its return tab to meetings 3–7.
 */
export function shouldOpenAdaptiveGrid(input: AdaptiveGridStageInput): boolean {
  if (input.supportProfileId !== 'enhanced_cognitive_support') return false;
  if (input.isAdditionHelperOpen) return false;
  // Register 18: the grid and its return tab exist "רק לפרופיל תמיכה מוגבר, ורק
  // במפגשים 3–7" — never meeting 1 (the sandbox), 2 or 8.
  return input.sessionNumber >= 3 && input.sessionNumber <= 7;
}
