import { useEffect, useState } from 'react';
import { FileDown, FileText, Loader2, Sparkles, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { AI_FALLBACK_TEXT, REPORT_PROCESSING_TEXT, formatClock, formatDate } from '@/infrastructure/services/LearnerJourneyService';
import {
  fetchClassReport,
  generateClassReport,
  TIER_LABELS_HE,
  type ClassMeetingReport,
  type RecommendationTier,
} from '@/infrastructure/services/ClassReportService';

const SESSION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TIER_ORDER: RecommendationTier[] = ['below_50', 'between_50_75', 'above_75'];
const OUTCOME_HE = { first_try: 'ניסיון ראשון', after_correction: 'אחרי תיקון', incomplete: 'לא הושלם' } as const;

/**
 * Module 23, owner decision 6.9.2026 (register item 12): beside the report of
 * one learner there is a report of the whole class for every meeting, with
 * everything the individual report measures, aggregated. The numbers come
 * from the server's class_reports document; nothing here is computed.
 */
const isMissingReport = (err: unknown): boolean => {
  const code = String((err as { code?: string })?.code ?? '');
  return code.includes('permission-denied') || code.includes('not-found');
};

export function ClassMeetingReportPanel() {
  const [selectedSession, setSelectedSession] = useState<number>(2);
  const [report, setReport] = useState<ClassMeetingReport | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [state, setState] = useState<'idle' | 'loading' | 'generating' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError('');
    setState('loading');
    fetchClassReport(selectedSession)
      .then((r) => { if (!cancelled) { setReport(r); setState('idle'); } })
      .catch((err) => {
        if (cancelled) return;
        // A missing report doc is denied by the rules (resource.data deref) —
        // surface it as "no report yet", not as an error banner.
        if (isMissingReport(err)) { setReport(null); setState('idle'); return; }
        setError(err instanceof Error ? err.message : String(err));
        setState('error');
      });
    return () => { cancelled = true; };
  }, [selectedSession]);

  const requestReport = async () => {
    setState('generating');
    setError('');
    try {
      const r = await generateClassReport(selectedSession);
      setReport(r);
      setState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  const openUrl = (url: string | null) => {
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <section className="bg-ws-surface border border-ws-surface2 rounded-2xl p-4 space-y-3" dir="rtl" data-testid="class-meeting-report">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-ws-ink">
          <Users className="w-4 h-4 text-indigo-500" />
          דוח כיתה למפגש
          <div className="flex items-center gap-1 mr-2">
            {SESSION_NUMBERS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSelectedSession(n)}
                className={`w-7 h-7 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                  selectedSession === n ? 'bg-indigo-600 text-white' : 'bg-ws-bg text-ws-soft hover:text-ws-ink'
                }`}
                aria-pressed={selectedSession === n}
              >
                {n}
              </button>
            ))}
          </div>
          {report?.generatedAt && (
            <span className="text-[11px] font-bold text-ws-soft">הופק {formatDate(report.generatedAt)} {formatClock(report.generatedAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {report?.pdfUrl && (
            <button
              type="button"
              onClick={() => openUrl(report.pdfUrl)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-ws-surface2 bg-ws-bg text-ws-ink hover:border-ws-accent/40 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              פתיחת ה-PDF
            </button>
          )}
          {report?.csvUrl && (
            <button
              type="button"
              onClick={() => openUrl(report.csvUrl)}
              title="טבלת הלומדים של המפגש, שורה לכל תלמיד, לשימוש המחקר"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-ws-surface2 bg-ws-bg text-ws-ink hover:border-ws-accent/40 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              טבלה למחקר (CSV)
            </button>
          )}
          <button
            type="button"
            onClick={requestReport}
            disabled={state === 'generating' || state === 'loading'}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state === 'generating' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
            {state === 'generating' ? 'מעבד את כל פעולות המפגש… (עד דקה)' : report ? 'הפקה מחדש' : `הפק דוח כיתה למפגש ${selectedSession}`}
          </button>
          {report && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-ws-surface2 bg-ws-bg text-ws-ink hover:border-ws-accent/40 cursor-pointer transition-colors"
              title={isExpanded ? 'כווץ פירוט כיתתי' : 'הצג פירוט כיתתי מלא'}
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isExpanded ? 'כווץ פירוט' : 'הצג פירוט כיתתי מלא'}</span>
            </button>
          )}
        </div>
      </div>

      {state === 'error' && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
          <div>{REPORT_PROCESSING_TEXT}</div>
          {error && <div className="font-normal mt-1 opacity-80">{error}</div>}
        </div>
      )}

      {!report && state !== 'error' && (
        <p className="text-xs text-ws-soft">
          {state === 'loading'
            ? 'בודק אם כבר יש דוח כיתה למפגש זה…'
            : 'עדיין לא הופק דוח כיתה למפגש זה. הדוח נבנה מכל הפעולות המתועדות של כל התלמידים במפגש: ציון ניסיון ראשון לכל תלמיד, חלוקה לקבוצות עבודה, טעויות לפי טור, ביטולים, היסוסים, כרטיסי חניכה, הצלחה בכל תרגיל, וניתוח כיתתי של הבינה. הקובץ נשמר גם בדרייב, תיקייה "05 דוחות כיתה".'}
        </p>
      )}

      {report && (
        <div className="space-y-3 text-xs">
          {/* Class picture */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="תלמידים עם נתונים" value={`${report.learnersWithData} / 12`} />
            <Stat label="ציון ניסיון ראשון ממוצע" value={`${report.scoreMean}%`} sub={`חציון ${report.scoreMedian}% · טווח ${report.scoreMin}%–${report.scoreMax}%`} />
            <Stat label="ספרות שגויות" value={String(report.wrongDigitsTotal)} sub={`אחדות ${report.wrongDigitsByColumn.units} · עשרות ${report.wrongDigitsByColumn.tens} · מאות ${report.wrongDigitsByColumn.hundreds}`} />
            <Stat label="כרטיסי חניכה" value={String(report.socraticCardsTotal)} sub={`היסוסים ${report.hesitationsTotal} · ביטולים ${report.undosTotal} · מחיקות ${report.deletionsTotal}`} />
          </div>

          {/* Detailed Section (Collapsible - kept mounted to preserve subscriptions & state) */}
          <div className={isExpanded ? "space-y-3 pt-1" : "hidden"}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              {/* Layer 1: working groups */}
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100">
                <div className="font-black mb-1">חלוקה לקבוצות למידה דיפרנציאליות (לפי רמת הישג)</div>
                <ul className="space-y-1">
                  {TIER_ORDER.map((tier) => (
                    <li key={tier}>
                      <span className="font-bold">{TIER_LABELS_HE[tier]}:</span>{' '}
                      {report.tiers[tier].length > 0 ? report.tiers[tier].map((id) => `תלמיד ${id}`).join(', ') : 'אין'}
                    </li>
                  ))}
                </ul>
                {report.learnersWithoutData.length > 0 && (
                  <div className="mt-1 opacity-80">ללא פעולות במפגש: {report.learnersWithoutData.map((id) => `תלמיד ${id}`).join(', ')}</div>
                )}
              </div>

              {/* Exercises */}
              {report.exercises.length > 0 && (
                <div className="p-3 rounded-xl bg-ws-bg border border-ws-surface2 overflow-x-auto">
                  <div className="font-black text-ws-ink mb-1">התפלגות הצלחה בניסיון ראשון לפי תרגיל</div>
                  <table className="w-full text-[11px]">
                    <thead className="text-ws-soft">
                      <tr><th className="text-right">תרגיל</th><th>פתחו</th><th>סיימו</th><th>ניסיון ראשון</th><th>שגויות</th><th>כרטיסים</th><th>היסוסים</th></tr>
                    </thead>
                    <tbody className="text-ws-ink">
                      {report.exercises.map((ex) => (
                        <tr key={ex.exerciseId}>
                          <td className="text-right font-bold">{ex.exerciseId}</td>
                          <td className="text-center">{ex.attempted}</td>
                          <td className="text-center">{ex.completed}</td>
                          <td className="text-center">{ex.firstTry} ({ex.firstTryPercent}%)</td>
                          <td className="text-center">{ex.wrongDigits}</td>
                          <td className="text-center">{ex.socraticCards}</td>
                          <td className="text-center">{ex.hesitations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Layer 2 */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100 space-y-2">
              <div className="font-black">תובנות פדגוגיות כיתתיות</div>
              {report.aiAnalysisAvailable ? (
                <>
                  <div>
                    <div className="font-bold mb-1">דפוסים כיתתיים</div>
                    {report.classPatterns.length > 0
                      ? <ul className="space-y-1">{report.classPatterns.map((p, i) => <li key={i}>• {p}</li>)}</ul>
                      : <div className="opacity-80">לא אותרו דפוסים בפעולות המתועדות.</div>}
                  </div>
                  <div>
                    <div className="font-bold mb-1">המלצות הוראה לכיתה</div>
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

          {/* Per-learner table: every individual measurement */}
          <div className="p-3 rounded-xl bg-ws-bg border border-ws-surface2 overflow-x-auto">
            <div className="font-black text-ws-ink mb-1">טבלת נתונים מרוכזת: כלל המדדים לפי תלמיד</div>
            <table className="w-full text-[11px] whitespace-nowrap">
              <thead className="text-ws-soft">
                <tr>
                  <th className="text-right">תלמיד</th><th>מסלול</th><th>ציון</th><th>נכון בניסיון ראשון</th><th>תרגילים</th>
                  <th>שגויות (א/ע/מ)</th><th>מחיקות</th><th>ביטולים</th><th>היסוסים</th><th>המרות</th><th>כרטיסים</th><th>דקות</th><th>הקלטה</th><th>רפלקציה</th><th className="text-right">תרגילים</th>
                </tr>
              </thead>
              <tbody className="text-ws-ink">
                {report.learners.map((l) => (
                  <tr key={l.studentId} className="border-t border-ws-surface2">
                    <td className="text-right font-bold">תלמיד {l.studentId}</td>
                    <td className="text-center">{l.learningPath === 'green_path' ? 'ירוק' : 'ביסוס'}</td>
                    <td className="text-center font-black">{l.scorePercent}%</td>
                    <td className="text-center">{l.correctFirstAttempt}/{l.compulsoryTotal}</td>
                    <td className="text-center">{l.exercisesCompleted}/{l.exercisesAttempted}</td>
                    <td className="text-center">{l.wrongDigits} ({l.wrongDigitsByColumn[0]}/{l.wrongDigitsByColumn[1]}/{l.wrongDigitsByColumn[2]})</td>
                    <td className="text-center">{l.deletions}</td>
                    <td className="text-center">{l.undos}</td>
                    <td className="text-center">{l.hesitations}{l.hesitationSecondsTotal > 0 ? ` (${Math.round(l.hesitationSecondsTotal)} שנ׳)` : ''}</td>
                    <td className="text-center">{l.regroupings}</td>
                    <td className="text-center">{l.socraticCards}</td>
                    <td className="text-center">{l.activeMinutes}</td>
                    <td className="text-center">{l.recordingMinutes}</td>
                    <td className="text-center">{l.reflectionSubmitted ? 'כן' : 'לא'}</td>
                    <td className="text-right text-ws-soft">
                      {Object.entries(l.exerciseOutcomes).map(([id, o]) => `${id}: ${OUTCOME_HE[o]}`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-ws-soft">
            {report.telemetryEventCount} פעולות מתועדות · {report.regroupingsTotal} המרות · {report.reflectionsSubmitted} רפלקציות · זמן פעילות ממוצע {report.activeMinutesMean} דקות
            {report.drivePdfUrl && <> · <a href={report.drivePdfUrl} target="_blank" rel="noopener noreferrer" className="underline">עותק בדרייב</a></>}
          </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-xl bg-ws-bg border border-ws-surface2">
      <div className="text-ws-soft font-bold">{label}</div>
      <div className="text-xl font-black text-ws-ink" dir="ltr">{value}</div>
      {sub && <div className="text-[11px] text-ws-soft">{sub}</div>}
    </div>
  );
}
