import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '@/infrastructure/firebase';

/** Module 18 §ב default — used whenever no admin calibration is on record. */
export const DEFAULT_HESITATION_THRESHOLD_SECONDS = 45;

/**
 * Module 26's "כיול רדאר פדגוגי" panel writes system_control/trace_calibration
 * and tells the admin it will apply to her live monitoring. Nothing used to
 * read that document back, so the save button's own claim was false.
 *
 * What it calibrates is the teacher-facing radar: when a learner's tile turns
 * yellow (Module 18 §ב) and the wording of the radar's own labels. It does
 * NOT move the learner's Socratic card, which Module 12 fixes at 45 seconds
 * (`SOCRATIC_STAGE_SECONDS`) — a card that moved with the slider would have
 * contradicted the module's "strictly" and mislabelled every hesitation event
 * in the pilot's data as hesitation_45s.
 *
 * Ref-counted, so multiple mounted components (a learner's radar stage, every
 * open teacher radar cell) share one Firestore subscription instead of one each.
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
