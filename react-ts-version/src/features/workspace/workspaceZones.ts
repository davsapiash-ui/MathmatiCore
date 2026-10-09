/**
 * The learner's screen split (owner's decision, 9.10.2026, replacing PRD
 * Module 7 §א's 60 : 40): under the top bar, the representations zone (the
 * number house and its blocks) takes 55% of the width, on the visual left, and
 * the task-and-response zone (the task card, the result row and the coaching
 * card) takes 45%, on the right. As flex shares of one row: 11 : 9.
 */
export const BOARD_ZONE_FLEX = '11 1 0%';
export const TASK_ZONE_FLEX = '9 1 0%';

/**
 * The task zone's wrapper class (index.css): a size container for its inline
 * size, so the task card's notebook square (TASK_CARD_CELL) follows the zone.
 */
export const TASK_ZONE_CELL_CLASS = 'task-zone-cells';
