/**
 * PRD Modules 10 & 12 — the two-stage cognitive hesitation hierarchy.
 *
 * Both stages are measured from the same mark: the learner's last cognitive
 * action. They are stages of one silent escalation, not two independent
 * timers, and neither is ever shown to the learner as a countdown.
 *
 *   30s  — Module 10: the adaptive addition grid opens, and only for learners
 *          carrying the `enhanced_cognitive_support` profile.
 *   45s  — Module 12: the silent teacher alert fires and the Socratic coach is
 *          offered. The 45s figure is the PRD default; Module 26 lets an admin
 *          calibrate it, so the live value comes from
 *          `getHesitationThresholdSeconds()`, never from a literal.
 *
 * The stage predicates live here, as pure functions, so they can be pinned by
 * tests directly. `useCognitiveHesitationRadar` is the only runtime caller —
 * it owns the timers; this module owns the rules.
 */

/** Module 10: unbroken hesitation, in seconds, before the adaptive grid opens. */
export const GRID_STAGE_SECONDS = 30;

/** Module 12: PRD default for the Socratic stage, before Module 26 calibration. */
export const DEFAULT_SOCRATIC_STAGE_SECONDS = 45;

/**
 * The pedagogical matrix (מסמך 05, owner decision 6.9.2026, register item 13):
 * the board "loads with a soft fade of exactly two and a half seconds" and
 * "disappears by itself exactly three seconds after a successful digit or
 * answer input by the learner, to prevent visual overload for learners on
 * the autistic spectrum". Both apply only once the profile gate above held.
 */
export const GRID_FADE_IN_SECONDS = 2.5;
export const GRID_AUTO_HIDE_SECONDS = 3;

export interface AdaptiveGridAutoHideInput {
  isAdditionHelperOpen: boolean;
  /** The DIGIT_ENTERED verdict: true, false, or null when the column has no expected digit. */
  isCorrect: boolean | null;
}

/** Only a correct digit starts the 3-second auto-hide; a wrong or unverifiable one leaves the board. */
export function shouldAutoHideAdaptiveGrid(input: AdaptiveGridAutoHideInput): boolean {
  return input.isAdditionHelperOpen && input.isCorrect === true;
}

export interface AdaptiveGridStageInput {
  /** The learner's Module 19 support profile, from auth or the workspace store. */
  supportProfileId?: string | null;
  /** 1-8. Sessions 2 (diagnostic) and 8 (reflection board) never receive the grid. */
  sessionNumber: number;
  /** The grid is already on screen — reopening it would be a no-op. */
  isAdditionHelperOpen: boolean;
}

/**
 * Module 10 §ב: the adaptive addition grid is a targeted accommodation, not a
 * general hint. It is offered strictly to `enhanced_cognitive_support`
 * learners, and never during the diagnostic session (which must measure
 * unaided performance) or the Master Researcher reflection board (which has no
 * arithmetic task to support).
 */
export function shouldOpenAdaptiveGrid(input: AdaptiveGridStageInput): boolean {
  if (input.supportProfileId !== 'enhanced_cognitive_support') return false;
  if (input.isAdditionHelperOpen) return false;
  if (input.sessionNumber === 2 || input.sessionNumber === 8) return false;
  return true;
}
