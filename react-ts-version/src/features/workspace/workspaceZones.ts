/**
 * PRD Module 7 §א, "חלוקת מסך הלומד": under the top bar, the representations
 * zone (the number house and its blocks) takes 60% of the width, on the visual
 * left, and the task-and-response zone (the task card, the result row and the
 * coaching card) takes 40%, on the right. As flex shares of one row: 3 : 2.
 */
export const BOARD_ZONE_FLEX = '3 1 0%';
export const TASK_ZONE_FLEX = '2 1 0%';

/**
 * The notebook square inside the task zone (index.css, `.task-zone-cells`):
 * the global one, clamp(40px, min(7.4vh, 5vw), 64px), and no wider than a
 * seventh and a half of the zone after the card's paddings — a 4-digit sheet is
 * seven squares across. The wrapper is a size container for its inline size, so
 * the square follows the zone (cqi), not the window. The rule sits in the
 * stylesheet, not here, because it must also hold when the task card sets its
 * own square while the coaching card is open.
 */
export const TASK_ZONE_CELL_CLASS = 'task-zone-cells';
