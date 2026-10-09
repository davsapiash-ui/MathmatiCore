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

/*
 * The learner's screen under the top bar, as classes shared with the teacher's
 * demonstration screen (ProjectorSandboxPage, PRD Module 15 §ג: the task zone
 * "כמו שהלומדים רואים אותו"), so the two cannot drift apart.
 */

/** The page's surface: the learner's background, ink and body font. */
export const WORKSPACE_SURFACE_CLASS = 'font-body text-ws-ink bg-ws-bg';
/** The row that holds the two zones: its paddings and the gap between them. */
export const WORKSPACE_MAIN_CLASS = 'flex flex-row flex-1 overflow-hidden p-fl-10-20 gap-fl-10-20 w-full box-border';
/** The task-and-response zone (on the right). */
export const TASK_ZONE_CLASS = 'relative min-h-0 min-w-0 flex flex-col';
/** The task card's wrapper inside the task zone. */
export const TASK_ZONE_INNER_CLASS = `flex-1 min-h-0 min-w-0 flex flex-col ${TASK_ZONE_CELL_CLASS}`;
/** The representations zone (on the visual left). */
export const BOARD_ZONE_CLASS = 'min-h-0 min-w-0 flex flex-row gap-2';
