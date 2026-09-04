import { useEffect, useMemo, useState } from 'react';
import { Video, ListOrdered, AlertTriangle, RotateCcw } from 'lucide-react';
import { ReplayViewer } from '@/presentation/components/ReplayViewer';
import {
  describeEvent,
  exerciseTitle,
  fetchLearnerEvents,
  formatClock,
  formatDate,
  formatDuration,
  groupEventsBySession,
  parseRecordingEvents,
  subscribeLearnerRecordings,
  SESSION_NAMES_HE,
  type JourneyEvent,
  type RecordingSession,
} from '@/infrastructure/services/LearnerJourneyService';

interface Props {
  studentId: string;
}

const SESSION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * PRD Module 21 + owner decision (2026-09-04): the learner's whole journey,
 * meeting by meeting. For the selected meeting: the screen recording of that
 * meeting (chapters per exercise) beside the decision table built from the
 * learner's own telemetry events. Nothing on this screen is estimated.
 */
export function LearnerJourney({ studentId }: Props) {
  const studentNum = useMemo(() => {
    const n = parseInt(String(studentId).replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 1;
  }, [studentId]);

  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [eventsState, setEventsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [eventsError, setEventsError] = useState<string>('');
  const [recordingError, setRecordingError] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [seekRequest, setSeekRequest] = useState<{ t: number; nonce: number } | null>(null);
  const [playheadTs, setPlayheadTs] = useState<number | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Recordings: live from RTDB.
  useEffect(() => {
    setRecordingError('');
    return subscribeLearnerRecordings(studentNum, setRecordings, (err) => {
      setRecordingError(err instanceof Error ? err.message : String(err));
    });
  }, [studentNum]);

  // Events: one read of the learner's telemetry.
  useEffect(() => {
    let cancelled = false;
    setEventsState('loading');
    setEventsError('');
    fetchLearnerEvents(studentNum)
      .then((list) => { if (!cancelled) { setEvents(list); setEventsState('ready'); } })
      .catch((err) => {
        if (cancelled) return;
        setEventsError(err instanceof Error ? err.message : String(err));
        setEventsState('error');
      });
    return () => { cancelled = true; };
  }, [studentNum, reloadNonce]);

  const eventsBySession = useMemo(() => groupEventsBySession(events), [events]);
  const recordingsBySession = useMemo(() => {
    const map = new Map<number, RecordingSession[]>();
    for (const r of recordings) {
      if (r.sessionNumber === null) continue;
      map.set(r.sessionNumber, [...(map.get(r.sessionNumber) ?? []), r]);
    }
    return map;
  }, [recordings]);

  // Default selection: the latest meeting that has anything.
  useEffect(() => {
    if (selectedSession !== null) return;
    const withData = SESSION_NUMBERS.filter((n) => (eventsBySession.get(n)?.length ?? 0) > 0 || (recordingsBySession.get(n)?.length ?? 0) > 0);
    if (withData.length > 0) setSelectedSession(withData[withData.length - 1]);
  }, [eventsBySession, recordingsBySession, selectedSession]);

  const sessionEvents = useMemo(
    () => (selectedSession === null ? [] : (eventsBySession.get(selectedSession) ?? [])),
    [eventsBySession, selectedSession],
  );
  const sessionRecordings = useMemo(
    () => (selectedSession === null ? [] : (recordingsBySession.get(selectedSession) ?? [])),
    [recordingsBySession, selectedSession],
  );
  const rrwebEvents = useMemo(() => parseRecordingEvents(sessionRecordings), [sessionRecordings]);
  const chapters = useMemo(() => sessionRecordings.flatMap((r) => r.chapters), [sessionRecordings]);
  const truncated = sessionRecordings.some((r) => r.truncated);

  const exerciseIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of sessionEvents) if (e.exerciseId && !ids.includes(e.exerciseId)) ids.push(e.exerciseId);
    for (const c of chapters) if (c.exerciseId && !ids.includes(c.exerciseId)) ids.push(c.exerciseId);
    return ids;
  }, [sessionEvents, chapters]);

  const visibleEvents = useMemo(
    () => (selectedExercise ? sessionEvents.filter((e) => e.exerciseId === selectedExercise) : sessionEvents),
    [sessionEvents, selectedExercise],
  );

  // Reverse link (Module 21): as the player advances, highlight the last event at or before the playhead.
  const highlightedIdx = useMemo(() => {
    if (playheadTs === null) return -1;
    let idx = -1;
    for (let i = 0; i < visibleEvents.length; i++) {
      if (visibleEvents[i].timestamp <= playheadTs) idx = i; else break;
    }
    return idx;
  }, [visibleEvents, playheadTs]);

  const requestSeek = (t?: number) => {
    if (typeof t !== 'number') return;
    setSeekRequest((prev) => ({ t, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const selectSession = (n: number) => {
    setSelectedSession(n);
    setSelectedExercise(null);
    setSeekRequest(null);
    setPlayheadTs(null);
  };

  const sessionsWithData = SESSION_NUMBERS.filter((n) => (eventsBySession.get(n)?.length ?? 0) > 0 || (recordingsBySession.get(n)?.length ?? 0) > 0).length;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-ws-ink">מסע הלמידה של תלמיד {studentNum}</h3>
          <p className="text-xs text-ws-soft">
            {sessionsWithData} מתוך 8 מפגשים עם נתונים · {events.length} פעולות מתועדות · {recordings.length} הקלטות
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadNonce((n) => n + 1)}
          className="text-xs font-bold text-ws-soft hover:text-ws-accent flex items-center gap-1.5 px-3 py-2 rounded-xl border border-ws-surface2 bg-ws-surface cursor-pointer"
          title="טעינה מחדש של הפעולות המתועדות"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          רענון
        </button>
      </div>

      {(eventsState === 'error' || recordingError) && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold dark:bg-red-950/40 dark:border-red-800 dark:text-red-200">
          {eventsState === 'error' && <div>לא ניתן לקרוא את הפעולות המתועדות: {eventsError}</div>}
          {recordingError && <div>לא ניתן לקרוא את ההקלטות: {recordingError}</div>}
        </div>
      )}

      {/* Meeting strip */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        {SESSION_NUMBERS.map((n) => {
          const evs = eventsBySession.get(n) ?? [];
          const recs = recordingsBySession.get(n) ?? [];
          const hasData = evs.length > 0 || recs.length > 0;
          const firstTs = Math.min(...[...evs.map((e) => e.timestamp), ...recs.map((r) => r.start)].filter((t) => t > 0));
          const recMs = recs.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
          const selected = selectedSession === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => selectSession(n)}
              className={`text-right p-3 rounded-2xl border transition-all cursor-pointer ${
                selected
                  ? 'bg-ws-accentSoft border-ws-accent/40 shadow-sm'
                  : hasData
                    ? 'bg-ws-surface border-ws-surface2 hover:border-ws-accent/40'
                    : 'bg-ws-bg border-ws-surface2 opacity-60'
              }`}
              aria-pressed={selected}
            >
              <div className="text-[11px] font-black text-ws-soft">מפגש {n}</div>
              <div className="text-xs font-bold text-ws-ink leading-snug">{SESSION_NAMES_HE[n]}</div>
              {hasData ? (
                <div className="mt-1.5 text-[11px] text-ws-soft space-y-0.5">
                  {Number.isFinite(firstTs) && <div>{formatDate(firstTs)}</div>}
                  <div>{evs.length} פעולות</div>
                  <div>{recs.length > 0 ? `הקלטה ${formatDuration(recMs)}` : 'ללא הקלטה'}</div>
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-ws-soft">אין נתונים</div>
              )}
            </button>
          );
        })}
      </div>

      {selectedSession === null ? (
        <div className="p-10 text-center text-ws-soft bg-ws-surface rounded-2xl border border-dashed border-ws-surface2 text-sm">
          {eventsState === 'loading' ? 'טוען את הפעולות המתועדות…' : 'עדיין אין פעולות או הקלטות לתלמיד זה.'}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Exercise chapters */}
          {exerciseIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black text-ws-soft">תרגילים במפגש {selectedSession}:</span>
              <button
                type="button"
                onClick={() => setSelectedExercise(null)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer ${selectedExercise === null ? 'bg-ws-accent text-white border-ws-accent' : 'bg-ws-surface text-ws-ink border-ws-surface2'}`}
              >
                הכול
              </button>
              {exerciseIds.map((id, i) => {
                const chapter = chapters.find((c) => c.exerciseId === id);
                const active = selectedExercise === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSelectedExercise(id);
                      if (chapter) requestSeek(chapter.start);
                    }}
                    title={exerciseTitle(selectedSession, id)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer ${active ? 'bg-ws-accent text-white border-ws-accent' : 'bg-ws-surface text-ws-ink border-ws-surface2 hover:border-ws-accent/40'}`}
                  >
                    {i + 1}. {exerciseTitle(selectedSession, id)}{chapter ? '' : ' (ללא הקלטה)'}
                  </button>
                );
              })}
            </div>
          )}

          {/* Split screen: table (right in RTL) + player (left) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <div className="bg-ws-surface border border-ws-surface2 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-ws-surface2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-black text-ws-ink">
                  <ListOrdered className="w-4 h-4 text-ws-accent" />
                  ציר ההחלטות · מפגש {selectedSession}
                </div>
                <span className="text-[11px] text-ws-soft">{visibleEvents.length} פעולות</span>
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-ws-bg text-ws-soft font-black sticky top-0 border-b border-ws-surface2">
                    <tr>
                      <th className="p-2.5">שעה</th>
                      <th className="p-2.5">תרגיל</th>
                      <th className="p-2.5">פעולה</th>
                      <th className="p-2.5">פרטים</th>
                      <th className="p-2.5 text-center" title="שניות מהפעולה הקודמת">השהיה</th>
                      <th className="p-2.5 text-center" title="מחיקה או ביטול פעולה">בקרה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ws-surface2">
                    {eventsState === 'loading' ? (
                      <tr><td colSpan={6} className="p-8 text-center text-ws-soft">טוען…</td></tr>
                    ) : visibleEvents.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-ws-soft">אין פעולות מתועדות למפגש זה.</td></tr>
                    ) : (
                      visibleEvents.map((e, idx) => {
                        const desc = describeEvent(e);
                        const prev = idx > 0 ? visibleEvents[idx - 1] : null;
                        const delaySec = prev ? Math.round((e.timestamp - prev.timestamp) / 1000) : 0;
                        const isHighlighted = idx === highlightedIdx;
                        const exerciseIdx = exerciseIds.indexOf(e.exerciseId);
                        return (
                          <tr
                            key={e.id}
                            onClick={() => requestSeek(e.timestamp)}
                            title={`לחיצה מקפיצה את ההקלטה לשעה ${formatClock(e.timestamp)}`}
                            className={`cursor-pointer transition-colors ${isHighlighted ? 'bg-ws-accentSoft border-r-4 border-ws-accent' : 'hover:bg-ws-bg'} ${desc.attention ? 'text-amber-900 dark:text-amber-200' : 'text-ws-ink'}`}
                          >
                            <td className="p-2.5 font-mono text-[11px] text-ws-soft whitespace-nowrap" dir="ltr">{formatClock(e.timestamp)}</td>
                            <td className="p-2.5 whitespace-nowrap">{exerciseIdx >= 0 ? exerciseIdx + 1 : '–'}</td>
                            <td className="p-2.5 font-bold whitespace-nowrap">{desc.label}</td>
                            <td className="p-2.5">{desc.detail}</td>
                            <td className="p-2.5 text-center font-mono">{delaySec > 0 ? `${delaySec}` : '–'}</td>
                            <td className="p-2.5 text-center">{desc.selfRegulation ? '✓' : ''}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-3 text-white space-y-3">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-black flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-indigo-300" />
                  הקלטת המסך · מפגש {selectedSession}
                </span>
                <span className="text-slate-400 font-mono" dir="ltr">
                  {sessionRecordings.length > 0 ? `${sessionRecordings.reduce((s, r) => s + r.chunkCount, 0)} chunks` : ''}
                </span>
              </div>
              {truncated && (
                <div className="flex items-center gap-2 text-[11px] font-bold text-amber-200 bg-amber-950/50 border border-amber-800 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  ההקלטה נקטעה בתקרת 50MB. הפעולות בטבלה מלאות.
                </div>
              )}
              {rrwebEvents.length >= 2 ? (
                <ReplayViewer
                  events={rrwebEvents}
                  seekToTime={seekRequest?.t}
                  seekNonce={seekRequest?.nonce}
                  onProgress={(absTs) => setPlayheadTs(absTs)}
                  onEnd={() => setPlayheadTs(null)}
                />
              ) : (
                <div className="h-[320px] flex items-center justify-center text-center px-6">
                  <div className="space-y-2">
                    <p className="font-bold text-slate-200">וידאו השחזור בהכנה</p>
                    <p className="text-xs text-slate-400">
                      {sessionEvents.length > 0
                        ? 'למפגש זה אין הקלטת מסך שמורה. הפעולות המתועדות מוצגות בטבלה.'
                        : 'למפגש זה עדיין אין הקלטה.'}
                    </p>
                  </div>
                </div>
              )}
              {chapters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  {chapters.map((c, i) => {
                    const active = playheadTs !== null && playheadTs >= c.start && playheadTs <= c.end;
                    return (
                      <button
                        key={`${c.exerciseId}-${c.start}-${i}`}
                        type="button"
                        onClick={() => { setSelectedExercise(c.exerciseId); requestSeek(c.start); }}
                        title={`${exerciseTitle(selectedSession, c.exerciseId)} — קפיצה לתחילת התרגיל`}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer ${active ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-indigo-500'}`}
                      >
                        {formatClock(c.start)} · {exerciseTitle(selectedSession, c.exerciseId)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
