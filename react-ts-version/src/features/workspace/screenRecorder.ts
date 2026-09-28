/**
 * Module 21 — the learner's screen recording (rrweb), and when it may run.
 *
 *  "מקטעים שכתיבתם נכשלה נאגרים ב-IndexedDB… חל איסור מוחלט על השלכת מקטע שנכשל"
 *  "ההקלטה מוגבלת ל-50MB לכל לומד לכל מפגש"
 *  "לכל מקטע נשמרת מטא-דאטה הכוללת exercise_id בנוסף לחותמות הזמן"
 *
 * Where it is written (the teacher's replay, LearnerJourneyService, and the
 * class report read exactly these paths):
 *   users/students/{uid}/telemetry_sessions/session_{startedAt}/chunks/{key}
 *   users/students/{uid}/telemetry_sessions/session_{startedAt}/metadata/{key}
 *   users/students/{uid}/telemetry_sessions/session_{startedAt}/recording_truncated
 * and the 50MB budget of this learner in this meeting:
 *   users/students/{uid}/recorded_bytes/meeting_{N}
 */
import { ref, push, get, update, increment } from 'firebase/database';
import { database, authReady } from '@/infrastructure/firebase';
import {
  indexedDBQueue,
  queueRecordingChunk,
  queueRecordingChunkMetadata,
} from '@/infrastructure/services/IndexedDBQueue';

/** Module 21: 50MB of replay recording per learner per meeting, then a silent stop. */
export const RECORDING_BYTE_CAP = 50 * 1024 * 1024;
/** How often the buffered rrweb events become one chunk. */
export const RECORDING_FLUSH_INTERVAL_MS = 2000;

/** The recording of one class-session opening: its id is the server's start stamp. */
export const recordingIdOf = (classStartedAt: number): string => `session_${classStartedAt}`;

/** The node that holds a learner's recording budget, one field per meeting. */
export const recordingBudgetPath = (uid: string): string => `users/students/${uid}/recorded_bytes`;
export const recordingBudgetField = (meeting: number): string => `meeting_${meeting}`;

export interface RecordingGate {
  /** The learner's canonical id (student_userN); empty when none is signed in. */
  uid: string | null | undefined;
  /** The class session's server start stamp; null until it is known. */
  classStartedAt: number | null;
  /** The meeting this page is for (the URL's meeting). */
  meeting: number;
  /** The meeting the workspace store holds. */
  storeSessionNumber: number;
  /** The page has initialised or restored this meeting. */
  initialized: boolean;
  /** Another device took this learner's session over. */
  superseded: boolean;
}

/**
 * Whether the recorder may run. It used to start the moment the page mounted:
 *  - before the class session arrived, under `session_{Date.now()}` — a stray
 *    recording with a fresh 50MB of its own;
 *  - before initialisation, when the store still held the PREVIOUS meeting, so
 *    the first chunks of meeting 4 carried meeting 1's `s1_sandbox_controlled`;
 *  - on a device another device had taken over.
 */
export function shouldRecordScreen(g: RecordingGate): boolean {
  return Boolean(
    g.uid &&
      typeof g.classStartedAt === 'number' &&
      g.classStartedAt > 0 &&
      g.initialized &&
      g.storeSessionNumber === g.meeting &&
      !g.superseded
  );
}

type RecordFn = (options: Record<string, unknown>) => (() => void) | undefined;

async function loadRrwebRecord(): Promise<RecordFn | null> {
  const rrweb: any = await import('rrweb');
  const recordFn = rrweb.record || rrweb.default?.record || rrweb;
  if (typeof recordFn !== 'function') {
    console.error('rrweb.record is not a function:', rrweb);
    return null;
  }
  return recordFn as RecordFn;
}

export interface ScreenRecorderOptions {
  uid: string;
  meeting: number;
  classStartedAt: number;
  /** The exercise the learner is on now: each chunk's replay chapter. */
  currentExerciseId: () => string;
}

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/**
 * Starts recording; returns the stop function. Call it only when
 * shouldRecordScreen() holds. Stopping flushes what was captured so far.
 */
export function startScreenRecorder(opts: ScreenRecorderOptions): () => void {
  const { uid, meeting, classStartedAt, currentExerciseId } = opts;
  const recordingId = recordingIdOf(classStartedAt);
  const recordingPath = `users/students/${uid}/telemetry_sessions/${recordingId}`;
  const chunksPath = `${recordingPath}/chunks`;
  const metadataPath = `${recordingPath}/metadata`;
  const budgetPath = recordingBudgetPath(uid);
  const budgetField = recordingBudgetField(meeting);

  let stopRecorder: (() => void) | undefined;
  const stopRecording = () => {
    const stop = stopRecorder;
    stopRecorder = undefined;
    if (stop) stop();
  };
  let flushInterval: ReturnType<typeof setInterval> | undefined;
  let eventsQueue: any[] = [];
  let cancelled = false;
  let truncated = false;
  let recordedBytes = 0;

  // Every write goes into the device's queue first (Module 17 §ב), in order:
  // a chunk, then its metadata, then the bytes it used. Offline the database
  // SDK neither fails a write nor keeps it past a reload, so a write made to
  // it directly and queued only on failure was lost.
  let storing: Promise<unknown> = Promise.resolve();
  const store = (write: () => Promise<unknown>) => {
    storing = storing.then(write).catch((err) => console.error('[Recording] could not queue on this device:', err));
  };

  // The budget belongs to the learner and the meeting, not to this mount or to
  // one opening of the meeting: a refresh, or the teacher opening the same
  // meeting again, continues the same count. Each chunk adds its size on the
  // server (increment), so two mounts never overwrite each other's count.
  const budgetReady = get(ref(database, `${budgetPath}/${budgetField}`))
    .then((snap) => {
      recordedBytes = Number(snap.val()) || 0;
      truncated = recordedBytes >= RECORDING_BYTE_CAP;
    })
    .catch(() => { /* unknown (offline) — count from here; the server total still adds up */ });

  const flush = () => {
    if (truncated || eventsQueue.length === 0) return;

    const batch = eventsQueue;
    eventsQueue = [];
    const payload = JSON.stringify(batch);
    const payloadBytes = byteLength(payload);

    if (recordedBytes + payloadBytes > RECORDING_BYTE_CAP) {
      truncated = true;
      stopRecording();
      if (flushInterval) clearInterval(flushInterval);
      store(() => indexedDBQueue.enqueueRtdbMerge(recordingPath, { recording_truncated: true }, `${recordingId}_truncated`));
      return;
    }

    // push() with no value only mints a time-ordered key; nothing is written.
    const chunkKey = push(ref(database, chunksPath)).key as string;
    recordedBytes += payloadBytes;
    const meta = {
      startTime: batch[0].timestamp,
      endTime: batch[batch.length - 1].timestamp,
      sessionNumber: meeting,
      exercise_id: currentExerciseId(),
    };

    store(() => queueRecordingChunk(chunksPath, chunkKey, payload));
    store(() => queueRecordingChunkMetadata(metadataPath, chunkKey, meta));
    store(() => indexedDBQueue.enqueueRtdbMerge(budgetPath, { [budgetField]: increment(payloadBytes) }, `${chunkKey}_bytes`));
  };

  (async () => {
    const recordFn = await loadRrwebRecord();
    if (cancelled || !recordFn) return;
    const authOk = await authReady;
    if (!authOk || cancelled) return;
    await budgetReady;
    if (cancelled || truncated) return;

    update(ref(database, `users/students/${uid}`), { latestTelemetrySessionId: recordingId }).catch(() => {});

    stopRecorder = recordFn({
      emit(event: any) {
        eventsQueue.push(event);
      },
      sampling: {
        mousemove: 50,
        mouseInteraction: true,
        scroll: 150,
        input: 'last',
      },
      recordCanvas: true,
      collectFonts: true,
      inlineStylesheet: true,
    });

    flushInterval = setInterval(flush, RECORDING_FLUSH_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', flush);
      window.addEventListener('pagehide', flush);
    }
  })();

  return () => {
    cancelled = true;
    stopRecording();
    if (flushInterval) clearInterval(flushInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    }
    flush();
  };
}
