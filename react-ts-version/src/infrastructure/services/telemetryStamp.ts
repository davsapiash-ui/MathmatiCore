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
      return stored;
    }
  } catch { /* storage blocked: an id for this page only */ }
  const id = randomId();
  memoryDeviceId = id;
  try { store?.setItem(DEVICE_ID_STORAGE_KEY, id); } catch { /* kept in memory */ }
  return id;
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

/** For tests: forget the in-memory copies. */
export function resetTelemetryStampForTests(): void {
  memoryDeviceId = null;
  memorySequence = null;
}
