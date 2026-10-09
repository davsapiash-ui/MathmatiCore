/**
 * The task zone shows an instruction one sentence per line (owner's station-1
 * review, 7.10.2026: "dense and badly arranged"). Only the layout changes: the
 * words, their order and the punctuation are the instruction's own, so the
 * lines joined with a space are the instruction again (the read-aloud button
 * still reads `instructionHe` itself).
 *
 * A sentence ends at ".", "!" or "?" followed by a space, or at a line break
 * the instruction already has. Numbers ("1,245", "4▢2") never contain a
 * sentence end followed by a space, so they are never split.
 */
export function instructionLines(text: string | undefined): string[] {
  // A task built without an instruction (a test's hand-made task) has no lines.
  return (text ?? '')
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}
