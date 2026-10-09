/**
 * PRD Module 5 §ב / Appendix A §3: every telemetry event carries, beside
 * client_timestamp, a sequence_number ("מונה עולה לכל מכשיר ולכל כניסה") and a
 * device_id ("מזהה אקראי של הדפדפן שאין בו פרט מזהה"). Events are ordered by
 * client_timestamp, ties by sequence_number.
 *
 * device_id is random, created on first use and kept in this browser. It is
 * not the telemetry queue (Module 17 forbids LocalStorage for that; the queue
 * stays in IndexedDB), and sign-out does not clear it: it names the browser,
 * not the person.
 *
 * sequence_number restarts at 1 on every sign-in and keeps increasing across
 * reloads of that same sign-in, so two events of one sign-in never share a
 * number on this device.
 */

export const DEVICE_ID_STORAGE_KEY = 'mc_telemetry_device_id';
export const SEQUENCE_STORAGE_KEY = 'mc_telemetry_sequence';

let memoryDeviceId: string | null = null;
/** memoryDeviceId is also in this browser's storage, so a reload reads it back. */
let memoryDeviceIdStored = false;
let memorySequence: { signIn: string; n: number } | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * 24 random lowercase letters. Letters only, on purpose: the research export's
 * PII gate (Module 24) refuses the whole export on a nine-digit run or a
 * phone-shaped number, and a random id with digits could, rarely, look like one.
 */
const DEVICE_ID_LENGTH = 24;
function randomId(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(DEVICE_ID_LENGTH);
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
    else throw new Error('no crypto');
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => letters[b % letters.length]).join('');
}

/** Only the shape a random id has: nothing a person could have typed in. */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** This browser's random id; created and stored on first use. */
export function getDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  const store = storage();
  try {
    const stored = store?.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored && DEVICE_ID_PATTERN.test(stored)) {
      memoryDeviceId = stored;
      memoryDeviceIdStored = true;
      return stored;
    }
  } catch { /* storage blocked: an id for this page only */ }
  const id = randomId();
  memoryDeviceId = id;
  try {
    store?.setItem(DEVICE_ID_STORAGE_KEY, id);
    memoryDeviceIdStored = store?.getItem(DEVICE_ID_STORAGE_KEY) === id;
  } catch { /* kept in memory */ }
  return id;
}

/**
 * Whether getDeviceId() survives a reload of this page: true when the id is
 * kept in this browser's storage, false when storage is blocked and the id
 * lives in this page's memory only (a reload then draws a new one). The soft
 * device lock (application/deviceOwnership.ts) reads it.
 */
export function isDeviceIdStable(): boolean {
  getDeviceId();
  return memoryDeviceIdStored;
}

/**
 * The next number of this sign-in on this device (1, 2, 3, …). `signIn`
 * identifies the sign-in (who, and when they signed in); a different one
 * starts again at 1.
 */
export function nextSequenceNumber(signIn: string): number {
  const store = storage();
  let current = memorySequence;
  try {
    const raw = store?.getItem(SEQUENCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { signIn?: unknown; n?: unknown };
      if (typeof parsed.signIn === 'string' && typeof parsed.n === 'number' && Number.isInteger(parsed.n) && parsed.n >= 0) {
        // Another tab of the same sign-in may have moved on: take the larger.
        if (!current || current.signIn !== parsed.signIn || parsed.n > current.n) {
          current = { signIn: parsed.signIn, n: parsed.n };
        }
      }
    }
  } catch { /* unreadable: the memory copy decides */ }
  const n = current && current.signIn === signIn ? current.n + 1 : 1;
  memorySequence = { signIn, n };
  try { store?.setItem(SEQUENCE_STORAGE_KEY, JSON.stringify(memorySequence)); } catch { /* kept in memory */ }
  return n;
}

/**
 * Module 4: a telemetry_logs document id is the event's idempotency_key, a
 * UUID v4, and the Security Rules refuse any other id.
 */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV4(value: unknown): boolean {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

function formatUuidV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A new idempotency key: crypto.randomUUID, or a UUID v4 from getRandomValues / Math.random where it is missing. */
export function newTelemetryKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  const bytes = new Uint8Array(16);
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
    else throw new Error('no crypto');
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return formatUuidV4(bytes);
}

/**
 * The telemetry_logs document id of a queued event's key. A UUID v4 is its own
 * id. An event queued by an older version under a key of another shape
 * (`telemetry_<time>_<random>`, where crypto.randomUUID was missing) would be
 * refused by the rules on every attempt and never leave the queue; it gets a
 * UUID v4 derived from that key instead. Derived, not random: every retry of
 * the same item writes the same document, so redelivery stays idempotent
 * (Module 17 §ג step 5).
 */
export function telemetryDocIdOf(key: string): string {
  if (isUuidV4(key)) return key;
  // cyrb128: four 32-bit hashes of the key, 128 bits in all.
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < key.length; i++) {
    const k = key.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  const bytes = new Uint8Array(16);
  [h1, h2, h3, h4].forEach((h, i) => {
    bytes[i * 4] = (h >>> 24) & 0xff;
    bytes[i * 4 + 1] = (h >>> 16) & 0xff;
    bytes[i * 4 + 2] = (h >>> 8) & 0xff;
    bytes[i * 4 + 3] = h & 0xff;
  });
  return formatUuidV4(bytes);
}

/** For tests: forget the in-memory copies. */
export function resetTelemetryStampForTests(): void {
  memoryDeviceId = null;
  memoryDeviceIdStored = false;
  memorySequence = null;
}
