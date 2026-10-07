/**
 * How an exercise's instruction is laid out for the child (owner, 7.10.2026).
 *
 * The instructions were agreed sentence by sentence with the owner (28.9,
 * 29.9, 4.10.2026) and are not reworded here. What changes is the shape: one
 * block of four lines is hard for a third grader to hold, so the same words
 * are shown as the task, then its steps — the first sentence is what the
 * exercise is ("פתרו במאונך: 1,245 + 328."), and every sentence after it is a
 * numbered step in the order it is done. An instruction of one sentence
 * stays one sentence. The read-aloud reads the whole instruction as before.
 *
 * Splitting is by sentence end (. ! ?) followed by a space or a line break —
 * never inside a number (1,245), a quoted button name ("קבצו 10") or a
 * question mark that ends a step ("איזה מספר?" is a step of its own).
 */
export interface InstructionLayout {
  /** The task itself: the first sentence. */
  lead: string;
  /** The sentences after it, in order; empty for a one-sentence instruction. */
  steps: string[];
}

export function instructionLayout(instruction: string): InstructionLayout {
  const text = instruction.trim();
  if (!text) return { lead: '', steps: [] };
  const sentences: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    current += ch;
    if (ch === '"') inQuote = !inQuote;
    const ends = ch === '.' || ch === '!' || ch === '?';
    const next = text[i + 1];
    // A sentence ends at . ! ? followed by whitespace (or the end), outside quotes.
    // A period between digits (none in the banks, but 3.5 would be one) is not an end.
    if (ends && !inQuote && (next === undefined || /\s/.test(next)) && !(ch === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(next ?? ''))) {
      sentences.push(current.trim());
      current = '';
    } else if (ch === '\n' && current.trim()) {
      sentences.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) sentences.push(current.trim());
  const [lead = '', ...steps] = sentences;
  return { lead, steps };
}
