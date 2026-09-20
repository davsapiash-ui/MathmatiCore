import { update, ref } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

export const RTDB_WRITE_THROTTLE_MS = 1000;

interface ThrottleEntry {
  payload: Record<string, any>;
  timeoutId: ReturnType<typeof setTimeout> | null;
  lastFlushedTime: number;
  resolveList: Array<() => void>;
  rejectList: Array<(err: any) => void>;
}

const pendingWrites = new Map<string, ThrottleEntry>();

/**
 * Throttles client-side RTDB updates to max 1 write per path per 1000ms window (PRD Module 18 §D).
 * Guarantees trailing-edge execution so the most recent payload is always persisted.
 */
export function throttledRtdbUpdate(path: string, payload: Record<string, any>): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    let entry = pendingWrites.get(path);

    if (!entry) {
      entry = {
        payload: { ...payload },
        timeoutId: null,
        lastFlushedTime: 0,
        resolveList: [resolve],
        rejectList: [reject],
      };
      pendingWrites.set(path, entry);
    } else {
      entry.payload = { ...entry.payload, ...payload };
      entry.resolveList.push(resolve);
      entry.rejectList.push(reject);
    }

    const timeSinceLastFlush = now - entry.lastFlushedTime;

    if (timeSinceLastFlush >= RTDB_WRITE_THROTTLE_MS && !entry.timeoutId) {
      // Window elapsed and no timer pending: flush immediately
      entry.lastFlushedTime = now;
      const dataToFlush = { ...entry.payload };
      // What was sent is sent. The payload used to be kept and merged into every
      // later write on the same path, so a field written once was re-sent for
      // ever: a help request the teacher had marked "טופל" turned the tile BLUE
      // again at the learner's next exercise, with no new request.
      entry.payload = {};
      const currentResolves = [...entry.resolveList];
      const currentRejects = [...entry.rejectList];
      entry.resolveList = [];
      entry.rejectList = [];

      update(ref(database, path), dataToFlush)
        .then(() => currentResolves.forEach((r) => r()))
        .catch((err) => currentRejects.forEach((r) => r(err)));
    } else if (!entry.timeoutId) {
      // Within 1000ms window: schedule trailing flush
      const remainingTime = Math.max(0, RTDB_WRITE_THROTTLE_MS - timeSinceLastFlush);
      entry.timeoutId = setTimeout(() => {
        if (!entry) return;
        entry.timeoutId = null;
        entry.lastFlushedTime = Date.now();
        const dataToFlush = { ...entry.payload };
        entry.payload = {};
        const currentResolves = [...entry.resolveList];
        const currentRejects = [...entry.rejectList];
        entry.resolveList = [];
        entry.rejectList = [];

        update(ref(database, path), dataToFlush)
          .then(() => currentResolves.forEach((r) => r()))
          .catch((err) => currentRejects.forEach((r) => r(err)));
      }, remainingTime);
    }
  });
}

/** Clear all pending throttled writes (useful for tests) */
export function resetThrottledWrites() {
  for (const entry of pendingWrites.values()) {
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
  }
  pendingWrites.clear();
}
