import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { CATCHUP_COLLECTION } from "./catchUp";
import { scrubPII } from "./geminiProxy";

/**
 * PRD 14 §ב0 ("הערה חופשית … הנבדקת לפרטים מזהים בדפדפן ובשרת, מודול 3") and
 * architecture invariant 1 (Zero-PII). The teacher's client checks a catch-up
 * note before writing it (validateCatchUpNote), but the teacher writes the
 * record straight to Firestore, and the rules accept any string up to the cap.
 * Reports and the export scrub the note on the way out (sanitizeCatchUpNote);
 * this trigger scrubs it where it is stored, so the stored record itself holds
 * no identifying detail.
 *
 * Loop guard: a note is rewritten only when scrubPII changes it. scrubPII
 * leaves its own placeholders alone, so the trigger's own write finds nothing
 * more to change and writes nothing.
 */

export interface CatchUpNoteRewrite {
  roundId: string;
  note: string;
}

/** The rounds whose stored note scrubPII would change, with the scrubbed note. */
export function catchUpNoteRewrites(record: Record<string, unknown> | null | undefined): CatchUpNoteRewrite[] {
  const rounds = record?.rounds;
  if (!rounds || typeof rounds !== "object") return [];
  const out: CatchUpNoteRewrite[] = [];
  for (const [roundId, round] of Object.entries(rounds as Record<string, unknown>)) {
    const note = round && typeof round === "object" ? (round as Record<string, unknown>).note : undefined;
    if (typeof note !== "string" || !note) continue;
    const scrubbed = scrubPII(note);
    if (scrubbed !== note) out.push({ roundId, note: scrubbed });
  }
  return out;
}

export const scrubCatchUpNotes = onDocumentWritten({
  document: `${CATCHUP_COLLECTION}/{docId}`,
  region: "us-central1",
}, async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return; // Deleted (a reset).
  const rewrites = catchUpNoteRewrites(after.data());
  if (rewrites.length === 0) return;

  const fieldOf = (r: CatchUpNoteRewrite) => new admin.firestore.FieldPath("rounds", r.roundId, "note");
  const [first, ...rest] = rewrites;
  try {
    // Only the notes change: the server's own fields on the rounds are untouched.
    await after.ref.update(fieldOf(first), first.note, ...rest.flatMap((r) => [fieldOf(r), r.note]));
    logger.info(`Catch-up record ${event.params.docId}: identifying details removed from ${rewrites.length} note(s).`);
  } catch (err) {
    logger.error(`Catch-up record ${event.params.docId}: scrubbing the note failed:`, err);
  }
});
