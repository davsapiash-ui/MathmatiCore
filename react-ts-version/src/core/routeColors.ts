import type { RoutePath } from './routeLabels';

/**
 * One colour per learning level, on every staff screen (radar, class management, the gate drawer, the admin
 * catalog) — DESIGN_SYSTEM_RULES.md "צבעי המסלולים". Colour is never the only cue: every place that paints a
 * level also writes its name.
 *
 * PRD Module 18 §ב keeps the radar's five status colours (blue, red, grey, yellow/amber, green) for the radar;
 * the only exception is the green path's tag. So the remediation level is a warm stone, not amber — amber is the
 * radar's "היסוס". The tile background is never painted by a level; the level is a thin stripe on its edge.
 *
 * Tailwind reads these class names from the source, so they are written out in full.
 */
export interface RouteColor {
  /** A thin edge stripe (radar tile, table row, catalog card). */
  stripe: string;
  /** A small dot next to the level's name. */
  dot: string;
  /** A soft chip that carries the level's name. */
  chip: string;
  /** An approve button: pressed (the approved level) and not. */
  buttonOn: string;
  buttonOff: string;
  /** A selectable card (the gate drawer): chosen. */
  cardOn: string;
}

export const ROUTE_COLOR: Readonly<Record<RoutePath, RouteColor>> = {
  green_path: {
    stripe: 'bg-emerald-600',
    dot: 'bg-emerald-600',
    chip: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
    buttonOn: 'bg-emerald-700 text-white shadow-sm',
    buttonOff: 'bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-50 dark:bg-slate-800 dark:text-emerald-200 dark:border-emerald-800',
    cardOn: 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20',
  },
  remediation_path: {
    stripe: 'bg-stone-500',
    dot: 'bg-stone-500',
    chip: 'bg-stone-100 text-stone-800 dark:bg-stone-900/60 dark:text-stone-200',
    buttonOn: 'bg-stone-600 text-white shadow-sm',
    buttonOff: 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 dark:bg-slate-800 dark:text-stone-200 dark:border-stone-700',
    cardOn: 'border-stone-600 bg-stone-50/60 dark:bg-stone-950/40 ring-2 ring-stone-500/20',
  },
  graded_path: {
    stripe: 'bg-violet-600',
    dot: 'bg-violet-600',
    chip: 'bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200',
    buttonOn: 'bg-violet-700 text-white shadow-sm',
    buttonOff: 'bg-white text-violet-900 border border-violet-300 hover:bg-violet-50 dark:bg-slate-800 dark:text-violet-200 dark:border-violet-800',
    cardOn: 'border-violet-600 bg-violet-50/60 dark:bg-violet-950/40 ring-2 ring-violet-500/20',
  },
  // Module 18 §ב: outside the radar's status colours the staff screens use the brand violet and greys only, so the
  // foundations level is the graded level's light shade, set apart by its outline.
  graded_foundation_path: {
    stripe: 'bg-violet-300',
    dot: 'bg-violet-300',
    chip: 'bg-violet-50 text-violet-800 border border-violet-300 dark:bg-violet-950/30 dark:text-violet-200 dark:border-violet-700',
    buttonOn: 'bg-violet-200 text-violet-950 border-2 border-violet-500 shadow-sm',
    buttonOff: 'bg-white text-violet-800 border border-dashed border-violet-300 hover:bg-violet-50 dark:bg-slate-800 dark:text-violet-200 dark:border-violet-700',
    cardOn: 'border-violet-400 bg-violet-50/40 dark:bg-violet-950/20 ring-2 ring-violet-300/30',
  },
};
