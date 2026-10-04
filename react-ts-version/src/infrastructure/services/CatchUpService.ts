/**
 * Catch-up time: the teacher's writes and reads of catchup_records.
 *
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \ זמן
 * נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה למפגש
 * הבא". See core/catchUp.ts for the data shape. The teacher writes only new
 * rounds; the server (functions/src/catchUpRounds.ts) fills opened_at,
 * closed_at, closed_by and active_minutes.
 */
import { collection, doc, onSnapshot, getDocs, query, setDoc, where, type QuerySnapshot } from 'firebase/firestore';
import { firestore } from '@/infrastructure/firebase';
import {
  CATCHUP_COLLECTION,
  catchUpDocId,
  catchUpRoundId,
  isCatchUpReasonKey,
  validateCatchUpNote,
  type CatchUpAction,
  type CatchUpReasonEntry,
  type CatchUpRecord,
  type CatchUpRound,
} from '@/core/catchUp';

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

/** The pilot's one class (Module 25 §ב.1). */
const PILOT_CLASS_ID = 'class_1';

/** The teacher's label of where the learner stopped ("תרגיל 4 מתוך 7"): short, never prose. */
const STOPPED_AT_MAX_LENGTH = 80;

/**
 * Adds one round per entry to catchup_records/{catchUpDocId(meeting, n)}
 * (merge; only the new round key; server-only fields null). Notes are
 * re-validated (validateCatchUpNote); an entry whose note fails is refused
 * before anything is written. Resolves when every write is acknowledged, so
 * the caller may open the meeting right after (the server trigger then finds
 * the 'reopen' rounds). Rejects on a refused write.
 */
export async function recordCatchUpReasons(input: RecordCatchUpInput): Promise<void> {
  const { meeting, action, entries, teacherUid, recordedAt } = input;
  if (!Number.isInteger(meeting) || meeting < 1 || meeting > 8) {
    throw new Error(`recordCatchUpReasons: meeting must be 1–8, got ${meeting}`);
  }
  if (action !== 'reopen' && action !== 'continue') {
    throw new Error(`recordCatchUpReasons: unknown action ${String(action)}`);
  }
  if (!teacherUid) throw new Error('recordCatchUpReasons: no teacher uid');
  if (!Number.isFinite(recordedAt) || recordedAt <= 0) {
    throw new Error('recordCatchUpReasons: recordedAt must be a server-clock time');
  }
  const classId = input.classId || PILOT_CLASS_ID;
  const roundId = catchUpRoundId(recordedAt);

  // Every entry is checked before the first write: one refused note writes nothing.
  const seen = new Set<number>();
  const writes = entries.map((entry) => {
    const n = entry.studentNumber;
    if (!Number.isInteger(n) || n < 1 || n > 12) {
      throw new Error(`recordCatchUpReasons: learner number must be 1–12, got ${n}`);
    }
    if (seen.has(n)) throw new Error(`recordCatchUpReasons: learner ${n} appears twice`);
    seen.add(n);
    if (!isCatchUpReasonKey(entry.reason)) {
      throw new Error(`recordCatchUpReasons: learner ${n} has no valid reason`);
    }
    const note = validateCatchUpNote(entry.note);
    if (!note.ok) throw new Error(note.errorHe);
    const stoppedAt = typeof entry.stoppedAtHe === 'string' && entry.stoppedAtHe.trim()
      ? entry.stoppedAtHe.trim().slice(0, STOPPED_AT_MAX_LENGTH)
      : null;
    const round: CatchUpRound = {
      action,
      reason: entry.reason,
      note: note.note,
      stopped_at: stoppedAt,
      recorded_by: teacherUid,
      recorded_at: Math.floor(recordedAt),
      opened_at: null,
      closed_at: null,
      closed_by: null,
      active_minutes: null,
    };
    return {
      id: catchUpDocId(meeting, n),
      data: { student_id: n, session_number: meeting, class_id: classId, rounds: { [roundId]: round } },
    };
  });

  await Promise.all(
    writes.map(({ id, data }) => setDoc(doc(firestore, CATCHUP_COLLECTION, id), data, { merge: true }))
  );
}

function recordsFromSnapshot(snap: QuerySnapshot): Record<number, CatchUpRecord> {
  const out: Record<number, CatchUpRecord> = {};
  snap.docs.forEach((d) => {
    const data = d.data() as Partial<CatchUpRecord>;
    const n = Number(data.student_id) || Number(/_student_(\d+)$/.exec(d.id)?.[1]);
    if (!Number.isInteger(n) || n < 1 || n > 12) return;
    out[n] = {
      student_id: n,
      session_number: Number(data.session_number),
      class_id: typeof data.class_id === 'string' ? data.class_id : PILOT_CLASS_ID,
      rounds: data.rounds && typeof data.rounds === 'object' ? data.rounds : {},
    };
  });
  return out;
}

function meetingQuery(meeting: number) {
  return query(collection(firestore, CATCHUP_COLLECTION), where('session_number', '==', meeting));
}

/** Every catch-up record of one meeting (teacher/admin token), keyed by learner number. */
export async function fetchCatchUpRecords(meeting: number): Promise<Record<number, CatchUpRecord>> {
  return recordsFromSnapshot(await getDocs(meetingQuery(meeting)));
}

/** Live listener on one meeting's records (dashboard meeting bar). Returns the unsubscribe. */
export function subscribeCatchUpRecords(
  meeting: number,
  onChange: (records: Record<number, CatchUpRecord>) => void
): () => void {
  return onSnapshot(
    meetingQuery(meeting),
    (snap) => onChange(recordsFromSnapshot(snap)),
    (err) => {
      // A refused read (e.g. a token without the teacher role yet) shows no
      // records rather than breaking the dashboard.
      console.warn('[CatchUpService] catch-up records listener failed:', err);
      onChange({});
    }
  );
}
