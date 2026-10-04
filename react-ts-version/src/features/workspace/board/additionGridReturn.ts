/**
 * The "לוח החיבור" button that brings the addition grid back — one name and
 * one look wherever it appears: the grid's return tab beside the board
 * (AdaptiveAdditionGrid.tsx) and the button under the coaching card
 * (HelpOverlays.tsx; owner, 4.10.2026). Kept apart from the grid component so
 * that the card does not import the grid.
 */

/** The grid's one name on the child's screen (the same string as ADDITION_GRID_HE). */
export const GRID_RETURN_NAME_HE = 'לוח החיבור';

/** What the button says to a screen reader, and on hover. */
export const GRID_RETURN_LABEL_HE = `הצגה חוזרת של ${GRID_RETURN_NAME_HE}`;

export const GRID_RETURN_BUTTON_LOOK =
  'rounded-2xl text-sm font-bold leading-tight transition-all cursor-pointer border shadow-md active:scale-95 bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-700/60 dark:text-amber-200';
