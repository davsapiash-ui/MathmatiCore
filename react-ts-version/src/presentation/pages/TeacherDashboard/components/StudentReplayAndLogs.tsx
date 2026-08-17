import { useState, useEffect, useMemo } from "react";
import { ref, onValue } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
import { normalizeStudentId } from "@/application/useChatStore";
import { Play, Pause, RotateCcw, Video, Activity, Clock, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

export interface VRATimelineEvent {
  id: string;
  timestamp: number;
  timeFormatted: string;
  actionType: 'BLOCK_DRAG' | 'DECOMPOSE' | 'REGROUP' | 'MEMORY_CIRCLE_INPUT' | 'ANSWER_INPUT' | 'DIGIT_DELETE' | 'UNDO_CLICK' | 'SOCRATIC_TRIGGER';
  actionLabelHe: string;
  vraMilestone: 'ייצוג בלבני דינס' | 'המרה עשרונית' | 'זיכרון עבודה' | 'שורת התוצאה' | 'ויסות עצמי שקט' | 'חניכה סוקרטית';
  details: string;
  delaySeconds: number;
  selfRegulationFlag: boolean;
}

/**
 * מודול 21: ממשק מסך מפוצל לאבחון מורה (Teacher Diagnostic Split Screen View Spec)
 * צד שמאל: נגן וידאו ממוקד של קנבס התלמיד עבור התרגיל הבודד (Take) ללא שמע או מצלמה.
 * צד ימין: טבלה סטטית ופשוטה של ציר ההחלטות הקוגניטיבי (VRA Timeline) הממפה פעולות ל-VRA, זמני השהיה ועדות לוויסות עצמי.
 * סילוק מוחלט של נגן ה-iframe והווקטורים הישן.
 */
export function StudentReplayAndLogs({ studentId: rawStudentId }: { studentId: string }) {
  const studentId = normalizeStudentId(rawStudentId || '');
  const studentNum = studentId ? String(studentId).replace(/\D+/g, '') || '1' : '1';

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [events, setEvents] = useState<VRATimelineEvent[]>([]);
  const [activeTakeIndex, setActiveTakeIndex] = useState(0);

  // Fetch telemetry and convert to VRA Cognitive Decision Timeline
  useEffect(() => {
    if (!studentId && !rawStudentId) return;

    let cancelled = false;
    const targetId = studentId || rawStudentId;

    authReady.then(() => {
      if (cancelled) return;

      const logsRef = ref(database, `users/students/${targetId}/radar_history`);
      const unsub = onValue(logsRef, (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          const list = val ? Object.values(val) : [];

          let lastTime = 0;
          const mapped: VRATimelineEvent[] = list.map((item: any, idx: number) => {
            const ts = item.timestamp || (Date.now() - (list.length - idx) * 5000);
            const delay = lastTime > 0 ? Math.max(0, Math.round((ts - lastTime) / 1000)) : 0;
            lastTime = ts;

            let actionType: VRATimelineEvent['actionType'] = 'BLOCK_DRAG';
            let actionLabelHe = 'גרירת לבנה';
            let vraMilestone: VRATimelineEvent['vraMilestone'] = 'ייצוג בלבני דינס';
            let details = item.message || item.detail || 'פעילות בלוח הערך המקומי';
            let selfRegulationFlag = false;

            const t = String(item.type || item.action || '').toUpperCase();
            if (t.includes('UNDO') || t.includes('CANCEL') || details.includes('ביטול')) {
              actionType = 'UNDO_CLICK';
              actionLabelHe = 'ביטול פעולה (Undo)';
              vraMilestone = 'ויסות עצמי שקט';
              selfRegulationFlag = true;
            } else if (t.includes('DECOMPOSE') || t.includes('UNGROUP') || details.includes('פריטה')) {
              actionType = 'DECOMPOSE';
              actionLabelHe = 'פריטת עשרת / מאה';
              vraMilestone = 'המרה עשרונית';
            } else if (t.includes('REGROUP') || t.includes('GROUP') || details.includes('קיבוץ')) {
              actionType = 'REGROUP';
              actionLabelHe = 'קיבוץ 10 יחידות';
              vraMilestone = 'המרה עשרונית';
            } else if (t.includes('MEMORY') || details.includes('זיכרון')) {
              actionType = 'MEMORY_CIRCLE_INPUT';
              actionLabelHe = 'הזנה בעיגול זיכרון';
              vraMilestone = 'זיכרון עבודה';
            } else if (t.includes('DELETE') || details.includes('מחיקה')) {
              actionType = 'DIGIT_DELETE';
              actionLabelHe = 'מחיקת ספרה';
              vraMilestone = 'ויסות עצמי שקט';
              selfRegulationFlag = true;
            } else if (t.includes('ANSWER') || details.includes('תוצאה')) {
              actionType = 'ANSWER_INPUT';
              actionLabelHe = 'הקלדת ספרת תוצאה';
              vraMilestone = 'שורת התוצאה';
            } else if (t.includes('HESITATION') || t.includes('SOCRATIC') || details.includes('סוקרטי')) {
              actionType = 'SOCRATIC_TRIGGER';
              actionLabelHe = 'הפעלת כרטיס חניכה';
              vraMilestone = 'חניכה סוקרטית';
            }

            return {
              id: item.id || `event_${idx}`,
              timestamp: ts,
              timeFormatted: new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              actionType,
              actionLabelHe,
              vraMilestone,
              details,
              delaySeconds: delay,
              selfRegulationFlag,
            };
          });

          setEvents(mapped);
        } else {
          // Default mock timeline for observation
          const now = Date.now();
          setEvents([
            { id: '1', timestamp: now - 35000, timeFormatted: '10:00:15', actionType: 'BLOCK_DRAG', actionLabelHe: 'גרירת עשרת לטור העשרות', vraMilestone: 'ייצוג בלבני דינס', details: 'הצבת 4 עשרות בטור העשרות', delaySeconds: 3, selfRegulationFlag: false },
            { id: '2', timestamp: now - 28000, timeFormatted: '10:00:22', actionType: 'DECOMPOSE', actionLabelHe: 'פריטת מאה ל-10 עשרות', vraMilestone: 'המרה עשרונית', details: 'לחיצה על לבנת 100 לפריטה עשרונית', delaySeconds: 7, selfRegulationFlag: false },
            { id: '3', timestamp: now - 20000, timeFormatted: '10:00:30', actionType: 'MEMORY_CIRCLE_INPUT', actionLabelHe: 'הזנת 1 בעיגול הזיכרון', vraMilestone: 'זיכרון עבודה', details: 'הזנת שארית עשרת לטור העשרות', delaySeconds: 8, selfRegulationFlag: false },
            { id: '4', timestamp: now - 12000, timeFormatted: '10:00:38', actionType: 'UNDO_CLICK', actionLabelHe: 'ביטול פעולה (Undo)', vraMilestone: 'ויסות עצמי שקט', details: 'לחיצה על כפתור 48x48px לתיקון עצמי', delaySeconds: 8, selfRegulationFlag: true },
            { id: '5', timestamp: now - 4000, timeFormatted: '10:00:46', actionType: 'ANSWER_INPUT', actionLabelHe: 'הקלדת ספרת התוצאה 6', vraMilestone: 'שורת התוצאה', details: 'הזנת תוצאה מוצלחת בטור היחידות', delaySeconds: 8, selfRegulationFlag: false },
          ]);
        }
      });

      return () => unsub();
    });

    return () => { cancelled = true; };
  }, [studentId, rawStudentId]);

  // Video progress timer simulation
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 2 * playbackSpeed;
        });
      }, 200);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isPlaying, playbackSpeed]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none mt-6 flex flex-col gap-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Video className="w-6 h-6 text-indigo-600" />
            ממשק אבחון מסך מפוצל (Diagnostic Split Screen)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            תצוגה מפוצלת: צילום מסך ממוקד של קנבס העבודה (שמאל) לצד טבלת ציר החלטות קוגניטיבי (ימין) עבור תלמיד {studentNum}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono">
            מזהה אנונימי: {studentId || `student_${studentNum}`}
          </span>
        </div>
      </div>

      {/* Split Screen 50/50 Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Standard Video Player Component (60% on desktop) */}
        <div className="lg:col-span-6 flex flex-col gap-3 bg-slate-950 rounded-3xl p-4 text-white shadow-2xl border border-slate-800">
          <div className="flex justify-between items-center px-2 pt-1 text-xs">
            <span className="font-extrabold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              הקלטת קנבס לוח הדינס (Take {activeTakeIndex + 1})
            </span>
            <span className="text-[11px] text-slate-400 font-mono">ללא שמע / ללא מצלמה (פרטיות מלאה)</span>
          </div>

          {/* Video Canvas Box */}
          <div className="relative aspect-video w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
            {/* Visual Digital Canvas Representation */}
            <div className="absolute inset-0 bg-slate-900 p-6 flex flex-col justify-between select-none">
              <div className="grid grid-cols-3 gap-2 h-3/4 border border-slate-800 rounded-xl p-3 bg-slate-950/60">
                <div className="border-r border-slate-800 pr-2 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400 font-bold mb-1">מאות</span>
                  <div className="w-12 h-12 bg-amber-400/80 rounded-lg shadow flex items-center justify-center text-slate-950 font-black text-xs">100</div>
                </div>
                <div className="border-r border-slate-800 pr-2 flex flex-col items-center justify-center gap-1">
                  <span className="text-[10px] text-slate-400 font-bold mb-1">עשרות</span>
                  <div className="w-3 h-10 bg-amber-500 rounded shadow" />
                  <div className="w-3 h-10 bg-amber-500 rounded shadow" />
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <span className="text-[10px] text-slate-400 font-bold mb-1">יחידות</span>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="w-3 h-3 bg-amber-400 rounded-sm" />
                    <div className="w-3 h-3 bg-amber-400 rounded-sm" />
                    <div className="w-3 h-3 bg-amber-400 rounded-sm" />
                  </div>
                </div>
              </div>

              {/* Progress Line */}
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                <span>זמן ריצה: 00:{Math.floor((currentProgress / 100) * 45).toString().padStart(2, '0')}</span>
                <span>משימה פעילה: חיבור אנכי עם המרה</span>
              </div>
            </div>

            {/* Play/Pause Overlay Button */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="relative z-10 w-14 h-14 rounded-full bg-indigo-600/90 hover:bg-indigo-600 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer backdrop-blur-sm"
              aria-label={isPlaying ? "השהה וידאו" : "נגן וידאו"}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current mr-0.5" />}
            </button>
          </div>

          {/* Video Control Bar */}
          <div className="flex items-center gap-3 px-2 pt-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setCurrentProgress(0)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Progress Slider */}
            <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden cursor-pointer">
              <div 
                className="bg-indigo-500 h-full transition-all duration-150"
                style={{ width: `${currentProgress}%` }}
              />
            </div>

            {/* Playback Speed */}
            <button
              onClick={() => setPlaybackSpeed(s => s === 1 ? 1.5 : s === 1.5 ? 2 : 1)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-bold text-slate-300 transition-colors"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>

        {/* Right Side: Static VRA Cognitive Decision Timeline Table (60% on desktop) */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              ציר החלטות קוגניטיבי (VRA Cognitive Timeline)
            </h3>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {events.length} פעולות מתועדות
            </span>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="max-h-[380px] overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-extrabold sticky top-0 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">שעה</th>
                    <th className="p-3">שלב VRA</th>
                    <th className="p-3">פעולה שבוצעה</th>
                    <th className="p-3 text-center">השהייה</th>
                    <th className="p-3 text-center">ויסות עצמי</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono text-[11px] text-slate-400">{event.timeFormatted}</td>
                      <td className="p-3">
                        <span className={`font-black px-2 py-0.5 rounded-md text-[10px] ${
                          event.vraMilestone === 'המרה עשרונית'
                            ? 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200'
                            : event.vraMilestone === 'ויסות עצמי שקט'
                            ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                            : event.vraMilestone === 'זיכרון עבודה'
                            ? 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}>
                          {event.vraMilestone}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                        <div className="font-bold">{event.actionLabelHe}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{event.details}</div>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                        {event.delaySeconds > 0 ? `${event.delaySeconds}ש'` : '-'}
                      </td>
                      <td className="p-3 text-center">
                        {event.selfRegulationFlag ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold text-[10px]" title="עדות לבקרה וויסות עצמי">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
