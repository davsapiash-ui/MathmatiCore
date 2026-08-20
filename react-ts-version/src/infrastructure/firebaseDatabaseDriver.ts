import {
  ref,
  set,
  update,
  push,
  get,
  remove,
  onValue,
  type DatabaseReference,
} from 'firebase/database';
import { database } from './firebase';

/**
 * Universal Sanitizer: Recursively cleans any JS object/array before sending to Firebase.
 * Replaces `undefined` with `null` or omits it to guarantee Firebase RTDB compatibility.
 */
export function sanitizeForFirebase<T>(data: T): T {
  if (data === undefined) return null as unknown as T;
  if (data === null || typeof data !== 'object') return data;
  try {
    return JSON.parse(JSON.stringify(data, (_key, val) => (val === undefined ? null : val)));
  } catch (err) {
    console.warn('[FirebaseDatabaseDriver] Sanitize fallback on circular/non-serializable data:', err);
    return data;
  }
}

/**
 * Safe wrapper for Firebase `set` with automatic payload sanitization and error isolation.
 */
export async function safeSet<T>(dbRef: DatabaseReference, data: T): Promise<void> {
  const cleanData = sanitizeForFirebase(data);
  try {
    await set(dbRef, cleanData);
  } catch (err: any) {
    console.warn(`[FirebaseDatabaseDriver] safeSet notice on path '${dbRef.key}':`, err?.message || err);
    throw err;
  }
}

/**
 * Safe wrapper for Firebase `update` with automatic payload sanitization and error isolation.
 */
export async function safeUpdate(dbRef: DatabaseReference, data: Record<string, any>): Promise<void> {
  const cleanData = sanitizeForFirebase(data);
  try {
    await update(dbRef, cleanData);
  } catch (err: any) {
    console.warn(`[FirebaseDatabaseDriver] safeUpdate notice on path '${dbRef.key}':`, err?.message || err);
    throw err;
  }
}

/**
 * Safe wrapper for Firebase `push` with automatic payload sanitization.
 */
export async function safePush<T>(dbRef: DatabaseReference, data?: T): Promise<DatabaseReference> {
  if (data !== undefined) {
    const cleanData = sanitizeForFirebase(data);
    return push(dbRef, cleanData);
  }
  return push(dbRef);
}

export { ref, get, remove, onValue, database };
