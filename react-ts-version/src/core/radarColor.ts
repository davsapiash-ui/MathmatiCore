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
}

export function resolveRadarColor(input: RadarColorInput): RadarColor {
  if (input.helpRequested) return 'BLUE';
  if (input.socraticActive) return 'RED';
  if (!input.isOnline) return 'GREY';
  if (input.hesitationSeconds >= 45) return 'YELLOW';
  return 'GREEN';
}

/** Tailwind classes for each radar colour, shared by grid cells and legends. */
export const RADAR_CELL_CLASSES: Record<RadarColor, string> = {
  BLUE: 'bg-blue-500/20 border-2 border-blue-500 text-blue-950 dark:text-blue-100',
  RED: 'bg-rose-500/20 border-2 border-rose-500 text-rose-950 dark:text-rose-100',
  GREY: 'bg-slate-100 dark:bg-slate-800/60 border-2 border-slate-300 dark:border-slate-700 text-slate-500',
  YELLOW: 'bg-amber-500/20 border-2 border-amber-500 text-amber-950 dark:text-amber-100',
  GREEN: 'bg-emerald-500/15 border-2 border-emerald-500 text-emerald-950 dark:text-emerald-100',
};
