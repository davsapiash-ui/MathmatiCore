/**
 * Catch-up time: the teacher's writes and reads of catchup_records.
 * Contract stubs (part C1 implements; see DESIGN.md of claude/catch-up-time
 * and core/catchUp.ts for the data shape).
 */
import type { CatchUpAction, CatchUpReasonEntry, CatchUpRecord } from '@/core/catchUp';

export interface RecordCatchUpInput {
  meeting: number;
  action: CatchUpAction;
  entries: CatchUpReasonEntry[];
  /** The teacher's auth uid. */
  teacherUid: string;
  /** serverNow() at confirmation; also the round id (catchUpRoundId). */
  recordedAt: number;
  classId?: string;
}

/**
 * Adds one round per entry to catchup_records/{catchUpDocId(meeting, n)}
 * (merge; only the new round key; server-only fields null). Notes are
 * re-validated (validateCatchUpNote); an entry whose note fails is refused
 * before anything is written. Resolves when every write is acknowledged, so
 * the caller may open the meeting right after (the server trigger then finds
 * the 'reopen' rounds). Rejects on a refused write.
 */
export async function recordCatchUpReasons(_input: RecordCatchUpInput): Promise<void> {
  throw new Error('not implemented: recordCatchUpReasons (part C1)');
}

/** Every catch-up record of one meeting (teacher/admin token), keyed by learner number. */
export async function fetchCatchUpRecords(_meeting: number): Promise<Record<number, CatchUpRecord>> {
  throw new Error('not implemented: fetchCatchUpRecords (part C1)');
}

/** Live listener on one meeting's records (dashboard meeting bar). Returns the unsubscribe. */
export function subscribeCatchUpRecords(
  _meeting: number,
  _onChange: (records: Record<number, CatchUpRecord>) => void
): () => void {
  throw new Error('not implemented: subscribeCatchUpRecords (part C1)');
}
