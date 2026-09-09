import { useEffect, useMemo, useState } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { 
  SlidersHorizontal, 
  CheckCircle2, 
  BookOpen, 
  Layers, 
  Sparkles, 
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/infrastructure/firebase";
import { toast } from "sonner";
import { getHardcodedCatalogBanks, SESSION1_TASKS, SESSION2_TASKS, SESSIONS_BY_PATH, type SessionTask } from "@/data/sessionTasks";
import { getSessionBranchTasks } from "@/data/sessionBranchTasks";
import { DEFAULT_HESITATION_THRESHOLD_SECONDS } from "@/core/hesitationCalibration";

interface PathBank {
  label: string;
  compulsory: string[];
  reinforcement: string[];
  challenge: string[];
}

interface SessionCurriculumItem {
  sessionId: number;
  sessionTitle: string;
  banks: PathBank[];
}

const SESSION_TITLES: Record<number, string> = {
  1: "מפגש 1: ארגז חול — היכרות עם בית המספרים",
  2: "מפגש 2: אבחון (Q-Matrix) — שבע משימות אבחון",
  3: "מפגש 3: שיעור VRA אדפטיבי",
  4: "מפגש 4: שיעור VRA אדפטיבי",
  5: "מפגש 5: שיעור VRA אדפטיבי",
  6: "מפגש 6: שיעור VRA אדפטיבי",
  7: "מפגש 7: שיעור VRA אדפטיבי",
  8: "מפגש 8: חוקר-על — סיכום ורפלקציית SRL",
};

const titles = (tasks: Array<{ titleHe?: string }>) => tasks.map((t) => t.titleHe || "").filter(Boolean);

/**
 * The catalog shown here is derived from the banks the learners actually get
 * (sessionTasks / sessionBranchTasks — the same constants "פרסום קטלוג"
 * publishes). It used to be a hand-written list that described sessions 5–7
 * as multiplication lessons and session 3 as "מעבר תחום ה-10,000", none of
 * which exists in the banks or in the PRD's Module 14 progression.
 */
export function buildSessionCatalog(): SessionCurriculumItem[] {
  const items: SessionCurriculumItem[] = [];
  items.push({
    sessionId: 1,
    sessionTitle: SESSION_TITLES[1],
    banks: [{ label: "מסלול אחיד", compulsory: titles(SESSION1_TASKS), reinforcement: [], challenge: [] }],
  });
  items.push({
    sessionId: 2,
    sessionTitle: SESSION_TITLES[2],
    banks: [{ label: "מסלול אחיד", compulsory: titles(SESSION2_TASKS), reinforcement: [], challenge: [] }],
  });
  for (const n of [3, 4, 5, 6, 7, 8] as const) {
    const byPath = SESSIONS_BY_PATH[n];
    const banks: PathBank[] = (["green_path", "remediation_path"] as const).map((path) => ({
      label: path === "green_path" ? "מסלול ירוק (עד 10,000)" : "מסלול ביסוס (עד 1,000)",
      compulsory: titles((byPath?.[path] ?? []) as SessionTask[]),
      reinforcement: titles(getSessionBranchTasks(n, "reinforcement", path)),
      challenge: titles(getSessionBranchTasks(n, "challenge", path)),
    }));
    items.push({ sessionId: n, sessionTitle: SESSION_TITLES[n], banks });
  }
  return items;
}

/**
 * מודול 26: קטלוג תכנית הלימודים וחלוקת מטלות מרוכזת (Curriculum Catalog & Batch Assignment)
 * מבוסס Cloud Firestore תחת חוקי אבטחה קפדניים (/system_control, /classes).
 */
export function AdminCurriculumView() {
  const [hesitationThreshold, setHesitationThreshold] = useState<number>(DEFAULT_HESITATION_THRESHOLD_SECONDS);
  const [isSaved, setIsSaved] = useState(false);
  const [isSavingCalibration, setIsSavingCalibration] = useState(false);
  const sessionCatalog = useMemo(() => buildSessionCatalog(), []);

  const [expandedSession, setExpandedSession] = useState<number | null>(1);

  // Show the value that is actually in force. The slider used to start at 45
  // on every visit regardless of what had been saved, so an admin who set 60
  // saw "45" the next day and could not tell whether the save had held.
  useEffect(() => {
    getDoc(doc(db, 'system_control', 'trace_calibration'))
      .then((snap) => {
        const raw = snap.exists() ? snap.data()?.hesitation_threshold_seconds : undefined;
        if (typeof raw === 'number' && raw > 0) setHesitationThreshold(raw);
      })
      .catch((err) => console.warn('[AdminCurriculumView] calibration read notice:', err));
  }, []);

  // Only the hesitation threshold is read by anyone (core/hesitationCalibration.ts
  // feeds the student trigger and the teacher radar). The former "consecutive
  // deletions" slider wrote undo_threshold_clicks, which nothing reads: the
  // PRD fixes that trigger at four (Module 12), so the slider is gone.
  const handleSaveCalibration = async () => {
    setIsSavingCalibration(true);
    try {
      await setDoc(doc(db, 'system_control', 'trace_calibration'), {
        hesitation_threshold_seconds: hesitationThreshold,
        updated_at: Date.now(),
      }, { merge: true });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
      toast.success('הגדרות הכיול נשמרו ב-Firestore בהצלחה!');
    } catch (e) {
      console.error(e);
      toast.error('שגיאה בשמירת הגדרות הכיול. ודא שאתה מחובר כמנהל מערכת.');
    } finally {
      setIsSavingCalibration(false);
    }
  };

  // PRD v7.1 Modules 4/26: publish the canonical task banks to the Firestore
  // curriculum_catalog collection. Clients cache the banks in IndexedDB and
  // apply updates only to sessions that have not started yet.
  const [isPublishingCatalog, setIsPublishingCatalog] = useState(false);
  const handlePublishCatalog = async () => {
    try {
      setIsPublishingCatalog(true);
      const banks = getHardcodedCatalogBanks();
      const publishedAt = Date.now();
      await Promise.all(
        banks.map((bank) =>
          setDoc(doc(db, 'curriculum_catalog', bank.id), {
            session_number: bank.session_number,
            learning_path: bank.learning_path,
            updated_at: publishedAt,
            // JSON round-trip strips undefined optional fields Firestore rejects
            tasks: JSON.parse(JSON.stringify(bank.tasks)),
          })
        )
      );
      toast.success(`תוכנית הלימודים פורסמה בהצלחה: ${banks.length} מאגרי משימות עודכנו במסד הנתונים! 📚`);
    } catch (e) {
      console.error(e);
      toast.error('שגיאה בפרסום תוכנית הלימודים.');
    } finally {
      setIsPublishingCatalog(false);
    }
  };

  return (
    <div className="p-6 md:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 p-8 text-white shadow-2xl border border-purple-500/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-semibold">
              <BookOpen className="w-3.5 h-3.5" />
              <span>תוכנית הלימודים והפצה מרוכזת (מודול 26)</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              קטלוג פדגוגי וכיול מנוע הלמידה
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-light">
              מאגרי המשימות של 8 המפגשים (משימות חובה, ביסוס ואתגר לפי מסלול), פרסום התוכן למסד הנתונים וכיול סף ההיסוס של רדאר הלמידה.
            </p>
          </div>

          {/* Module 14 requires session activation to be an explicit, per-class
              teacher confirmation from the teacher dashboard — never an admin
              broadcast to every class at once. A prior "batch distribute"
              control here wrote to Firestore session fields nothing in the
              client ever reads (students only follow the teacher's own RTDB
              class-session broadcast), so it silently did nothing while showing
              a success toast, and it conflicted with Module 14's teacher-only
              rule had it been wired to work. Removed rather than connected.
              Publishing the curriculum catalog content itself (the exercise
              banks) is the legitimate Module 26 action below. */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePublishCatalog}
              disabled={isPublishingCatalog}
              className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <BookOpen className="w-4 h-4" />
              <span>{isPublishingCatalog ? 'מפרסם תוכנית לימודים...' : 'פרסום תוכנית הלימודים'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Curriculum Catalog Section */}
      <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-600" />
              קטלוג מפגשי הלמידה (משימות חובה + משימות בחירה לפי מסלול)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              מבנה המשימות המוצג לתלמידים — נגזר ישירות ממאגרי התוכן המפורסמים במערכת
            </p>
          </div>
          <span className="text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800">
            8 מפגשים מוגדרים
          </span>
        </div>

        <div className="space-y-3">
          {sessionCatalog.map((item) => {
            const isExpanded = expandedSession === item.sessionId;
            const compulsoryCount = item.banks[0]?.compulsory.length ?? 0;
            const branchCount = (item.banks[0]?.reinforcement.length ?? 0) + (item.banks[0]?.challenge.length ?? 0);

            return (
              <div 
                key={item.sessionId}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setExpandedSession(isExpanded ? null : item.sessionId)}
                  aria-expanded={isExpanded}
                  className="w-full text-right p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-purple-600 text-white font-black text-xs flex items-center justify-center">
                      {item.sessionId}
                    </span>
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {item.sessionTitle}
                      </h3>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                        <span>{compulsoryCount} משימות חובה{item.banks.length > 1 ? " בכל מסלול" : ""}</span>
                        {branchCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{branchCount} משימות בחירה (ביסוס / אתגר)</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-slate-400">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800/80 space-y-3 mt-2">
                    {item.banks.map((bank) => (
                      <div key={bank.label} className="grid md:grid-cols-2 gap-4">
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                          <div className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{bank.label}: משימות חובה ({bank.compulsory.length})</span>
                          </div>
                          <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-decimal list-inside pr-1">
                            {bank.compulsory.map((t, idx) => (
                              <li key={idx}>{t}</li>
                            ))}
                          </ol>
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                          <div className="text-xs font-bold text-amber-600 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>משימות בחירה לאחר 7 החובה</span>
                          </div>
                          {bank.reinforcement.length === 0 && bank.challenge.length === 0 ? (
                            <p className="text-xs text-slate-400">אין משימות בחירה במפגש זה.</p>
                          ) : (
                            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
                              {bank.reinforcement.length > 0 && (
                                <div>
                                  <div className="font-bold text-emerald-700 dark:text-emerald-300">ביסוס ({bank.reinforcement.length})</div>
                                  <ul className="list-disc list-inside pr-1">{bank.reinforcement.map((t, idx) => <li key={idx}>{t}</li>)}</ul>
                                </div>
                              )}
                              {bank.challenge.length > 0 && (
                                <div>
                                  <div className="font-bold text-amber-700 dark:text-amber-300">אתגר ({bank.challenge.length})</div>
                                  <ul className="list-disc list-inside pr-1">{bank.challenge.map((t, idx) => <li key={idx}>{t}</li>)}</ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AccessibleCard>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Calibration Panel */}
        <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-indigo-500" />
              כיול רדאר פדגוגי (Trace Data Calibration)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              הגדרת סף הרגישות לזיהוי מאבק קוגניטיבי סמוי במהלך עבודת התלמיד
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <label className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  סף זיהוי השהיה וחשיבה (Hesitation Threshold)
                </label>
                <span className="font-black text-indigo-600 dark:text-indigo-400 text-base font-mono bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  {hesitationThreshold} שניות
                </span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="120" 
                value={hesitationThreshold}
                onChange={(e) => setHesitationThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer" 
              />
              <p className="text-xs text-slate-500 leading-relaxed">
                משך הזמן המרבי (בשניות) שבו הלומד משתהה ללא פעולה במרחב הלמידה, בטרם המערכת מתעדת מצב של התלבטות ומאמץ קוגניטיבי.
              </p>
            </div>

            {isSaved && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>הגדרות הכיול נשמרו בהצלחה ויוחלו על לוח הבקרה בזמן אמת!</span>
              </div>
            )}

            <UdlButton 
              semanticColor="primary" 
              className="w-full justify-center py-3.5 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 cursor-pointer disabled:opacity-50"
              onClick={handleSaveCalibration}
              disabled={isSavingCalibration}
            >
              {isSavingCalibration ? 'שומר...' : 'שמירת הגדרות כיול'}
            </UdlButton>
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}
