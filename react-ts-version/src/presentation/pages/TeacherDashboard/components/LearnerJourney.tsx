import { useEffect, useMemo, useState } from 'react';
import { Video, ListOrdered, AlertTriangle, RotateCcw, Sparkles, FileText, Loader2 } from 'lucide-react';
import { ReplayViewer } from '@/presentation/components/ReplayViewer';
import {
  AI_FALLBACK_TEXT,
  REPORT_PROCESSING_TEXT,
  describeEvent,
  exerciseTitle,
  fetchLearnerEvents,
  fetchMeetingReport,
  fetchMeetingReportUrl,
  formatClock,
  formatDate,
  formatDuration,
  generateMeetingReport,
  groupEventsBySession,
  parseRecordingEvents,
  subscribeLearnerRecordings,
  SESSION_NAMES_HE,
  type JourneyEvent,
  type MeetingReport,
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

  // Module 23 (owner decision, register item 7): the AI report of the selected
  // meeting. The meeting's telemetry session_id is the key the server needs.
  const meetingSessionId = sessionEvents.length > 0 ? sessionEvents[0].sessionId : null;
  const [report, setReport] = useState<MeetingReport | null>(null);
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'generating' | 'opening' | 'error'>('idle');
  const [reportError, setReportError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setReportError('');
    if (!meetingSessionId) { setReportState('idle'); return; }
    setReportState('loading');
    fetchMeetingReport(meetingSessionId)
      .then((r) => { if (!cancelled) { setReport(r); setReportState('idle'); } })
      .catch((err) => {
        if (cancelled) return;
        setReportError(err instanceof Error ? err.message : String(err));
        setReportState('error');
      });
    return () => { cancelled = true; };
  }, [meetingSessionId]);

  const requestReport = async () => {
    if (!meetingSessionId || selectedSession === null) return;
    setReportState('generating');
    setReportError('');
    try {
      const r = await generateMeetingReport({ studentNum, sessionNumber: selectedSession, sessionId: meetingSessionId });
      setReport(r);
      setReportState('idle');
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
      setReportState('error');
    }
  };

  const openReportPdf = async () => {
    if (!report) return;
    try {
      setReportState('opening');
      const url = report.downloadUrl ?? (await fetchMeetingReportUrl(report.sessionId));
      window.open(url, '_blank', 'noopener');
      setReportState('idle');
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
      setReportState('error');
    }
  };

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

          {/* Module 23: the AI report of this meeting */}
          <div className="bg-ws-surface border border-ws-surface2 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black text-ws-ink">
                <Sparkles className="w-4 h-4 text-amber-500" />
                דוח הבינה · מפגש {selectedSession}
                {report?.generatedAt && (
                  <span className="text-[11px] font-bold text-ws-soft">הופק {formatDate(report.generatedAt)} {formatClock(report.generatedAt)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {report && (
                  <button
                    type="button"
                    onClick={openReportPdf}
                    disabled={reportState === 'opening' || reportState === 'generating'}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-ws-surface2 bg-ws-bg text-ws-ink hover:border-ws-accent/40 cursor-pointer disabled:opacity-50"
                  >
                    {reportState === 'opening' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                    פתיחת ה-PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={requestReport}
                  disabled={!meetingSessionId || reportState === 'generating' || reportState === 'loading'}
                  title={meetingSessionId ? 'הבינה מנתחת את הפעולות המתועדות של המפגש הזה' : 'אין פעולות מתועדות במפגש זה, אין מה לנתח'}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reportState === 'generating' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                  {reportState === 'generating' ? 'הבינה מנתחת… עד כ-20 שניות' : report ? 'הפקה מחדש' : `הפק דוח למפגש ${selectedSession}`}
                </button>
              </div>
            </div>

            {reportState === 'error' && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
                <div>{REPORT_PROCESSING_TEXT}</div>
                {reportError && <div className="font-normal mt-1 opacity-80">{reportError}</div>}
              </div>
            )}

            {!report && reportState !== 'error' && (
              <p className="text-xs text-ws-soft">
                {!meetingSessionId
                  ? 'אין פעולות מתועדות במפגש זה, ולכן אין דוח.'
                  : reportState === 'loading'
                    ? 'בודק אם כבר יש דוח למפגש זה…'
                    : 'עדיין לא הופק דוח למפגש זה. הדוח נבנה מהפעולות המתועדות של המפגש: ציון ניסיון ראשון, קבוצת עבודה מומלצת, סיפור התרגילים, פערי ידע והמלצות הוראה.'}
              </p>
            )}

            {report && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-ws-bg border border-ws-surface2">
                    <div className="text-2xl font-black text-ws-ink" dir="ltr">{report.scorePercent}%</div>
                    <div>
                      <div className="font-bold text-ws-ink">ציון ניסיון ראשון</div>
                      <div className="text-ws-soft">
                        {report.scoreSource === 'session_document'
                          ? 'ממסמך המפגש'
                          : report.scoreSource === 'telemetry_first_attempt'
                            ? `מחושב מ-${report.telemetryEventCount} פעולות מתועדות`
                            : 'מתוצאות האבחון'}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100">
                    <div className="font-black mb-1">קבוצת עבודה מומלצת: {report.routingLabelHe}</div>
                    <div>{report.recommendationDetailsHe}</div>
                  </div>
                  {report.exerciseNarratives.length > 0 && (
                    <div className="p-3 rounded-xl bg-ws-bg border border-ws-surface2">
                      <div className="font-black text-ws-ink mb-1">מה קרה בכל תרגיל</div>
                      <ul className="space-y-1 text-ws-ink">
                        {report.exerciseNarratives.map((n, i) => <li key={i}>• {n}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100 space-y-2">
                  <div className="font-black">ניתוח הבינה</div>
                  {report.aiAnalysisAvailable ? (
                    <>
                      <div>
                        <div className="font-bold mb-1">פערי ידע שאותרו</div>
                        {report.knowledgeGaps.length > 0
                          ? <ul className="space-y-1">{report.knowledgeGaps.map((g, i) => <li key={i}>• {g}</li>)}</ul>
                          : <div className="opacity-80">לא אותרו פערים בפעולות המתועדות.</div>}
                      </div>
                      <div>
                        <div className="font-bold mb-1">המלצות הוראה להמשך</div>
                        {report.teachingRecommendations.length > 0
                          ? <ul className="space-y-1">{report.teachingRecommendations.map((r, i) => <li key={i}>• {r}</li>)}</ul>
                          : <div className="opacity-80">אין המלצות נוספות.</div>}
                      </div>
                    </>
                  ) : (
                    <div className="opacity-90">{AI_FALLBACK_TEXT}</div>
                  )}
                </div>
              </div>
            )}
          </div>

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
