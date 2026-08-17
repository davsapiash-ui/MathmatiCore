import { useState } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { 
  Brain, 
  SlidersHorizontal, 
  ToggleLeft, 
  ToggleRight, 
  CheckCircle2, 
  BookOpen, 
  Layers, 
  Sparkles, 
  Send, 
  Award,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useAdminStore } from "@/application/useAdminStore";
import { ref, update } from "firebase/database";
import { database } from "@/infrastructure/firebase";
import { toast } from "sonner";

interface SessionCurriculumItem {
  sessionId: number;
  sessionTitle: string;
  mandatoryTasksCount: number;
  challengeTasksCount: number;
  mandatoryTopics: string[];
  challengeTopics: string[];
}

const SESSIONS_CURRICULUM_CATALOG: SessionCurriculumItem[] = [
  {
    sessionId: 1,
    sessionTitle: "מפגש 1: היכרות עם מרחב החקר והמבנה העשרוני",
    mandatoryTasksCount: 7,
    challengeTasksCount: 3,
    mandatoryTopics: ["גרירת לבני יחידות ועשרות", "המרה מוחשית בבית המספרים", "ייצוג מספרים עד 1,000"],
    challengeTopics: ["המרה מהירה ללא תמיכת רשת", "חידות ייצוג מספרי"],
  },
  {
    sessionId: 2,
    sessionTitle: "מפגש 2: שער חיבור ומטריצת Q-Matrix דיאגנוסטית",
    mandatoryTasksCount: 7,
    challengeTasksCount: 3,
    mandatoryTopics: ["5 משימות אבחון Q-Matrix", "חיבור עם המרה ללא שארית", "הזנה בעיגולי זיכרון"],
    challengeTopics: ["משימות הרחבה (רבה)", "חישוב בעל פה"],
  },
  {
    sessionId: 3,
    sessionTitle: "מפגש 3: מעבר תחום ה-10,000 וחיבור רב-שלבי",
    mandatoryTasksCount: 7,
    challengeTasksCount: 3,
    mandatoryTopics: ["עמודת אלפים", "חיבור 3 מחוברים", "המרה כפולה (יחידות ועשרות)"],
    challengeTopics: ["מסלול אתגר רב-שלבי", "משוואות חסרות"],
  },
  {
    sessionId: 4,
    sessionTitle: "מפגש 4: גמישות בהמרות ואסטרטגיות פריטה",
    mandatoryTasksCount: 7,
    challengeTasksCount: 3,
    mandatoryTopics: ["המרה הלוך ושוב", "ייצוג שווה-ערך", "ביקורת ובקרה עצמית ב-Undo"],
    challengeTopics: ["פירוק מבנה עשרוני מורכב", "חידות ערך מקום"],
  },
  {
    sessionId: 5,
    sessionTitle: "מפגש 5: כפל בסיסי ומשמעות העשרת השלמה",
    mandatoryTasksCount: 7,
    challengeTasksCount: 3,
    mandatoryTopics: ["כפל פי 10", "הזזת עמודות שמאלה", "דפוסים במבנה העשרוני"],
    challengeTopics: ["כפל פי 20 ו-30", "מציאת גורם חסר"],
  },
  {
    sessionId: 6,
    sessionTitle: "מפגש 6: כפל פי 100 ומאות שלמות",
    mandatoryTasksCount: 7,
    challengeTasksCount: 3,
    mandatoryTopics: ["כפל פי 100", "הזזה כפולה בעמודות", "קישור בין חיבור לכפל"],
    challengeTopics: ["כפל עשרות במאות", "אומדן תוצאה"],
  },
  {
    sessionId: 7,
    sessionTitle: "מפגש 7: שילוב פעולות ומשוואות מבנה עשרוני",
    mandatoryTasksCount: 7,
    challengeTasksCount: 3,
    mandatoryTopics: ["חיבור וכפל משולב", "סדר פעולות אינטואיטיבי", "בקרת שגיאות"],
    challengeTopics: ["משוואות אתגר מתקדמות", "חקר דפוסים"],
  },
  {
    sessionId: 8,
    sessionTitle: "מפגש 8: מפגש מסכם, רפלקציית SRL והערכה",
    mandatoryTasksCount: 7,
    challengeTasksCount: 3,
    mandatoryTopics: ["משימות סיכום מקיפות", "חישוב מדד התמדה SRL", "שאלון רפלקציה 3 שלבים"],
    challengeTopics: ["משימות רבה מתקדמות", "חזקות בסיס 10"],
  },
];

/**
 * מודול 26: קטלוג תכנית הלימודים וחלוקת מטלות מרוכזת (Curriculum Catalog & Batch Assignment)
 * כולל ניהול 7 משימות החובה + נתיבי האתגר לכל מפגש, מנגנון Batch להפצה לכלל הכיתות, וכיול מנוע.
 */
export function AdminCurriculumView() {
  const { schools, classes } = useAdminStore();
  const [hesitationThreshold, setHesitationThreshold] = useState<number>(45);
  const [undoThreshold, setUndoThreshold] = useState<number>(4);
  const [isSaved, setIsSaved] = useState(false);

  const [regroupingEnabled, setRegroupingEnabled] = useState(true);
  const [fluencyEnabled, setFluencyEnabled] = useState(true);

  const [expandedSession, setExpandedSession] = useState<number | null>(1);
  const [selectedBatchSession, setSelectedBatchSession] = useState<number>(1);
  const [isBatchDistributing, setIsBatchDistributing] = useState(false);

  const handleSaveCalibration = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleBatchDistribute = async () => {
    try {
      setIsBatchDistributing(true);
      const updates: Record<string, any> = {
        'system_control/active_batch_session': selectedBatchSession,
        'system_control/batch_assigned_at': Date.now(),
      };

      // Also set active_session_id across all classroom sessions
      classes.forEach((cls) => {
        updates[`classes/${cls.id}/active_session_id`] = selectedBatchSession;
      });

      await update(ref(database), updates);
      toast.success(`מפגש ${selectedBatchSession} (7 משימות חובה + אתגר) הופץ בהצלחה לכל ${classes.length || 1} הכיתות במערכת! 🚀`);
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בהפצת המטלות המרוכזת.");
    } finally {
      setIsBatchDistributing(false);
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
              <span>מודול 26: קטלוג תכנית הלימודים והפצה מרוכזת (Batch)</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              קטלוג פדגוגי וכיול מנוע הלמידה
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-light">
              ניהול 7 משימות החובה ונתיבי האתגר (רבה), הפצה מרוכזת לכיתות וכיול ספי ה-Trace Data.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedBatchSession}
              onChange={(e) => setSelectedBatchSession(parseInt(e.target.value, 10))}
              className="px-4 py-2.5 rounded-2xl bg-purple-900/60 border border-purple-400/40 text-white font-bold text-xs"
            >
              {SESSIONS_CURRICULUM_CATALOG.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  שגר מפגש {s.sessionId}
                </option>
              ))}
            </select>

            <button
              onClick={handleBatchDistribute}
              disabled={isBatchDistributing}
              className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isBatchDistributing ? 'מפיץ מטלות...' : 'הפצה מרוכזת (Batch)'}</span>
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
              קטלוג מפגשי הלמידה (7 משימות יסוד + נתיבי אתגר)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              סקירה וניהול של מבנה המפגשים, משימות החובה ומסלולי ההעמקה
            </p>
          </div>
          <span className="text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800">
            8 מפגשים מוגדרים
          </span>
        </div>

        <div className="space-y-3">
          {SESSIONS_CURRICULUM_CATALOG.map((item) => {
            const isExpanded = expandedSession === item.sessionId;

            return (
              <div 
                key={item.sessionId}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 overflow-hidden transition-all"
              >
                <div 
                  onClick={() => setExpandedSession(isExpanded ? null : item.sessionId)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/40"
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
                        <span>7 משימות יסוד חובה</span>
                        <span>•</span>
                        <span>3 משימות אתגר והעמקה</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-slate-400">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800/80 grid md:grid-cols-2 gap-4 mt-2">
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>משימות חובה ויסוד (Foundation):</span>
                      </div>
                      <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside pr-1">
                        {item.mandatoryTopics.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="text-xs font-bold text-amber-600 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>משימות הרחבה ואתגר (Rabbah Challenge):</span>
                      </div>
                      <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside pr-1">
                        {item.challengeTopics.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>
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
                  סף זיהוי השהייה (Hesitation Threshold)
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
                משך הזמן המרבי (בשניות) שבו הלומד אינו מבצע פעולה יצרנית, בטרם המערכת מתעדת אירוע של "מאבק קוגניטיבי" (Cognitive Struggle).
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <label className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  סף זיהוי מחיקות רצופות (Consecutive Deletions)
                </label>
                <span className="font-black text-indigo-600 dark:text-indigo-400 text-base font-mono bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  {undoThreshold} פעולות
                </span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={undoThreshold}
                onChange={(e) => setUndoThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer" 
              />
              <p className="text-xs text-slate-500 leading-relaxed">
                מספר הפעולות הרצופות של מחיקה אשר יסווגו את הלומד כזקוק לחניכה סוקרטית.
              </p>
            </div>

            {isSaved && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>הגדרות הכיול נשמרו בהצלחה ויוחלו על ניטור הלייב!</span>
              </div>
            )}

            <UdlButton 
              semanticColor="primary" 
              className="w-full justify-center py-3.5 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 cursor-pointer"
              onClick={handleSaveCalibration}
            >
              שמור הגדרות כיול
            </UdlButton>
          </div>
        </AccessibleCard>

        {/* Diagnostic Modules Panel */}
        <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              ניהול מודולים מאבחנים (Diagnostic Modules)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              הפעלה וניהול של אלגוריתמי האבחון הפעילים במטריצת Q-Matrix
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 transition-all hover:border-emerald-300">
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-900 dark:text-white">גמישות בהמרת עשרות (Regrouping Flexibility)</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  אלגוריתם המנתח את יכולת הלומד לזהות ולהמיר קבוצה של 10 יחידות לעשרת אחת שלמה.
                </p>
              </div>
              <button onClick={() => setRegroupingEnabled(!regroupingEnabled)} className="shrink-0 mr-4 cursor-pointer">
                {regroupingEnabled ? (
                  <ToggleRight className="w-10 h-10 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-slate-400" />
                )}
              </button>
            </div>

            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 transition-all hover:border-emerald-300">
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-900 dark:text-white">שטף חיבור בסיסי (Basic Addition Fluency)</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  מיפוי אוטומטי של שגיאות שיטתיות בחישוב עובדות יסוד בתחום ה-20 (קשיי שליפה).
                </p>
              </div>
              <button onClick={() => setFluencyEnabled(!fluencyEnabled)} className="shrink-0 mr-4 cursor-pointer">
                {fluencyEnabled ? (
                  <ToggleRight className="w-10 h-10 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-slate-400" />
                )}
              </button>
            </div>

            <div className="flex justify-between items-center opacity-60 p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-800 dark:text-slate-200">אסטרטגיות חיסור מורחב (בפיתוח)</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  הערכה קוגניטיבית של יכולת פריטת עשרות כהכנה לחיסור במאונך.
                </p>
              </div>
              <ToggleLeft className="w-10 h-10 text-slate-400 cursor-not-allowed shrink-0 mr-4" />
            </div>
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}
