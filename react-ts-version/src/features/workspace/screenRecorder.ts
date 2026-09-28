/**
 * Module 21 — the learner's screen recording (rrweb), and when it may run.
 *
 *  "מקטעים שכתיבתם נכשלה נאגרים ב-IndexedDB… חל איסור מוחלט על השלכת מקטע שנכשל"
 *  "ההקלטה מוגבלת ל-50MB לכל לומד לכל מפגש… נרשם דגל recording_truncated: true"
 *  "לכל מקטע נשמרת מטא-דאטה הכוללת exercise_id בנוסף לחותמות הזמן"
 *
 * Where it is written (the teacher's replay, LearnerJourneyService, and the
 * class report read exactly these paths):
 *   users/students/{uid}/telemetry_sessions/session_{startedAt}/chunks/{key}
 *   users/students/{uid}/telemetry_sessions/session_{startedAt}/metadata/{key}
 *   users/students/{uid}/telemetry_sessions/session_{startedAt}/recording_truncated
 * and the 50MB budget of this learner in this meeting, where the per-meeting
 * reports (classReport, exportDriveReport) also find its flag:
 *   users/students/{uid}/recorded_bytes/meeting_{N}/chunks/{key}: bytes
 *   users/students/{uid}/recorded_bytes/meeting_{N}/truncated: true
 */
import { ref, push, get } from 'firebase/database';
import { database, authReady } from '@/infrastructure/firebase';
import {
  indexedDBQueue,
  queueRecordingChunk,
  queueRecordingChunkMetadata,
} from '@/infrastructure/services/IndexedDBQueue';
import { throttledRtdbUpdate } from '@/infrastructure/services/ThrottledRtdbWriter';

/** Module 21: 50MB of replay recording per learner per meeting, then a silent stop. */
export const RECORDING_BYTE_CAP = 50 * 1024 * 1024;
/** How often the buffered rrweb events become one chunk. */
export const RECORDING_FLUSH_INTERVAL_MS = 2000;

/** The recording of one class-session opening: its id is the server's start stamp. */
export const recordingIdOf = (classStartedAt: number): string => `session_${classStartedAt}`;

/** The node that holds this learner's recording budget for one meeting. */
export const recordingBudgetPath = (uid: string, meeting: number): string => `users/students/${uid}/recorded_bytes/meeting_${meeting}`;

/**
 * The bytes a meeting's budget has used: the sum of its chunks' sizes. Each
 * chunk's size is stored under the chunk's own key, so a re-delivered write
 * (the queue delivers at least once) or a second tab can never count a chunk
 * twice — a running total or an increment could.
 */
export function budgetBytesUsed(budget: unknown): number {
  const chunks = budget && typeof budget === 'object' ? (budget as { chunks?: unknown }).chunks : null;
  if (!chunks || typeof chunks !== 'object') return 0;
  let total = 0;
  for (const v of Object.values(chunks as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

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
  const budgetPath = recordingBudgetPath(uid, meeting);

  let stopRecorder: (() => void) | undefined;
  const stopRecording = () => {
    const stop = stopRecorder;
    stopRecorder = undefined;
    if (stop) stop();
  };
  let flushInterval: ReturnType<typeof setInterval> | undefined;
  let eventsQueue: any[] = [];
  /** The exercise the buffered events belong to, taken when they were buffered. */
  let batchExerciseId = '';
  let cancelled = false;
  let truncated = false;
  let recordedBytes = 0;
  let chunksThisRecording = 0;

  // Every write goes into the device's queue first (Module 17 §ב), in order:
  // a chunk, then its metadata, then its size. Offline the database SDK neither
  // fails a write nor keeps it past a reload, so a write made to it directly
  // and queued only on failure was lost.
  let storing: Promise<unknown> = Promise.resolve();
  const store = (write: () => Promise<unknown>) => {
    storing = storing.then(write).catch((err) => console.error('[Recording] could not queue on this device:', err));
  };

  /** The meeting's budget is spent: flagged where the per-meeting reports read it. */
  const flagTruncated = () => {
    store(() => indexedDBQueue.enqueueRtdbMerge(budgetPath, { truncated: true }, `${budgetPath}#truncated`));
    // The recording's own flag (the replay reads it) — only on a recording that
    // holds chunks, never on an empty node the reports cannot place.
    if (chunksThisRecording > 0) {
      store(() => indexedDBQueue.enqueueRtdbMerge(recordingPath, { recording_truncated: true }, `${recordingId}#truncated`));
    }
  };

  // The budget belongs to the learner and the meeting, not to this mount or to
  // one opening of the meeting: a refresh, or the teacher opening the same
  // meeting again, continues the same count.
  const budgetReady = get(ref(database, budgetPath))
    .then((snap) => {
      const budget = snap.val();
      recordedBytes = budgetBytesUsed(budget);
      if (recordedBytes >= RECORDING_BYTE_CAP || (budget && budget.truncated === true)) {
        truncated = true;
        if (!(budget && budget.truncated === true)) flagTruncated();
      }
    })
    .catch(() => { /* unknown (offline) — count from here; the per-chunk sizes still add up on the server */ });

  const flush = () => {
    if (truncated || eventsQueue.length === 0) return;

    const batch = eventsQueue;
    const exerciseId = batchExerciseId;
    eventsQueue = [];
    const payload = JSON.stringify(batch);
    const payloadBytes = byteLength(payload);

    if (recordedBytes + payloadBytes > RECORDING_BYTE_CAP) {
      truncated = true;
      stopRecording();
      if (flushInterval) clearInterval(flushInterval);
      flagTruncated();
      return;
    }

    // push() with no value only mints a time-ordered key; nothing is written.
    const chunkKey = push(ref(database, chunksPath)).key as string;
    recordedBytes += payloadBytes;
    chunksThisRecording++;
    const meta = {
      startTime: batch[0].timestamp,
      endTime: batch[batch.length - 1].timestamp,
      sessionNumber: meeting,
      exercise_id: exerciseId,
    };

    store(() => queueRecordingChunk(chunksPath, chunkKey, payload));
    store(() => queueRecordingChunkMetadata(metadataPath, chunkKey, meta));
    store(() => indexedDBQueue.enqueueRtdbMerge(`${budgetPath}/chunks`, { [chunkKey]: payloadBytes }, `${chunkKey}#bytes`));
  };

  /**
   * An rrweb event joins the current chunk. Its exercise is read NOW: read at
   * flush time instead, the last chunk before a teacher reset carried the
   * exercise the reset had already put the store on. A new exercise closes the
   * chunk before it, so every chunk belongs to one exercise.
   */
  const buffer = (event: any) => {
    const exerciseId = currentExerciseId();
    if (eventsQueue.length > 0 && exerciseId !== batchExerciseId) flush();
    if (eventsQueue.length === 0) batchExerciseId = exerciseId;
    eventsQueue.push(event);
  };

  (async () => {
    const recordFn = await loadRrwebRecord();
    if (cancelled || !recordFn) return;
    const authOk = await authReady;
    if (!authOk || cancelled) return;
    await budgetReady;
    if (cancelled || truncated) return;

    throttledRtdbUpdate(`users/students/${uid}`, { latestTelemetrySessionId: recordingId }).catch(() => {});

    stopRecorder = recordFn({
      emit(event: any) {
        buffer(event);
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
