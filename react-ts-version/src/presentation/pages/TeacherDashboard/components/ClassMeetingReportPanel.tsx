import { useEffect, useRef, useState } from 'react';
import { FileDown, FileText, Loader2, Sparkles, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { AI_FALLBACK_TEXT, REPORT_PROCESSING_TEXT, PRE_RESET_HEADING_HE, PRE_RESET_NOTE_HE, describeReportError, formatClock, formatDate } from '@/infrastructure/services/LearnerJourneyService';
import {
  FADING_GUESS_SECONDS,
  fetchClassReport,
  fetchClassReportFileUrl,
  generateClassReport,
  RESEARCH_MEASURES_HE,
  TIER_LABELS_HE,
  type ClassCatchUp,
  type ClassExerciseRow,
  type ClassLearnerMeasures,
  type ClassLearnerRow,
  type ClassMeetingReport,
  type ClassScaffoldCounters,
  type RecommendationTier,
} from '@/infrastructure/services/ClassReportService';
import { CHOICE_EXERCISES_HEADING_HE, CHOICE_PATH_LABEL_HE } from '@/core/choiceExercises';
import { meetingLabelHe } from '@/core/stationNames';
import { exerciseTitle, FIRST_ATTEMPT_SCORE_LABEL_HE } from '@/infrastructure/services/LearnerJourneyService';
import { ERROR_CATEGORY_HE, ROUTE_NAME_HE, TRIGGER_REASON_HE } from '@/core/routeLabels';
import { NOT_IN_THIS_REPORT_HE } from '@/core/researchMeasures';
import { CATCHUP_REASON_HE, CATCHUP_REASON_KEYS } from '@/core/catchUp';

const SESSION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TIER_ORDER: RecommendationTier[] = ['below_50', 'between_50_75', 'above_75'];
const OUTCOME_HE = { first_try: 'ניסיון ראשון', after_correction: 'אחרי תיקון', incomplete: 'לא הושלם' } as const;

function ExerciseRows({ rows, choice, sessionNumber }: { rows: ClassExerciseRow[]; choice: boolean; sessionNumber?: number }) {
  return (
    <table className="w-full text-[11px]">
      <thead className="text-ws-soft">
        <tr><th className="text-right">תרגיל</th>{choice && <th className="text-right">נתיב</th>}<th>פתחו</th><th>סיימו</th><th>ניסיון ראשון</th><th>שגויות</th><th>כרטיסים</th><th>היסוסים</th></tr>
      </thead>
      <tbody className="text-ws-ink">
        {rows.map((ex) => (
          <tr key={ex.exerciseId}>
            <td className="text-right font-bold">{exerciseTitle(sessionNumber ?? null, ex.exerciseId) || ex.exerciseId}</td>
            {choice && <td className="text-right">{ex.pathType === 'compulsory' ? '' : CHOICE_PATH_LABEL_HE[ex.pathType]}</td>}
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
  );
}

/**
 * מסמך 03: the choice exercises appear "מסומנים כתרגילי בחירה, בנפרד משבעת
 * תרגילי החובה" — their own table, each row naming its path.
 */
export function ClassExerciseTables({ exercises, sessionNumber }: { exercises: ClassExerciseRow[]; sessionNumber?: number }) {
  const compulsory = exercises.filter((ex) => ex.pathType === 'compulsory');
  const choice = exercises.filter((ex) => ex.pathType !== 'compulsory');
  return (
    <div className="p-3 rounded-xl bg-ws-bg border border-ws-surface2 overflow-x-auto space-y-3">
      <div>
        <div className="font-black text-ws-ink mb-1">התפלגות הצלחה בניסיון ראשון לפי תרגיל</div>
        {compulsory.length > 0 ? <ExerciseRows rows={compulsory} choice={false} sessionNumber={sessionNumber} /> : <div className="text-ws-soft">לא נרשמו תרגילי חובה.</div>}
      </div>
      {choice.length > 0 && (
        <div data-testid="choice-exercises">
          <div className="font-black text-ws-ink mb-1">{CHOICE_EXERCISES_HEADING_HE}</div>
          <ExerciseRows rows={choice} choice sessionNumber={sessionNumber} />
        </div>
      )}
    </div>
  );
}

/** "היסוס 45 שניות: 6 · לא בוצעה המרה נדרשת: 2", in the words of the learner's timeline; null when no card opened. */
export function countsLineHe(counts: Record<string, number>, names: Readonly<Record<string, string>>, other: string): string | null {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${names[key] ?? other}: ${n}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The scaffold and help line, as the server's class PDF prints it (functions/src/classReport.ts). */
export function scaffoldsLineHe(s: ClassScaffoldCounters): string {
  return `לוח החיבור: נפתח ${s.gridOpenings}, הוחזר על ידי הלומד ${s.gridReopenings} · הקלדה לפני המרה (מקלדת נעולה): ${s.keyboardLockBlocks} · קריאות שקטות למורה: ${s.helpRequests}${s.helpWithdrawals > 0 ? ` (הלומדים ביטלו ${s.helpWithdrawals} מהן)` : ''} · בקשות עזרה מהצ׳אט: ${s.chatHelpRequests} · פיגום בשורת התוצאה: ${s.placeCueScaffolds}`;
}

/**
 * Register deviation 19: why each card opened and which error it carried, and
 * the scaffold and help counters — they were in the PDF and the CSV only.
 */
function CardsAndScaffolds({ report }: { report: ClassMeetingReport }) {
  const triggers = countsLineHe(report.socraticTriggers, TRIGGER_REASON_HE, 'סיבה אחרת');
  const categories = countsLineHe(report.errorCategories, ERROR_CATEGORY_HE, 'סיווג אחר');
  return (
    <div className="p-3 rounded-xl bg-ws-bg border border-ws-surface2 text-ws-ink space-y-1" data-testid="class-cards-scaffolds">
      <div className="font-black">כרטיסי חניכה ופיגומים</div>
      <div><span className="font-bold">למה נפתחו הכרטיסים:</span> {triggers ?? 'לא נפתח אף כרטיס'}</div>
      <div><span className="font-bold">סוגי השגיאות בכרטיסים:</span> {categories ?? 'אין'}</div>
      <div>{scaffoldsLineHe(report.scaffolds)}</div>
    </div>
  );
}

const fadingValue = (x: number | null, unit: string): string => (x === null ? '—' : `${x}${unit}`);

/**
 * Register deviation 19: the fading gap of meeting 8 — the same numbers with
 * the blocks (meetings 4–6) and without them (meeting 8), per learner. It was
 * computed and stored, and shown only in the fallback PDF.
 */
export function FadingGapTable({ learners, sessionNumber }: { learners: ClassLearnerRow[]; sessionNumber: number }) {
  const rows = learners.filter((l) => l.fadingGap !== null);
  if (rows.length === 0) return null;
  const title = (id: string) => exerciseTitle(sessionNumber, id) || id;
  return (
    <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-950 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-100 overflow-x-auto" data-testid="class-fading-gap">
      <div className="font-black mb-1">פער הדעיכה: מפגש 8 בלי לבני הדינס מול מפגשים 4–6 עם לבני הדינס (אותם מספרים, אותו לומד)</div>
      <table className="w-full text-[11px] whitespace-nowrap">
        <thead className="opacity-80">
          <tr>
            <th className="text-right">תלמיד</th><th>זוגות שנמדדו</th><th>נכון בניסיון ראשון: עם לבני הדינס</th><th>בלי</th><th>זמן ממוצע לתרגיל: עם</th><th>בלי</th><th className="text-right">מהר מדי (מתחת ל-{FADING_GUESS_SECONDS} שנ׳)</th><th className="text-right">ללא זוג</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const f = l.fadingGap!;
            return (
              <tr key={l.studentId} className="border-t border-orange-200 dark:border-orange-800">
                <td className="text-right font-bold">תלמיד {l.studentId}</td>
                <td className="text-center">{f.pairsMeasured}</td>
                <td className="text-center">{fadingValue(f.accuracyWithBlocksPercent, '%')}</td>
                <td className="text-center">{fadingValue(f.accuracyWithoutBlocksPercent, '%')}</td>
                <td className="text-center">{fadingValue(f.meanSecondsWithBlocks, ' שנ׳')}</td>
                <td className="text-center">{fadingValue(f.meanSecondsWithoutBlocks, ' שנ׳')}</td>
                <td className="text-right">{f.guessedExercises.map(title).join(', ') || 'אין'}</td>
                <td className="text-right">{f.unpairedExercises.map(title).join(', ') || 'אין'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Module 23, owner decision 6.9.2026 (register item 9): beside the report of
 * one learner there is a report of the whole class for every meeting, with
 * everything the individual report measures, aggregated. The numbers come
 * from the server's class_reports document; nothing here is computed.
 */
const isMissingReport = (err: unknown): boolean => {
  const code = String((err as { code?: string })?.code ?? '');
  return code.includes('not-found');
};
const isPermissionDenied = (err: unknown): boolean =>
  String((err as { code?: string })?.code ?? '').includes('permission-denied');
/** Shown instead of "no report yet" when the account cannot read reports at all. */
const NO_REPORT_ACCESS_TEXT = 'אין לחשבון הזה הרשאה לקרוא דוחות. התנתקו והתחברו מחדש כמורה; אם זה חוזר, פנו למנהל המערכת.';

/** A percentage the server may not have measured. Never "0%", never a bare "%". */
const pctText = (value: number | null): string => (value === null ? 'לא נמדד' : `${value}%`);
const ratioText = (r: { completed: number; firstTry: number; percent: number | null } | null): string =>
  !r || r.percent === null ? 'לא נמדד' : `${r.firstTry} מתוך ${r.completed} (${r.percent}%)`;
const mediationText = (m: { cards: number; effective: number; percent: number | null } | null): string =>
  !m ? 'לא נמדד' : m.percent === null ? 'לא נדרש תיווך (0 כרטיסים)' : `${m.effective} מתוך ${m.cards} כרטיסים (${m.percent}%)`;
/** Measure 2א, as the server's persistenceHe writes it. A report stored before 30.9.2026 has no value. */
const persistenceText = (p: ClassLearnerMeasures['persistenceWithoutHelp']): string =>
  !p ? NOT_IN_THIS_REPORT_HE : p.percent === null ? 'לא היו טעויות' : `${p.percent}% (בלי קריאה לעזרה ב-${p.solvedWithoutHelp} מתוך ${p.exercisesWithErrors} תרגילים עם טעות)`;

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
        setError(isPermissionDenied(err) ? NO_REPORT_ACCESS_TEXT : describeReportError(err).message);
        setState('error');
      });
    return () => { cancelled = true; };
  }, [selectedSession]);

  // A report is generated for one meeting. The meeting buttons used to stay
  // live meanwhile: switching from 2 to 3 showed meeting 2's report under
  // meeting 3 when it arrived, and cleared "generating" so a second run could
  // start. The buttons are now disabled while generating, and a result for a
  // meeting that is no longer selected is dropped all the same.
  const selectedSessionRef = useRef(selectedSession);
  selectedSessionRef.current = selectedSession;
  const isGenerating = state === 'generating';

  const requestReport = async () => {
    const forSession = selectedSession;
    setState('generating');
    setError('');
    try {
      const r = await generateClassReport(forSession);
      if (selectedSessionRef.current !== forSession) return;
      setReport(r);
      setState('idle');
    } catch (err) {
      if (selectedSessionRef.current !== forSession) return;
      setError(describeReportError(err).message);
      setState('error');
    }
  };

  // PRD 23 §ב: the links are made per request, so each click asks for a
  // fresh one. The tab opens inside the click (a tab opened after the wait may
  // be blocked) and gets its address when the link arrives.
  const openFile = async (kind: 'pdf' | 'csv') => {
    if (!report) return;
    const tab = window.open('', '_blank');
    if (!tab) {
      setError('הדפדפן חסם את פתיחת הקובץ בלשונית חדשה. אפשרו חלונות קופצים לאתר ונסו שוב.');
      setState('error');
      return;
    }
    tab.opener = null;
    try {
      tab.location.href = await fetchClassReportFileUrl(report.sessionNumber, kind);
    } catch (err) {
      tab.close();
      setError(describeReportError(err).message);
      setState('error');
    }
  };

  const scoredLearnersWithoutScore = report
    ? report.learnersWithoutScore.filter((id) => !report.learnersWithoutData.includes(id))
    : [];

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
                disabled={isGenerating}
                className={`w-11 h-11 rounded-lg text-sm font-black transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                  selectedSession === n ? 'bg-indigo-600 text-white' : 'bg-ws-bg text-ws-soft hover:text-ws-ink'
                }`}
                aria-pressed={selectedSession === n}
                aria-label={meetingLabelHe(n)}
                title={meetingLabelHe(n)}
              >
                {n}
              </button>
            ))}
          </div>
          {/* The selected meeting under the name the children see (owner, 27.9.2026). */}
          <span className="text-xs font-bold text-ws-soft">{meetingLabelHe(selectedSession)}</span>
          {report?.generatedAt && (
            <span className="text-[11px] font-bold text-ws-soft">הופק {formatDate(report.generatedAt)} {formatClock(report.generatedAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {report?.hasPdf && (
            <button
              type="button"
              onClick={() => { void openFile('pdf'); }}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-ws-surface2 bg-ws-bg text-ws-ink hover:border-ws-accent/40 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              פתחו PDF
            </button>
          )}
          {report?.hasCsv && (
            <button
              type="button"
              onClick={() => { void openFile('csv'); }}
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
            {state === 'generating' ? 'מעבד את כל פעולות המפגש… (עד דקה)' : report ? 'הפיקו מחדש' : `הפיקו דוח כיתה למפגש ${selectedSession}`}
          </button>
          {report && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-ws-surface2 bg-ws-bg text-ws-ink hover:border-ws-accent/40 cursor-pointer transition-colors"
              title={isExpanded ? 'כווצו את הפירוט הכיתתי' : 'הציגו פירוט כיתתי מלא'}
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isExpanded ? 'כווצו פירוט' : 'הציגו פירוט כיתתי מלא'}</span>
            </button>
          )}
        </div>
      </div>

      {state === 'error' && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
          <div>{error || REPORT_PROCESSING_TEXT}</div>
        </div>
      )}

      {!report && state !== 'error' && (
        <p className="text-xs text-ws-soft">
          {state === 'loading'
            ? 'בודק אם כבר יש דוח כיתה למפגש זה…'
            : selectedSession === 1
              ? 'עדיין לא הופק דוח כיתה למפגש זה. מפגש 1 אינו מקבל ציון: הדוח מראה מי עוד לא הפעיל כל אחד מכלי המערכת, איך הסתיים כל תרגיל ריענון, ועל מה לשים לב לקראת האבחון. הקובץ נשמר גם בדרייב, תיקייה "1 דוחות".'
              : 'עדיין לא הופק דוח כיתה למפגש זה. הדוח נבנה מכל הפעולות המתועדות של כל התלמידים במפגש: שיעור ההצלחה בניסיון ראשון לכל תלמיד, חלוקה לקבוצות למידה, טעויות לפי טור, ביטולים, היסוסים, כרטיסי חניכה, הצלחה בכל תרגיל, ותובנות פדגוגיות כיתתיות. הקובץ נשמר גם בדרייב, תיקייה "1 דוחות".'}
        </p>
      )}

      {report && (
        <div className="space-y-3 text-xs">
          {/* Class picture */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="תלמידים עם נתונים" value={`${report.learnersWithData} / 12`} />
            {report.scored ? (
              <Stat
                label={`ממוצע ${FIRST_ATTEMPT_SCORE_LABEL_HE}`}
                value={pctText(report.scoreMean)}
                sub={report.scoreMean === null ? 'אין ציון ללומדי המפגש' : `חציון ${pctText(report.scoreMedian)} · טווח ${report.scoreMin}%–${report.scoreMax}%`}
              />
            ) : (
              <Stat label="מפגש היכרות וריענון" value="ללא ציון" sub={`זמן פעילות ממוצע ${report.activeMinutesMean} דקות`} />
            )}
            <Stat label="ספרות שגויות" value={String(report.wrongDigitsTotal)} sub={`יחידות ${report.wrongDigitsByColumn.units} · עשרות ${report.wrongDigitsByColumn.tens} · מאות ${report.wrongDigitsByColumn.hundreds}`} />
            <Stat label="כרטיסי חניכה" value={String(report.socraticCardsTotal)} sub={`היסוסים ${report.hesitationsTotal} · ביטולים ${report.undosTotal} · מחיקות ${report.deletionsTotal}`} />
          </div>

          {/* The catalog sentence is about learners who worked and still got no
              score. A learner with no recorded work has no score for that
              reason alone, and is listed apart ("תלמידים עם נתונים"). */}
          {report.scored && scoredLearnersWithoutScore.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
              ללא ציון: {scoredLearnersWithoutScore.map((id) => `תלמיד ${id}`).join(', ')}. מאגר תרגילי החובה של המפגש אינו זמין בשרת, ולכן אין ממה לחשב ציון. על מנהל המערכת ללחוץ "פרסום תוכנית הלימודים", ואז להפיק את הדוח מחדש.
            </div>
          )}

          {report.catchUp && <ClassCatchUpBlock catchUp={report.catchUp} />}

          {/* Detailed Section (Collapsible - kept mounted to preserve subscriptions & state) */}
          <div className={isExpanded ? "space-y-3 pt-1" : "hidden"}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              {/* Layer 1: working groups — or, in meeting 1 (Module 14 §ב), the tools before the diagnostic */}
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100">
                {report.scored ? (
                  <>
                    <div className="font-black mb-1">חלוקה לקבוצות למידה דיפרנציאליות (לפי רמת הישג)</div>
                    <ul className="space-y-1">
                      {TIER_ORDER.map((tier) => (
                        <li key={tier}>
                          <span className="font-bold">{TIER_LABELS_HE[tier]}:</span>{' '}
                          {report.tiers[tier].length > 0 ? report.tiers[tier].map((id) => `תלמיד ${id}`).join(', ') : 'אין'}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <div className="font-black mb-1">שליטה בכלי המערכת לקראת האבחון</div>
                    {report.toolsNotUsed.length === 0 ? (
                      <div className="opacity-80">דוח זה הופק לפני שנוסף לו פירוט הכלים. הפיקו אותו מחדש כדי לראות אותו.</div>
                    ) : (
                      <ul className="space-y-1">
                        {report.toolsNotUsed.map((t) => (
                          <li key={t.label}>
                            <span className="font-bold">{t.label}:</span>{' '}
                            {t.learners.length > 0 ? `לא הפעילו — ${t.learners.map((id) => `תלמיד ${id}`).join(', ')}` : 'כל התלמידים הפעילו'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {report.learnersWithoutData.length > 0 && (
                  <div className="mt-1 opacity-80">ללא פעולות במפגש: {report.learnersWithoutData.map((id) => `תלמיד ${id}`).join(', ')}</div>
                )}
              </div>

              {/* Exercises */}
              {report.exercises.length > 0 && <ClassExerciseTables exercises={report.exercises} sessionNumber={selectedSession} />}

              <CardsAndScaffolds report={report} />
            </div>

            {/* Layer 2 */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100 space-y-2">
              <div className="font-black">{report.scored ? 'תובנות פדגוגיות כיתתיות' : 'לקראת האבחון'}</div>
              {report.aiAnalysisAvailable ? (
                <>
                  <div className="text-[11px] font-bold opacity-70">נותח אוטומטית מהפעולות המתועדות. ההחלטה הפדגוגית נותרת בידי המורה.</div>
                  <div>
                    <div className="font-bold mb-1">{report.scored ? 'דפוסים כיתתיים' : 'נקודות לתשומת לב לקראת האבחון'}</div>
                    {report.classPatterns.length > 0
                      ? <ul className="space-y-1">{report.classPatterns.map((p, i) => <li key={i}>• {p}</li>)}</ul>
                      : <div className="opacity-80">לא אותרו דפוסים בפעולות המתועדות.</div>}
                  </div>
                  <div>
                    <div className="font-bold mb-1">{report.scored ? 'המלצות הוראה לכיתה' : 'מה אפשר לעשות לפני האבחון'}</div>
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
                  <th className="text-right">תלמיד</th><th>מסלול</th>{report.scored && <><th>{FIRST_ATTEMPT_SCORE_LABEL_HE}</th><th>נכון בניסיון ראשון</th></>}<th>תרגילים</th>
                  <th>שגויות (א/ע/מ)</th><th>מחיקות</th><th>ביטולים</th><th>היסוסים</th><th>המרות</th><th>כרטיסים</th><th>דקות</th><th>הקלטה</th><th>רפלקציה</th><th className="text-right">תרגילים</th>
                </tr>
              </thead>
              <tbody className="text-ws-ink">
                {report.learners.map((l) => (
                  <tr key={l.studentId} className="border-t border-ws-surface2">
                    <td className="text-right font-bold">תלמיד {l.studentId}</td>
                    <td className="text-center">{l.learningPath ? ROUTE_NAME_HE[l.learningPath] : '—'}</td>
                    {report.scored && (
                      <>
                        <td className="text-center font-black">{pctText(l.scorePercent)}</td>
                        <td className="text-center">{l.scorePercent === null ? 'לא נמדד' : `${l.correctFirstAttempt}/${l.compulsoryTotal}`}</td>
                      </>
                    )}
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
                      {Object.entries(l.exerciseOutcomes).map(([id, o]) => `${exerciseTitle(selectedSession, id) || id}: ${OUTCOME_HE[o]}`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <FadingGapTable learners={report.learners} sessionNumber={report.sessionNumber} />

          {/* Owner, 2.10.2026: the mistakes before a reset, documented apart; the table above counts the new run. */}
          {report.preResetNotes.length > 0 && (
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-950 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-100" data-testid="class-pre-reset">
              <div className="font-black mb-1">{PRE_RESET_HEADING_HE}</div>
              <div className="text-[11px] opacity-80 mb-1">{PRE_RESET_NOTE_HE}</div>
              <ul className="space-y-1">
                {report.preResetNotes.map((note, i) => <li key={i}>• {note}</li>)}
              </ul>
            </div>
          )}

          {/* PRD 7.3, Module 23 §ב "מדדי המחקר": shown in the class report. They were in the PDF and the CSV only. */}
          <div className="p-3 rounded-xl bg-ws-bg border border-ws-surface2 overflow-x-auto">
            <div className="font-black text-ws-ink mb-1">מדדי המחקר</div>
            {/* One sentence per measure, so the teacher reads each column without a formula (owner, 30.9.2026). */}
            <ul className="text-ws-soft mb-2 space-y-0.5">
              {RESEARCH_MEASURES_HE.map((m) => (
                <li key={m.key}><span className="font-bold text-ws-ink">{m.label}.</span> {m.explanation}</li>
              ))}
            </ul>
            {report.learnersWithoutMediation !== null && (
              <div className="text-ws-ink mb-1">
                לא נדרשו לתיווך במפגש זה: {report.learnersWithoutMediation.length} מתוך 12, נתונים קיימים ל-{report.learnersWithData} לומדים
                {report.learnersWithoutMediation.length > 0 ? ` (${report.learnersWithoutMediation.map((id) => `תלמיד ${id}`).join(', ')})` : ''}
              </div>
            )}
            <table className="w-full text-[11px] whitespace-nowrap">
              <thead className="text-ws-soft">
                <tr>
                  <th className="text-right">תלמיד</th><th>2א. התמדה</th><th>2ב. תיקון עצמי</th><th>3. גמישות ייצוגית</th><th>3. גמישות ייצוגית – מצטבר (מפגשים 3 ו-7)</th><th>4. אפקטיביות התיווך</th><th>4. אפקטיביות התיווך – מצטבר (כל המפגשים)</th>
                </tr>
              </thead>
              <tbody className="text-ws-ink">
                {report.learners.map((l) => (
                  <tr key={l.studentId} className="border-t border-ws-surface2">
                    <td className="text-right font-bold">תלמיד {l.studentId}</td>
                    <td className="text-center">
                      {persistenceText(l.measures.persistenceWithoutHelp)}
                    </td>
                    <td className="text-center">
                      {l.measures.selfCorrection
                        ? `${l.measures.selfCorrection.percent}% (ביטולים: ${l.measures.selfCorrection.undos}, ספרות שגויות: ${l.measures.selfCorrection.wrongDigits}, בחירות שגויות בכרטיס: ${l.measures.selfCorrection.wrongOptions})`
                        : 'לא נמדד'}
                    </td>
                    <td className="text-center">{ratioText(l.measures.flexibility)}</td>
                    <td className="text-center">{ratioText(l.measures.flexibilityCumulative)}</td>
                    <td className="text-center">{mediationText(l.measures.mediation)}</td>
                    <td className="text-center">{mediationText(l.measures.mediationCumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-ws-soft">
            {report.telemetryEventCount} פעולות מתועדות · {report.regroupingsTotal} המרות · {report.reflectionsSubmitted} רפלקציות · זמן פעילות ממוצע {report.activeMinutesMean} דקות
            {report.drivePdfUrl
              ? <> · <a href={report.drivePdfUrl} target="_blank" rel="noopener noreferrer" className="underline">עותק בדרייב</a></>
              : <> · העותק בדרייב לא נשמר (הדוח עצמו שמור במערכת)</>}
          </div>
          </div>
        </div>
      )}
    </section>
  );
}

const learnersHe = (n: number): string => (n === 1 ? 'תלמיד אחד' : `${n} תלמידים`);
const minutesTotalHe = (n: number): string => (n === 1 ? 'דקה אחת' : `${n} דקות`);

/** "2 תלמידים קיבלו זמן השלמה, 9 דקות בסך הכול" — or that none has yet. */
export function catchUpTotalsHe(c: ClassCatchUp): string {
  if (c.learnersWithRounds === 0) return 'אף תלמיד עוד לא קיבל זמן השלמה';
  const who = c.learnersWithRounds === 1 ? 'תלמיד אחד קיבל' : `${c.learnersWithRounds} תלמידים קיבלו`;
  return `${who} זמן השלמה, ${minutesTotalHe(c.totalMinutes)} בסך הכול`;
}

/** "הסיבות שנרשמו: עבד בקצב איטי (2 תלמידים) · תקלה טכנית (תלמיד אחד)" — the closed list's order, recorded reasons only. */
export function catchUpReasonsHe(c: ClassCatchUp): string | null {
  const parts = CATCHUP_REASON_KEYS.filter((k) => c.reasonCounts[k] > 0).map((k) => `${CATCHUP_REASON_HE[k]} (${learnersHe(c.reasonCounts[k])})`);
  return parts.length > 0 ? `הסיבות שנרשמו: ${parts.join(' · ')}` : null;
}

/**
 * Catch-up time (owner, 2.10.2026): "וזה יתועד מה הסיבה לכך". Who did not
 * finish the meeting, why, and the catch-up time they got — as the server
 * stored it in the class report. Nothing when no reason was recorded.
 */
export function ClassCatchUpBlock({ catchUp }: { catchUp: ClassCatchUp }) {
  if (catchUp.learners.length === 0) return null;
  const reasons = catchUpReasonsHe(catchUp);
  return (
    <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-100" data-testid="class-catch-up">
      <div className="font-black mb-1">תלמידים שלא סיימו את המפגש</div>
      <div className="font-bold">{catchUpTotalsHe(catchUp)}</div>
      {reasons && <div className="mb-1">{reasons}</div>}
      <ul className="space-y-1">
        {catchUp.learners.map((l) => (
          <li key={l.studentNumber}>• תלמיד {l.studentNumber}: {l.lineHe}</li>
        ))}
      </ul>
    </div>
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
