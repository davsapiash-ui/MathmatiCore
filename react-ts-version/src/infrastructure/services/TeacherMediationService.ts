/**
 * Measure 5 (PRD Module 23): reads the mediation events of the open meeting and
 * reads/writes the teacher's records (teacher_mediation_log). See
 * core/teacherMediation.ts for the data shape and the join with the export.
 */
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { auth, authReady, firestore, serverNow } from '@/infrastructure/firebase';
import {
  MEDIATION_CLASS_ID,
  MEDIATION_LOG_COLLECTION,
  MEDIATION_TELEMETRY_KINDS,
  RUN_START_SLACK_MS,
  mediationEventFromTelemetry,
  mediationRecordDocId,
  type MediationAction,
  type MediationEvent,
  type MediationRecord,
} from '@/core/teacherMediation';

/**
 * The mediation events in telemetry_logs of `meeting` since the run started.
 * One range filter on client_timestamp (a single-field index); the kind and the
 * meeting are filtered here. Returns the unsubscribe.
 */
export function subscribeMeetingMediationTelemetry(
  meeting: number,
  runStartedAt: number,
  onChange: (events: MediationEvent[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  authReady.then(() => {
    if (cancelled) return;
    off = onSnapshot(
      query(collection(firestore, 'telemetry_logs'), where('client_timestamp', '>=', runStartedAt - RUN_START_SLACK_MS)),
      (snap) => {
        const events: MediationEvent[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          if (!MEDIATION_TELEMETRY_KINDS[String(data.event_type)]) return;
          const e = mediationEventFromTelemetry(d.id, data, meeting);
          if (e) events.push(e);
        });
        onChange(events);
      },
      (err) => onError?.(err),
    );
  }).catch((err) => onError?.(err));
  return () => {
    cancelled = true;
    off?.();
  };
}

const ACTIONS = new Set(['wrote', 'approached', 'wrote_and_approached', 'none']);

/** A stored record, or null when it is not one. */
export function mediationRecordFromDoc(id: string, d: Record<string, unknown> | null | undefined): MediationRecord | null {
  if (!d) return null;
  const n = d.student_id;
  const m = d.session_number;
  if (typeof n !== 'number' || n < 1 || n > 12 || typeof m !== 'number' || m < 1 || m > 8) return null;
  if (!ACTIONS.has(String(d.action)) || typeof d.data_led !== 'boolean') return null;
  return {
    id,
    class_id: String(d.class_id ?? ''),
    student_id: n,
    session_number: m,
    event_ref: typeof d.event_ref === 'string' && d.event_ref ? d.event_ref : null,
    event_time_iso: String(d.event_time_iso ?? ''),
    action: d.action as MediationAction,
    data_led: d.data_led,
    note: null,
    recorded_at: typeof d.recorded_at === 'number' ? d.recorded_at : 0,
    recorded_by: String(d.recorded_by ?? ''),
  };
}

/** The class's records of `meeting`, live. Returns the unsubscribe. */
export function subscribeMediationRecords(
  meeting: number,
  onChange: (records: MediationRecord[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  authReady.then(() => {
    if (cancelled) return;
    off = onSnapshot(
      query(
        collection(firestore, MEDIATION_LOG_COLLECTION),
        where('class_id', '==', MEDIATION_CLASS_ID),
        where('session_number', '==', meeting),
      ),
      (snap) => {
        const out: MediationRecord[] = [];
        snap.forEach((d) => {
          const r = mediationRecordFromDoc(d.id, d.data() as Record<string, unknown>);
          if (r) out.push(r);
        });
        onChange(out);
      },
      (err) => onError?.(err),
    );
  }).catch((err) => onError?.(err));
  return () => {
    cancelled = true;
    off?.();
  };
}

export interface SaveMediationInput {
  meeting: number;
  studentNumber: number;
  /** The event recorded; null for a physical approach without an event. */
  event: MediationEvent | null;
  action: MediationAction;
  dataLed: boolean;
  /** Editing an existing record (a self-initiated one has a random id). */
  existingId?: string;
  /** The original time of an edited self-initiated record. */
  existingTimeIso?: string;
}

/**
 * Writes one record. An event's record has a deterministic id, so a second
 * save edits it. Resolves with the record written; rejects on a refused write
 * (a read-only account is refused by the rules as well as by the screen).
 */
export async function saveMediationRecord(input: SaveMediationInput): Promise<MediationRecord> {
  const { meeting, studentNumber, event, action, dataLed } = input;
  if (!Number.isInteger(meeting) || meeting < 1 || meeting > 8) throw new Error('saveMediationRecord: meeting must be 1–8');
  if (!Number.isInteger(studentNumber) || studentNumber < 1 || studentNumber > 12) throw new Error('saveMediationRecord: learner must be 1–12');
  if (!ACTIONS.has(action)) throw new Error('saveMediationRecord: unknown action');
  if (typeof dataLed !== 'boolean') throw new Error('saveMediationRecord: data_led must be chosen');
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('saveMediationRecord: not signed in');
  const now = serverNow();
  const ref = input.existingId
    ? doc(firestore, MEDIATION_LOG_COLLECTION, input.existingId)
    : event
      ? doc(firestore, MEDIATION_LOG_COLLECTION, mediationRecordDocId(event.ref))
      : doc(collection(firestore, MEDIATION_LOG_COLLECTION));
  const data = {
    class_id: MEDIATION_CLASS_ID,
    student_id: studentNumber,
    session_number: meeting,
    event_ref: event ? event.ref : null,
    event_time_iso: event ? new Date(event.at).toISOString() : input.existingTimeIso || new Date(now).toISOString(),
    action: event ? action : 'approached',
    data_led: dataLed,
    note: null,
    recorded_at: now,
    recorded_by: uid,
  } satisfies Omit<MediationRecord, 'id'>;
  await setDoc(ref, data);
  return { id: ref.id, ...data };
}
