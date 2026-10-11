/**
 * Measure 5 (PRD Module 23): the live mediation journal on the teacher's side.
 *
 * One store for the whole teacher dashboard, so the side action queue, the
 * top-bar counter, the radar tiles' badges, the tile drawer and the close
 * dialog all read the same events and the same records. Client UI state only:
 * the records themselves live in Firestore (teacher_mediation_log); the
 * queue's expanded learner and an action pressed before its event arrived are
 * this tab's memory.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { toast } from 'sonner';
import { useChatStore } from '@/application/useChatStore';
import {
  MEDIATION_HE,
  mergeMediationEvents,
  mediationEventFromChat,
  mediationRecordDocId,
  openMediationEvents,
  RUN_START_SLACK_MS,
  type MediationAction,
  type MediationEvent,
  type MediationRecord,
} from '@/core/teacherMediation';
import {
  saveMediationRecord,
  subscribeMediationRecords,
  subscribeMeetingMediationTelemetry,
} from '@/infrastructure/services/TeacherMediationService';

interface TeacherMediationState {
  /** The open meeting, or null while none is (no events, no recording). */
  meeting: number | null;
  runStartedAt: number | null;
  telemetryEvents: MediationEvent[];
  records: MediationRecord[];
  /** Records written in this tab and not yet echoed by the listener. */
  optimistic: MediationRecord[];
  /** The learner whose conversation the side queue shows inline. */
  expandedLearner: number | null;
  /** An action pressed on a queue item, per learner, until its record is saved. */
  pendingAction: Record<number, MediationAction>;
  setMeeting: (meeting: number | null, runStartedAt: number | null) => void;
  setTelemetryEvents: (events: MediationEvent[]) => void;
  setRecords: (records: MediationRecord[]) => void;
  setExpandedLearner: (n: number | null) => void;
  setPendingAction: (n: number, action: MediationAction | null) => void;
  /** Records a choice at once (optimistic); a refused write is taken back with a toast. */
  record: (input: { event: MediationEvent | null; studentNumber: number; action: MediationAction; dataLed: boolean; existing?: MediationRecord | null }) => Promise<boolean>;
}

export const useTeacherMediationStore = create<TeacherMediationState>((set, get) => ({
  meeting: null,
  runStartedAt: null,
  telemetryEvents: [],
  records: [],
  optimistic: [],
  expandedLearner: null,
  pendingAction: {},
  setMeeting: (meeting, runStartedAt) => {
    const s = get();
    if (s.meeting === meeting && s.runStartedAt === runStartedAt) return;
    set({ meeting, runStartedAt, telemetryEvents: [], records: [], optimistic: [], pendingAction: {} });
  },
  setTelemetryEvents: (telemetryEvents) => set({ telemetryEvents }),
  setRecords: (records) =>
    set((s) => ({ records, optimistic: s.optimistic.filter((o) => !records.some((r) => r.id === o.id && r.recorded_at >= o.recorded_at)) })),
  setExpandedLearner: (expandedLearner) => set({ expandedLearner }),
  setPendingAction: (n, action) =>
    set((s) => {
      const next = { ...s.pendingAction };
      if (action === null) delete next[n];
      else next[n] = action;
      return { pendingAction: next };
    }),
  record: async ({ event, studentNumber, action, dataLed, existing }) => {
    const meeting = get().meeting;
    if (meeting === null) return false;
    const now = Date.now();
    const optimisticId = existing?.id ?? (event ? mediationRecordDocId(event.ref) : `local_${now}`);
    const draft: MediationRecord = {
      id: optimisticId,
      class_id: 'class_1',
      student_id: studentNumber,
      session_number: meeting,
      event_ref: event ? event.ref : existing?.event_ref ?? null,
      event_time_iso: event ? new Date(event.at).toISOString() : existing?.event_time_iso ?? new Date(now).toISOString(),
      action: event || existing?.event_ref ? action : 'approached',
      data_led: dataLed,
      note: null,
      recorded_at: now,
      recorded_by: '',
    };
    set((s) => ({ optimistic: [...s.optimistic.filter((o) => o.id !== optimisticId), draft] }));
    try {
      const saved = await saveMediationRecord({
        meeting,
        studentNumber,
        event,
        action,
        dataLed,
        existingId: existing?.id,
        existingTimeIso: existing?.event_time_iso,
      });
      set((s) => ({ optimistic: [...s.optimistic.filter((o) => o.id !== optimisticId), saved] }));
      return true;
    } catch (err) {
      console.warn('[Measure 5] mediation record refused:', err);
      set((s) => ({ optimistic: s.optimistic.filter((o) => o.id !== optimisticId) }));
      toast.error(MEDIATION_HE.saveFailed, { id: 'mediation-save-failed' });
      return false;
    }
  },
}));

/** Every record known in this tab: the listener's, plus the ones still in flight. */
export function allMediationRecords(s: Pick<TeacherMediationState, 'records' | 'optimistic'>): MediationRecord[] {
  const byId = new Map<string, MediationRecord>();
  for (const r of s.records) byId.set(r.id, r);
  for (const r of s.optimistic) {
    const prev = byId.get(r.id);
    if (!prev || r.recorded_at >= prev.recorded_at) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/** The meeting's events: telemetry + the learners' chat messages of this run, deduplicated. */
export function useMediationEvents(): MediationEvent[] {
  const telemetry = useTeacherMediationStore((s) => s.telemetryEvents);
  const runStartedAt = useTeacherMediationStore((s) => s.runStartedAt);
  const meeting = useTeacherMediationStore((s) => s.meeting);
  const messages = useChatStore((s) => s.messages);
  if (meeting === null || runStartedAt === null) return [];
  const chat = (messages ?? [])
    .map((m) => mediationEventFromChat(m))
    .filter((e): e is MediationEvent => e !== null && e.at >= runStartedAt - RUN_START_SLACK_MS);
  return mergeMediationEvents(telemetry, chat);
}

/** The records of the meeting (listener + in flight). */
export function useMediationRecords(): MediationRecord[] {
  const records = useTeacherMediationStore((s) => s.records);
  const optimistic = useTeacherMediationStore((s) => s.optimistic);
  return allMediationRecords({ records, optimistic });
}

/** Events of the meeting with no record yet, oldest first. */
export function useOpenMediationEvents(): MediationEvent[] {
  return openMediationEvents(useMediationEvents(), useMediationRecords());
}

/**
 * Mounted once by the teacher dashboard: follows the open meeting's events and
 * records. `meeting` null (no open meeting) clears everything.
 */
export function useTeacherMediationSync(meeting: number | null, runStartedAt: number | null): void {
  useEffect(() => {
    const store = useTeacherMediationStore.getState();
    if (meeting === null || runStartedAt === null) {
      store.setMeeting(null, null);
      return;
    }
    store.setMeeting(meeting, runStartedAt);
    const offs: Array<() => void> = [];
    try {
      offs.push(subscribeMeetingMediationTelemetry(meeting, runStartedAt, (events) => useTeacherMediationStore.getState().setTelemetryEvents(events),
        (err) => console.warn('[Measure 5] mediation events listener:', err)));
      offs.push(subscribeMediationRecords(meeting, (records) => useTeacherMediationStore.getState().setRecords(records),
        (err) => console.warn('[Measure 5] mediation records listener:', err)));
    } catch (err) {
      console.warn('[Measure 5] mediation listeners notice:', err);
    }
    return () => offs.forEach((off) => off());
  }, [meeting, runStartedAt]);
}
