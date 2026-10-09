/**
 * PRD Module 7 §א, "חלוקת מסך הלומד": under the top bar, the representations
 * zone (the number house and its blocks) takes 60% of the width, on the visual
 * left, and the task-and-response zone (the task card, the result row and the
 * coaching card) takes 40%, on the right. As flex shares of one row: 3 : 2.
 */
export const BOARD_ZONE_FLEX = '3 1 0%';
export const TASK_ZONE_FLEX = '2 1 0%';

/**
 * The task zone's wrapper class (index.css): a size container for its inline
 * size, so the task card's notebook square (TASK_CARD_CELL) follows the zone.
 */
export const TASK_ZONE_CELL_CLASS = 'task-zone-cells';
