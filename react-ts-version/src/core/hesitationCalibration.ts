import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '@/infrastructure/firebase';

/** PRD v7.0 Module 10 & 12 default — used whenever no admin calibration is on record. */
export const DEFAULT_HESITATION_THRESHOLD_SECONDS = 45;

/**
 * Module 26's "כיול רדאר פדגוגי" panel writes system_control/trace_calibration
 * and tells the admin it "יוחלו על ניטור הלייב" (will apply to live
 * monitoring). Nothing previously read that document back — the student-side
 * trigger and the teacher-side radar display both hardcoded 45s independently,
 * so the save button's own claim was false. This is the one shared listener
 * both sides subscribe to, ref-counted so multiple mounted components (a
 * student's own hesitation timer, every open teacher radar cell) share a
 * single Firestore subscription instead of one each.
 */
let liveThresholdSeconds = DEFAULT_HESITATION_THRESHOLD_SECONDS;
const subscribers = new Set<(seconds: number) => void>();
let listenerRefCount = 0;
let unsubscribeFromDoc: (() => void) | null = null;

function notifyAll(seconds: number) {
  liveThresholdSeconds = seconds;
  subscribers.forEach((cb) => cb(seconds));
}

function acquireListener(): () => void {
  listenerRefCount += 1;
  if (!unsubscribeFromDoc) {
    unsubscribeFromDoc = onSnapshot(
      doc(firestore, 'system_control', 'trace_calibration'),
      (snap) => {
        const raw = snap.exists() ? snap.data()?.hesitation_threshold_seconds : undefined;
        notifyAll(typeof raw === 'number' && raw > 0 ? raw : DEFAULT_HESITATION_THRESHOLD_SECONDS);
      },
      () => notifyAll(DEFAULT_HESITATION_THRESHOLD_SECONDS)
    );
  }
  return () => {
    listenerRefCount -= 1;
    if (listenerRefCount <= 0 && unsubscribeFromDoc) {
      unsubscribeFromDoc();
      unsubscribeFromDoc = null;
    }
  };
}

/** Non-reactive getter for call sites outside React (event handlers, one-off computations). */
export function getHesitationThresholdSeconds(): number {
  return liveThresholdSeconds;
}

/** Reactive hook — re-renders the caller whenever an admin recalibrates the threshold. */
export function useHesitationThresholdSeconds(): number {
  const [seconds, setSeconds] = useState(liveThresholdSeconds);

  useEffect(() => {
    const release = acquireListener();
    subscribers.add(setSeconds);
    setSeconds(liveThresholdSeconds);
    return () => {
      subscribers.delete(setSeconds);
      release();
    };
  }, []);

  return seconds;
}
