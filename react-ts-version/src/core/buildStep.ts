/**
 * Which step of an instruction is a step of building (owner, 7.10.2026).
 *
 * A step the child can mark as done is a step where the child built a
 * number and has to judge for themself whether it is right: "בנו את 713",
 * "בנו בבית המספרים 3 לבני מאה ו-4 לבני עשרת", "ייצגו את המספרים בעזרת
 * לבנים". Nothing else gets a mark — not an interface action (undo, group,
 * break, press a button: those just happen on the board) and not the
 * writing of the answer (that is what "ממשיכים" judges). The mark says
 * "סימנתי", never "נכון": the system does not check it, and it opens and
 * locks nothing. The gap between a child's "I am done" and what the board
 * shows is self-monitoring, measured (STEP_MARKED_DONE), not graded.
 *
 * Only the words decide, so a step is a build step in every exercise it
 * appears in, with no list to maintain. Both forms the banks use: the
 * imperative "בנו …" / "ייצגו …" and station 1's "נסו לבנות". In most
 * exercises the build sentence is the instruction's FIRST sentence (the
 * lead: "בנו 61 והוציאו ממנו 24:"), so the mark sits beside the lead there.
 */
// No \b: JavaScript's word boundary is ASCII-only, so it never matches after
// a Hebrew letter. The verb must be followed by a space (or end).
const BUILD_STEP = /^(?:משימת היעד: )?(?:בנו|ייצגו|נסו לבנות)(?=\s|$)/;

/** Whether the step `text` (one sentence of an instruction) is a build step. */
export function isBuildStep(text: string): boolean {
  return BUILD_STEP.test(text.trim());
}

/**
 * The mark's words (owner, 7.10.2026). One word, first person, about what the
 * child did — "בניתי" — not "סיימתי", which sounds like an end the system
 * confirms. Marked: the same word with a grey tick beside it: "סימנתי", never
 * "נכון". The read-aloud says what the button does, not a verdict.
 */
export const MARK_BUILT_HE = 'בניתי';
export const MARK_BUILT_ARIA_HE = 'סמנו כאן כשבניתם';
export const MARK_BUILT_MARKED_ARIA_HE = 'סומן: בניתי. לחיצה נוספת מבטלת את הסימון';
