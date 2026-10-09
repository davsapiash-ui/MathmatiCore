/**
 * PRD Module 7 §א, "חלוקת מסך הלומד": under the top bar, the representations
 * zone (the number house and its blocks) takes 60% of the width, on the visual
 * left, and the task-and-response zone (the task card, the result row and the
 * coaching card) takes 40%, on the right. As flex shares of one row: 3 : 2.
 */
// TRIAL ONLY (owner's 55/45 comparison, 9.10.2026, branch claude/split-compare):
// VITE_WORKSPACE_SPLIT=55-45 at dev-server start renders 55 : 45 (11 : 9).
// Unset — every build and deploy — the PRD's 60 : 40 stays. Not for main.
const TRIAL_55_45 = import.meta.env.VITE_WORKSPACE_SPLIT === '55-45';
export const BOARD_ZONE_FLEX = TRIAL_55_45 ? '11 1 0%' : '3 1 0%';
export const TASK_ZONE_FLEX = TRIAL_55_45 ? '9 1 0%' : '2 1 0%';

/**
 * The task zone's wrapper class (index.css): a size container for its inline
 * size, so the task card's notebook square (TASK_CARD_CELL) follows the zone.
 */
export const TASK_ZONE_CELL_CLASS = 'task-zone-cells';
