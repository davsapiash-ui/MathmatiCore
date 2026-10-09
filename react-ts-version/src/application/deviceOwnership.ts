/**
 * The soft device lock (PRD Module 1 §א, "התוצאה הצפויה"):
 *
 *   "כניסה שנייה באותו מזהה ממכשיר אחר אפשרית, והשרת אינו חוסם אותה: המכשיר
 *    שנכנס אחרון הוא הפעיל, והמכשיר הקודם עובר למצב קריאה בלבד עם ההודעה
 *    "המשכתם במכשיר אחר""
 *
 * "The device that signed in last" is decided at the sign-in, and only there:
 * a successful learner sign-in (Login.tsx) writes this browser's id to
 * users/students/{studentId}/active_device_id. The lobby and the workspace
 * never write it on a page load; they only read it. A page load used to draw
 * a new random id and claim the learner with it, so an older device that
 * refreshed, or whose lobby swapped into the workspace, took the learner back
 * from the device that had signed in after it.
 *
 * The id is the browser's own random device_id (telemetryStamp.getDeviceId,
 * PRD Module 5 §ב), the same one every telemetry event carries, kept in this
 * browser's storage so that a reload is the same device.
 */
import { useEffect, useState, type MutableRefObject } from 'react';
import { ref, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { getDeviceId, isDeviceIdStable } from '@/infrastructure/services/telemetryStamp';
import { throttledRtdbUpdate, rtdbUpdateNow } from '@/infrastructure/services/ThrottledRtdbWriter';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * The id a page load drew before the id was kept per browser:
 * `dev_${7 base-36 characters}_${Date.now()}`. A record that still names one
 * was claimed before this lock existed; it names no device that can be told
 * apart from this one, so it locks nobody and the first page to see it claims
 * the learner for its device.
 */
const PER_LOAD_DEVICE_ID = /^dev_[a-z0-9]+_\d{10,}$/;

export function isPerLoadDeviceId(id: unknown): boolean {
  return typeof id === 'string' && PER_LOAD_DEVICE_ID.test(id);
}

export interface DeviceOwnership {
  /** Another device signed in after this one: read-only, "המשכתם במכשיר אחר". */
  superseded: boolean;
  /** The record names no device that can be told apart (a per-load id): claim it. */
  claim: boolean;
}

/** What the record's active_device_id means for this device. */
export function decideDeviceOwnership(remoteDeviceId: unknown, myDeviceId: string): DeviceOwnership {
  if (typeof remoteDeviceId !== 'string' || remoteDeviceId === '') return { superseded: false, claim: false };
  if (isPerLoadDeviceId(remoteDeviceId)) return { superseded: false, claim: true };
  return { superseded: remoteDeviceId !== myDeviceId, claim: false };
}

/**
 * Claims the learner for this browser. Called by a successful sign-in, and
 * otherwise only where decideDeviceOwnership says so. `now`: sent at once
 * (the sign-in), so the lobby that opens right after reads this device;
 * otherwise through the record's throttled writer (PRD Module 18).
 */
export function claimDeviceOwnership(studentUid: string, options: { now?: boolean } = {}): Promise<void> {
  if (!studentUid) return Promise.resolve();
  const payload = { active_device_id: getDeviceId(), device_claimed_at: serverTimestamp() };
  const path = `users/students/${studentUid}`;
  return options.now ? rtdbUpdateNow(path, payload) : throttledRtdbUpdate(path, payload);
}

/**
 * Follows users/students/{studentUid}/active_device_id and returns whether
 * another device took this learner over. When it did, the store's
 * isSupersededByOtherDevice is set (every learner write checks it), and the
 * presence hooks armed on the server for this device are cancelled, so that
 * this device does not write the learner offline when it closes.
 *
 * `supersededRef`, when given, is set before the state is, for the guards of
 * writes already queued.
 */
export function useDeviceOwnership(studentUid: string, supersededRef?: MutableRefObject<boolean>): boolean {
  const [superseded, setSuperseded] = useState(false);

  useEffect(() => {
    const mark = (value: boolean) => {
      if (supersededRef) supersededRef.current = value;
      useWorkspaceStore.getState().setSupersededByOtherDevice(value);
      setSuperseded(value);
    };
    if (!studentUid) {
      mark(false);
      return;
    }
    const myDeviceId = getDeviceId();
    // Storage blocked: the id lives in this page only, and a reload is a new
    // id that the record cannot know. Only then does a page load claim the
    // learner — otherwise the only device would lock itself on every reload.
    const stable = isDeviceIdStable();
    useWorkspaceStore.getState().setActiveDeviceId(myDeviceId);
    mark(false);

    let active = true;
    let claimSent = false;
    let claimLanded = stable;
    let known = false;
    let remote: unknown = null;

    const apply = () => {
      if (!active || !known) return;
      const decision = decideDeviceOwnership(remote, myDeviceId);
      if (decision.claim) claim();
      if (decision.superseded) {
        // This page's own claim (the fallback above) has not reached the
        // record yet: the id it names is this page's earlier load.
        if (!claimLanded) return;
        mark(true);
        for (const field of ['isOnline', 'onlineStatus', 'lastPing', 'lastAction']) {
          try { onDisconnect(ref(database, `users/students/${studentUid}/${field}`)).cancel(); } catch { /* offline */ }
        }
      } else {
        mark(false);
      }
    };
    const claim = () => {
      if (claimSent) return;
      claimSent = true;
      claimDeviceOwnership(studentUid)
        .then(() => { claimLanded = true; apply(); })
        .catch((err) => console.warn('[deviceOwnership] claim notice:', err));
    };

    if (!stable) claim();

    const unsub = onValue(
      ref(database, `users/students/${studentUid}`),
      (snap) => {
        known = true;
        const val = snap.exists() ? snap.val() : null;
        remote = val && typeof val === 'object' ? (val as Record<string, unknown>).active_device_id ?? null : null;
        apply();
      },
      (err) => console.warn('[deviceOwnership] listener notice:', err)
    );

    return () => {
      active = false;
      unsub();
    };
    // supersededRef is a ref: stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUid]);

  return superseded;
}
