import { useEffect, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import type { ActiveClassSessionRecord } from '@/core/classSession';
import {
  learnerAliasesForReset,
  liveClassMeeting,
  resolveResetMeeting,
  validMeetingNumber,
  type LearnerRecordForReset,
  type ResetMeetingTarget,
} from '@/core/resetMeetingTarget';

export interface ResetMeetingLookup {
  /** True until the records are read (when the dashboard had no open meeting to go by). */
  loading: boolean;
  /** The meeting the reset will restart, or null when none can be determined. */
  target: ResetMeetingTarget | null;
}

/**
 * The meeting a single learner's "המפגש הנוכחי" reset will restart, for the
 * confirmation dialog (core/resetMeetingTarget.ts — the server's rule).
 *
 * `liveClassSession` is the open meeting as the dashboard already knows it. The
 * class record and the learner's record are read once each time the dialog
 * opens: the class record in case the dashboard has not caught up, the
 * learner's for the meeting the learner is in and whether it is finished.
 */
export function useResetMeetingTarget(enabled: boolean, studentId: string | undefined, liveClassSession: number | null): ResetMeetingLookup {
  const fromDashboard = validMeetingNumber(liveClassSession);
  const [lookup, setLookup] = useState<ResetMeetingLookup>(() => fromDashboard !== null
    ? { loading: false, target: resolveResetMeeting(fromDashboard, []) }
    : { loading: true, target: null });

  useEffect(() => {
    if (!enabled || !studentId) return;
    let cancelled = false;
    // An open meeting is known at once; the learner's record only adds whether it is finished.
    setLookup(fromDashboard !== null
      ? { loading: false, target: resolveResetMeeting(fromDashboard, []) }
      : { loading: true, target: null });
    const read = async (path: string): Promise<unknown> => {
      try {
        const snap = await get(ref(database, path));
        return snap.exists() ? snap.val() : null;
      } catch {
        return null;
      }
    };
    Promise.all([
      read('active_class_session'),
      ...learnerAliasesForReset(studentId).map((alias) => read(`users/students/${alias}`)),
    ]).then(([classRecord, ...learners]) => {
      if (cancelled) return;
      const records = learners.map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : null)) as LearnerRecordForReset[];
      const live = fromDashboard ?? liveClassMeeting(classRecord as ActiveClassSessionRecord | null);
      setLookup({ loading: false, target: resolveResetMeeting(live, records) });
    });
    return () => { cancelled = true; };
  }, [enabled, studentId, fromDashboard]);

  return enabled ? lookup : { loading: false, target: null };
}
