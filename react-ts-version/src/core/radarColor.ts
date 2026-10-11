/**
 * PRD v7.1 — Module 18 §B: Silent Radar cell colour precedence.
 * BLUE > RED > GREY > YELLOW > GREEN, highest priority first:
 * - BLUE: student pressed the call-teacher button (helpRequested === true)
 * - RED: a Socratic coaching card is open on the student's screen
 * - GREY: disconnected per presence heartbeat, or session not started
 * - YELLOW: 45 continuous seconds without action in the active column
 * - GREEN: healthy learning activity
 */

export type RadarColor = 'BLUE' | 'RED' | 'GREY' | 'YELLOW' | 'GREEN';

export interface RadarColorInput {
  helpRequested: boolean;
  socraticActive: boolean;
  isOnline: boolean;
  hesitationSeconds: number;
  /**
   * Module 26 calibration threshold. Defaults to the PRD's 45s so existing
   * callers keep their behaviour; the live grid passes the admin-calibrated
   * value so the cell colour agrees with the badge and label computed from the
   * same threshold beside it.
   */
  hesitationThresholdSeconds?: number;
  /**
   * "או שטרם החל סשן": false while no meeting is open. Callers that only know
   * the connection omit it and keep their behaviour.
   */
  sessionStarted?: boolean;
}

export function resolveRadarColor(input: RadarColorInput): RadarColor {
  if (input.helpRequested) return 'BLUE';
  if (input.socraticActive) return 'RED';
  if (!input.isOnline || input.sessionStarted === false) return 'GREY';
  if (input.hesitationSeconds >= (input.hesitationThresholdSeconds ?? 45)) return 'YELLOW';
  return 'GREEN';
}

/**
 * Tailwind classes for each radar colour, shared by grid cells and legends.
 * Owner, 11.10.2026 (round three, management by exception): one neutral 1px
 * hairline on every tile and no coloured shadow. The normal state (GREEN) is a
 * plain white tile — its colour is only the top bar and a small dot. Only the
 * three states that need the teacher (BLUE, RED, YELLOW) get a very light tint
 * of their colour; GREY is muted. Same five colours, same priority.
 */
export const RADAR_CELL_CLASSES: Record<RadarColor, string> = {
  BLUE: 'bg-blue-50/70 dark:bg-blue-950/30 border border-slate-200 dark:border-slate-700 text-blue-950 dark:text-blue-100',
  RED: 'bg-rose-50/70 dark:bg-rose-950/30 border border-slate-200 dark:border-slate-700 text-rose-950 dark:text-rose-100',
  GREY: 'bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400',
  YELLOW: 'bg-amber-50/70 dark:bg-amber-950/30 border border-slate-200 dark:border-slate-700 text-amber-950 dark:text-amber-100',
  GREEN: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
};

/** The solid status bar on the tile's top edge (3px). The radar draws it on BLUE, RED and YELLOW only (owner, 11.10.2026). */
export const RADAR_BAR_CLASSES: Record<RadarColor, string> = {
  BLUE: 'bg-blue-500',
  RED: 'bg-rose-500',
  GREY: 'bg-slate-300 dark:bg-slate-600',
  YELLOW: 'bg-amber-500',
  GREEN: 'bg-emerald-500',
};
