import { update, ref } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

export const RTDB_WRITE_THROTTLE_MS = 1000;

/** A condition checked when the write is SENT: false drops the pending write. */
export type ThrottledWriteGuard = () => boolean;

interface ThrottleEntry {
  payload: Record<string, any>;
  timeoutId: ReturnType<typeof setTimeout> | null;
  lastFlushedTime: number;
  guards: ThrottledWriteGuard[];
  resolveList: Array<() => void>;
  rejectList: Array<(err: any) => void>;
}

const pendingWrites = new Map<string, ThrottleEntry>();

const isPlainObject = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !('.sv' in (v as object));

/**
 * Merges the fields of a later update() into an earlier one, as if the two had
 * been sent one after the other. Field keys may be paths ('workspaceState/counts');
 * update() refuses a payload in which one key is an ancestor of another, so a
 * later key REPLACES the queued keys beneath it, and a later key beneath a
 * queued node is written INTO that node.
 */
export function mergeUpdateFields(base: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...base };
  for (const [rawKey, value] of Object.entries(incoming)) {
    const key = rawKey.split('/').filter(Boolean).join('/');
    for (const k of Object.keys(out)) {
      if (k.startsWith(`${key}/`)) delete out[k];
    }
    const ancestor = Object.keys(out).find((k) => key.startsWith(`${k}/`));
    if (ancestor === undefined) {
      out[key] = value;
      continue;
    }
    const segs = key.slice(ancestor.length + 1).split('/');
    const root: Record<string, any> = isPlainObject(out[ancestor]) ? { ...out[ancestor] } : {};
    let node = root;
    for (const seg of segs.slice(0, -1)) {
      node[seg] = isPlainObject(node[seg]) ? { ...node[seg] } : {};
      node = node[seg];
    }
    node[segs[segs.length - 1]] = value;
    out[ancestor] = root;
  }
  return out;
}

function entryFor(path: string): ThrottleEntry {
  let entry = pendingWrites.get(path);
  if (!entry) {
    entry = { payload: {}, timeoutId: null, lastFlushedTime: 0, guards: [], resolveList: [], rejectList: [] };
    pendingWrites.set(path, entry);
  }
  return entry;
}

/** Sends what is pending on this path now, as one update(). */
function send(path: string, entry: ThrottleEntry, checkGuards: boolean) {
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  entry.lastFlushedTime = Date.now();
  // What was sent is sent. The payload used to be kept and merged into every
  // later write on the same path, so a field written once was re-sent for
  // ever: a help request the teacher had marked "טופל" turned the tile BLUE
  // again at the learner's next exercise, with no new request.
  const dataToFlush = entry.payload;
  const guards = entry.guards;
  const resolves = entry.resolveList;
  const rejects = entry.rejectList;
  entry.payload = {};
  entry.guards = [];
  entry.resolveList = [];
  entry.rejectList = [];

  if (Object.keys(dataToFlush).length === 0 || (checkGuards && !guards.every((g) => g()))) {
    resolves.forEach((r) => r());
    return;
  }
  update(ref(database, path), dataToFlush)
    .then(() => resolves.forEach((r) => r()))
    .catch((err) => rejects.forEach((r) => r(err)));
}

/**
 * Throttles client-side RTDB updates to max 1 write per path per 1000ms window
 * (PRD Module 18: "Throttle client writes to maximum once per 1000ms").
 * Every writer of the learner's record goes through here, and the fields of one
 * window are merged into one update(). The first write of a window is sent at
 * once; the rest go out together when the window ends — never later than that,
 * so a help request waits at most one window. `guard` is checked when the write
 * is SENT (e.g. the device was taken over in the meantime).
 */
export function throttledRtdbUpdate(
  path: string,
  payload: Record<string, any>,
  options: { guard?: ThrottledWriteGuard } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const entry = entryFor(path);
    entry.payload = mergeUpdateFields(entry.payload, payload);
    if (options.guard) entry.guards.push(options.guard);
    entry.resolveList.push(resolve);
    entry.rejectList.push(reject);

    if (entry.timeoutId) return;
    const sinceLastFlush = Date.now() - entry.lastFlushedTime;
    if (sinceLastFlush >= RTDB_WRITE_THROTTLE_MS) {
      send(path, entry, true);
    } else {
      entry.timeoutId = setTimeout(() => send(path, entry, true), RTDB_WRITE_THROTTLE_MS - sinceLastFlush);
    }
  });
}

/** A copy without undefined values, at any depth: update() refuses them, and in a merged window one would sink every field. */
function withoutUndefined(value: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) ? withoutUndefined(v) : v;
  }
  return out;
}

/**
 * update(ref(recordPath/child), fields), through the throttle of the record:
 * each field becomes a `child/<field>` key of the record's window, so a write
 * to a node beneath the learner record joins that record's one write per
 * 1000ms (PRD Module 18 §ב) instead of going around it. Same result on the
 * server as the direct update() of the child.
 */
export function throttledRtdbChildUpdate(
  recordPath: string,
  child: string,
  fields: Record<string, any>
): Promise<void> {
  const prefixed: Record<string, any> = {};
  for (const [k, v] of Object.entries(withoutUndefined(fields || {}))) prefixed[`${child}/${k}`] = v;
  if (Object.keys(prefixed).length === 0) return Promise.resolve();
  return throttledRtdbUpdate(recordPath, prefixed);
}

/**
 * The learner is leaving (page hide, sign-out, a teacher's reload): whatever is
 * pending on this path goes out now, merged with these fields, in one update().
 * A pending "online" heartbeat can then never land after the "offline" one.
 */
export function rtdbUpdateNow(path: string, payload: Record<string, any>): Promise<void> {
  return new Promise((resolve, reject) => {
    const entry = entryFor(path);
    entry.payload = mergeUpdateFields(entry.payload, payload);
    entry.resolveList.push(resolve);
    entry.rejectList.push(reject);
    send(path, entry, false);
  });
}

/**
 * Sends every pending write now (the page is being hidden or closed): a
 * trailing write waiting for its window would otherwise die with the page, and
 * with it the learner's latest board. Guards are still checked.
 */
export function flushThrottledWrites() {
  for (const [path, entry] of pendingWrites) {
    if (entry.timeoutId || Object.keys(entry.payload).length > 0) send(path, entry, true);
  }
}

/**
 * Takes these fields, and every path beneath them, out of what is still
 * waiting to be sent on this path. A teacher's reset (Module 23א) uses it: a
 * board state queued a moment before the reset must not land after it.
 */
export function dropPendingFields(path: string, fields: string[]) {
  const entry = pendingWrites.get(path);
  if (!entry) return;
  for (const key of Object.keys(entry.payload)) {
    if (fields.some((f) => key === f || key.startsWith(`${f}/`))) delete entry.payload[key];
  }
}

/** Clear all pending throttled writes (useful for tests) */
export function resetThrottledWrites() {
  for (const entry of pendingWrites.values()) {
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
  }
  pendingWrites.clear();
}
