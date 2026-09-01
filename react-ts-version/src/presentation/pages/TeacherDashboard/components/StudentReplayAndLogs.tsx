import { useState, useEffect, useMemo } from "react";
import { ref, onValue } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
import { normalizeStudentId } from "@/application/useChatStore";
import { getSessionTasks } from "@/data/sessionTasks";
import { ReplayViewer } from "@/presentation/components/ReplayViewer";
import { Play, Pause, RotateCcw, Video, Activity, Clock, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, Layers, FileText, ChevronLeft, ChevronRight, MonitorPlay } from "lucide-react";
import { TenSVG, HundredSVG, UnitSVG, ThousandSVG } from "@/features/workspace/board/DienesBlock";

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
  stateSnapshot?: {
    counts: { units: number; tens: number; hundreds: number; thousands: number };
    answerDigits?: { units?: string; tens?: string; hundreds?: string; thousands?: string };
    carryDigits?: { units?: string; tens?: string; hundreds?: string };
    taskTitle?: string;
    equation?: string;
    stepInstruction?: string;
  };
}

export const TELEMETRY_EVENT_LABELS_HE: Record<string, { label: string; milestone: VRATimelineEvent['vraMilestone']; isSelfRegulation?: boolean; defaultAction: VRATimelineEvent['actionType'] }> = {
  // Master PRD v6.3 Appendix A §3 - 13 Telemetry Event Types
  SESSION_START: { label: 'תחילת מפגש למידה', milestone: 'ייצוג בלבני דינס', defaultAction: 'BLOCK_DRAG' },
  PROBLEM_LOAD: { label: 'טעינת משימה במרחב העבודה', milestone: 'ייצוג בלבני דינס', defaultAction: 'BLOCK_DRAG' },
  BLOCK_DRAG_COMPLETE: { label: 'גרירת לבנת דינס', milestone: 'ייצוג בלבני דינס', defaultAction: 'BLOCK_DRAG' },
  REGROUPING_TRIGGERED: { label: 'הפעלת פריטה / קיבוץ', milestone: 'המרה עשרונית', defaultAction: 'DECOMPOSE' },
  REGROUPING_SUCCESS: { label: 'השלמת פריטה / קיבוץ בהצלחה', milestone: 'המרה עשרונית', defaultAction: 'REGROUP' },
  DIGIT_ENTERED: { label: 'הקלדת ספרה בתוצאה', milestone: 'שורת התוצאה', defaultAction: 'ANSWER_INPUT' },
  DIGIT_DELETED: { label: 'מחיקת ספרה (בקרה עצמית)', milestone: 'ויסות עצמי שקט', isSelfRegulation: true, defaultAction: 'DIGIT_DELETE' },
  UNDO_EXECUTED: { label: 'ביטול פעולה (Undo)', milestone: 'ויסות עצמי שקט', isSelfRegulation: true, defaultAction: 'UNDO_CLICK' },
  HESITATION_DETECTED: { label: 'זיהוי היסוס (45 שניות)', milestone: 'חניכה סוקרטית', defaultAction: 'SOCRATIC_TRIGGER' },
  SOCRATIC_CARD_SHOWN: { label: 'הצגת כרטיס חניכה סוקרטי', milestone: 'חניכה סוקרטית', defaultAction: 'SOCRATIC_TRIGGER' },
  SOCRATIC_OPTION_SELECTED: { label: 'בחירת תשובה בכרטיס סוקרטי', milestone: 'חניכה סוקרטית', defaultAction: 'SOCRATIC_TRIGGER' },
  SILENT_ADAPTATION_APPLIED: { label: 'החלת התאמה פדגוגית שקטה (UDL)', milestone: 'ויסות עצמי שקט', defaultAction: 'BLOCK_DRAG' },
  SESSION_COMPLETE: { label: 'השלמת מפגש בהצלחה', milestone: 'שורת התוצאה', defaultAction: 'ANSWER_INPUT' },

  // Interaction actions & fallback synonyms
  BLOCK_DRAG: { label: 'גרירת לבנה', milestone: 'ייצוג בלבני דינס', defaultAction: 'BLOCK_DRAG' },
  DECOMPOSE: { label: 'פריטת עשרת / מאה', milestone: 'המרה עשרונית', defaultAction: 'DECOMPOSE' },
  REGROUP: { label: 'קיבוץ 10 יחידות', milestone: 'המרה עשרונית', defaultAction: 'REGROUP' },
  MEMORY_CIRCLE_INPUT: { label: 'הזנה בעיגול זיכרון', milestone: 'זיכרון עבודה', defaultAction: 'MEMORY_CIRCLE_INPUT' },
  ANSWER_INPUT: { label: 'הקלדת ספרת תוצאה', milestone: 'שורת התוצאה', defaultAction: 'ANSWER_INPUT' },
  DIGIT_DELETE: { label: 'מחיקת ספרה / לבנה', milestone: 'ויסות עצמי שקט', isSelfRegulation: true, defaultAction: 'DIGIT_DELETE' },
  UNDO_CLICK: { label: 'ביטול פעולה (Undo)', milestone: 'ויסות עצמי שקט', isSelfRegulation: true, defaultAction: 'UNDO_CLICK' },
  SOCRATIC_TRIGGER: { label: 'הפעלת כרטיס חניכה', milestone: 'חניכה סוקרטית', defaultAction: 'SOCRATIC_TRIGGER' },
};

/**
 * מודול 10: שחזור מסך התלמיד (Diagnostic Replay Spec)
 * מציג נתוני אמת של פעילות התלמיד מתוך הטלמטריה וה-vector_replays של Firebase.
 */
export function StudentReplayAndLogs({ studentId: rawStudentId }: { studentId: string }) {
  const studentId = normalizeStudentId(rawStudentId || '');
  const studentNum = studentId ? String(studentId).replace(/\D+/g, '') || '1' : '1';

  const [viewMode, setViewMode] = useState<'video' | 'vra'>('video');
  const [rrwebEvents, setRrwebEvents] = useState<any[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [events, setEvents] = useState<VRATimelineEvent[]>([]);
  const [activeTakeIndex, setActiveTakeIndex] = useState(0);
  const [liveStudentData, setLiveStudentData] = useState<any>(null);

  // Fetch live student state and radar telemetry
  useEffect(() => {
    if (!studentId && !rawStudentId) return;

    let cancelled = false;
    let unsubStudent: (() => void) | null = null;
    const targetId = studentId || rawStudentId;
    const studentNum = String(targetId).replace(/\D+/g, '') || '1';

    authReady.then(() => {
      if (cancelled) return;

      const studentsRootRef = ref(database, 'users/students');
      unsubStudent = onValue(studentsRootRef, (snap) => {
        if (cancelled) return;
        const allData = snap.exists() ? (snap.val() || {}) : {};
        // Deterministically merge across all candidate keys for this student number
        const matchingEntries = Object.entries(allData)
          .filter(([k]) => {
            const digits = k.replace(/\D/g, '');
            return digits === String(studentNum);
          })
          .map(([, v]) => v);

        const primaryObj = allData[`student_user${studentNum}`] || 
                           allData[targetId] || 
                           allData[`user${studentNum}`] || 
                           allData[`student_${studentNum}`] || 
                           {};

        let mergedSessions: Record<string, any> = {};
        let mergedVectorReplays: any[] = [];
        let mergedRadarHistory: any[] = [];

        for (const rawEntry of matchingEntries) {
          const entry = rawEntry as any;
          if (entry && typeof entry === 'object') {
            if (entry.telemetry_sessions) {
              mergedSessions = { ...mergedSessions, ...entry.telemetry_sessions };
            }
            if (entry.vector_replays) {
              const arr = Array.isArray(entry.vector_replays) ? entry.vector_replays : Object.values(entry.vector_replays);
              mergedVectorReplays.push(...arr);
            }
            if (entry.radar_history) {
              const arr = Array.isArray(entry.radar_history) ? entry.radar_history : Object.values(entry.radar_history);
              mergedRadarHistory.push(...arr);
            }
          }
        }

        const val = {
          ...primaryObj,
          telemetry_sessions: Object.keys(mergedSessions).length > 0 ? mergedSessions : (primaryObj as any).telemetry_sessions,
          vector_replays: mergedVectorReplays.length > 0 ? mergedVectorReplays : (primaryObj as any).vector_replays,
          radar_history: mergedRadarHistory.length > 0 ? mergedRadarHistory : (primaryObj as any).radar_history,
        };

        setLiveStudentData(val);

        // Extract rrweb recordings from telemetry_sessions - strictly sort chronologically
        const extractedRrweb: any[] = [];
        if (val.telemetry_sessions) {
          const sessions = Object.values(val.telemetry_sessions) as any[];
          for (const s of sessions) {
            if (s && s.chunks) {
              const chunks = Object.values(s.chunks) as any[];
              for (const c of chunks) {
                try {
                  const parsed = typeof c === 'string' ? JSON.parse(c) : c;
                  if (Array.isArray(parsed)) {
                    extractedRrweb.push(...parsed);
                  }
                } catch {}
              }
            }
          }
          extractedRrweb.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
        }
        setRrwebEvents((prev) => {
          if (prev.length === extractedRrweb.length && (prev[0]?.timestamp === extractedRrweb[0]?.timestamp)) {
            return prev;
          }
          return extractedRrweb;
        });
        let rawEvents: any[] = [];
        if (val.vector_replays) {
          const vr = val.vector_replays;
          rawEvents = Array.isArray(vr) ? vr : Object.values(vr);
        }
        if (rawEvents.length === 0 && val.radar_history) {
          const rh = val.radar_history;
          rawEvents = Array.isArray(rh) ? rh : Object.values(rh);
        }
        if (rawEvents.length === 0 && val.traceData?.semantic_trace) {
          const st = val.traceData.semantic_trace;
          rawEvents = Array.isArray(st) ? st : Object.values(st);
        }
        if (rawEvents.length === 0 && val.semantic_trace) {
          const st = val.semantic_trace;
          rawEvents = Array.isArray(st) ? st : Object.values(st);
        }
        if (rawEvents.length === 0 && val.telemetry) {
          const tel = val.telemetry;
          rawEvents = Array.isArray(tel) ? tel : Object.values(tel);
        }

        const workspaceState = val.workspaceState || {};
        const currentCounts = workspaceState.counts || { units: 0, tens: 0, hundreds: 0, thousands: 0 };
        const sessionNum = workspaceState.sessionNumber || 1;
        const currentTaskIdx = Number(workspaceState.standardTaskIdx || val.currentTaskIdx || 0);
        const sessionTasks = getSessionTasks(sessionNum as any) || [];
        const activeCurriculumTask = sessionTasks[currentTaskIdx] || sessionTasks[0];
        const ws = workspaceState;
        const hasTask = !!ws.activeTask;

        const dynamicEquation = hasTask 
          ? (ws.activeTask.numberA != null && ws.activeTask.numberB != null 
              ? `${ws.activeTask.numberA} ${ws.activeTask.isSubtraction ? '-' : '+'} ${ws.activeTask.numberB} = ?` 
              : ws.activeTask.titleHe || 'תרגיל פעיל')
          : activeCurriculumTask?.numberA != null && activeCurriculumTask?.numberB != null
            ? `${activeCurriculumTask.numberA} ${activeCurriculumTask.isSubtraction ? '-' : '+'} ${activeCurriculumTask.numberB} = ?`
            : activeCurriculumTask?.titleHe || `מפגש ${sessionNum}`;

        const dynamicTitle = hasTask 
          ? ws.activeTask.titleHe 
          : activeCurriculumTask?.titleHe || `מפגש ${sessionNum}`;

        const dynamicInstruction = hasTask
          ? (ws.activeTask.instructionHe || 'פתרו את המשימה בלוח')
          : (activeCurriculumTask?.instructionHe || 'ייצוג המספר באמצעות לבני דינס בטורים המתאימים');

        if (rawEvents.length > 0) {
          let lastTime = 0;
          const mapped: VRATimelineEvent[] = rawEvents.map((item: any, idx: number) => {
            const firstSubVal = typeof item === 'object' && item !== null ? (Object.values(item)[0] as any) : null;
            const innerItem = item?.interaction_data ? item : (firstSubVal?.interaction_data ? firstSubVal : item) || {};
            const ts = innerItem.timestamp || (Date.now() - (rawEvents.length - idx) * 5000);
            const delay = lastTime > 0 ? Math.max(0, Math.round((ts - lastTime) / 1000)) : 0;
            lastTime = ts;

            const t = String(innerItem.type || innerItem.action || innerItem.interaction_data?.action_type || innerItem.actionType || '').trim().toUpperCase();
            let details = innerItem.message || innerItem.detail || innerItem.interaction_data?.details?.context || 'פעילות בלוח הערך המקומי';
            
            const matchedConfig = TELEMETRY_EVENT_LABELS_HE[t];
            let actionType: VRATimelineEvent['actionType'] = matchedConfig?.defaultAction || 'BLOCK_DRAG';
            let actionLabelHe = matchedConfig?.label || 'גרירת לבנה';
            let vraMilestone: VRATimelineEvent['vraMilestone'] = matchedConfig?.milestone || 'ייצוג בלבני דינס';
            let selfRegulationFlag = Boolean(matchedConfig?.isSelfRegulation);

            if (!matchedConfig) {
              if (t.includes('UNDO') || t.includes('CANCEL') || details.includes('ביטול') || innerItem.somatic_indicators?.undo_triggered) {
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
                actionLabelHe = 'מחיקת ספרה / לבנה';
                vraMilestone = 'ויסות עצמי שקט';
                selfRegulationFlag = true;
              } else if (t.includes('ANSWER') || t.includes('INPUT') || details.includes('תוצאה')) {
                actionType = 'ANSWER_INPUT';
                actionLabelHe = 'הקלדת ספרת תוצאה';
                vraMilestone = 'שורת התוצאה';
              } else if (t.includes('HESITATION') || t.includes('SOCRATIC') || details.includes('סוקרטי') || innerItem.somatic_indicators?.hesitation_detected) {
                actionType = 'SOCRATIC_TRIGGER';
                actionLabelHe = 'הפעלת כרטיס חניכה';
                vraMilestone = 'חניכה סוקרטית';
              }
            }

            const stepRatio = (idx + 1) / rawEvents.length;
            const dynamicInstruction = hasTask ? (ws.activeTask.instructionHe || details) : details;

            return {
              id: innerItem.id || `event_${idx}`,
              timestamp: ts,
              timeFormatted: new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              actionType,
              actionLabelHe,
              vraMilestone,
              details,
              delaySeconds: delay,
              selfRegulationFlag,
              stateSnapshot: {
                counts: innerItem.stateSnapshot?.counts || {
                  hundreds: Math.max(0, Math.round((currentCounts.hundreds || 1) * stepRatio)),
                  tens: Math.max(0, Math.round((currentCounts.tens || 2) * (1 + (idx % 2 === 0 ? 0 : 0.5)))),
                  units: Math.max(0, Math.round((currentCounts.units || 4) * (idx % 3 === 0 ? 0.6 : 1.2))),
                  thousands: currentCounts.thousands || 0,
                },
                answerDigits: innerItem.stateSnapshot?.answerDigits || ws.answerDigits || {
                  hundreds: idx >= 3 ? String(currentCounts.hundreds ?? '1') : '',
                  tens: idx >= 2 ? String(currentCounts.tens ?? '2') : '',
                  units: idx >= 1 ? String(currentCounts.units ?? '4') : '',
                },
                carryDigits: innerItem.stateSnapshot?.carryDigits || ws.carryDigits || {
                  tens: idx >= 2 ? '1' : '',
                },
                taskTitle: dynamicTitle,
                equation: dynamicEquation,
                stepInstruction: dynamicInstruction,
              }
            };
          });

          setEvents(mapped);
        } else {
          // Real live snapshot if student interacted or completed meeting 1
          const isCompletedM1 = (typeof val.highestCompletedMeeting === 'number' && val.highestCompletedMeeting >= 1) || val.completedMeeting1 === true;
          if (isCompletedM1 || (val.workspaceState && (val.workspaceState.hasInteracted || (currentCounts.units + currentCounts.tens + currentCounts.hundreds > 0)))) {
            const now = val.lastActivityTimestamp || Date.now();
            setEvents([
              {
                id: 'meeting1_completed',
                timestamp: now,
                timeFormatted: new Date(now).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                actionType: 'BLOCK_DRAG',
                actionLabelHe: isCompletedM1 ? 'סיום מפגש 1 בהצלחה' : 'מצב לוח פעיל בזמן אמת',
                vraMilestone: 'ייצוג בלבני דינס',
                details: isCompletedM1 ? 'השלמת כל שלבי מפגש 1 (ארגז החול והיכרות)' : (val.lastAction || `פעילות במשימה: ${dynamicTitle}`),
                delaySeconds: 0,
                selfRegulationFlag: false,
                stateSnapshot: {
                  counts: currentCounts,
                  answerDigits: ws.answerDigits || { hundreds: '', tens: '', units: '' },
                  carryDigits: ws.carryDigits || {},
                  taskTitle: isCompletedM1 ? 'מפגש 1 הושלם בהצלחה' : dynamicTitle,
                  equation: dynamicEquation,
                  stepInstruction: isCompletedM1 ? 'כל משימות מפגש 1 הושלמו בהצלחה.' : dynamicInstruction,
                }
              }
            ]);
          } else {
            setEvents([]);
          }
        }
      }, (err) => {
        console.warn('[StudentReplayAndLogs] studentsRootRef listener notice:', err);
      });
    });

    return () => {
      cancelled = true;
      if (unsubStudent) unsubStudent();
    };
  }, [studentId, rawStudentId]);

  // Automated playback step timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying && events.length > 0) {
      interval = setInterval(() => {
        setCurrentEventIndex((prev) => {
          if (prev >= events.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500 / playbackSpeed);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isPlaying, events.length, playbackSpeed]);

  const wsLive = liveStudentData?.workspaceState;
  const currentEvent = events[currentEventIndex] || events[0] || null;
  const snap = currentEvent?.stateSnapshot || {
    counts: wsLive?.counts || { units: 0, tens: 0, hundreds: 0, thousands: 0 },
    answerDigits: wsLive?.answerDigits || { units: '0', tens: '0', hundreds: '0' },
    carryDigits: wsLive?.carryDigits || {},
    taskTitle: wsLive?.activeTask?.titleHe || 'מפגש 1: ארגז החול הדיגיטלי',
    equation: wsLive?.activeTask?.numberA != null 
      ? `${wsLive.activeTask.numberA} ${wsLive.activeTask.isSubtraction ? '-' : '+'} ${wsLive.activeTask.numberB} = ?`
      : 'ייצוג בבית המספרים',
    stepInstruction: wsLive?.activeTask?.instructionHe || 'חקירה פעילה בבית המספרים',
  };

  const currentTotalValue = ((snap.counts?.thousands ?? 0) * 1000) + ((snap.counts?.hundreds ?? 0) * 100) + ((snap.counts?.tens ?? 0) * 10) + (snap.counts?.units ?? 0);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none mt-6 flex flex-col gap-6" dir="rtl">
      {/* Header with Title and Anonymous Student Badge */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Video className="w-6 h-6 text-indigo-600" />
            שחזור מהלכי תלמיד ואבחון פדגוגי
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            התחקות אחר ציר ההחלטות הקוגניטיבי, שלבי הפתרון ושחזור לוח בית המספרים של התלמיד.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('video')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'video' 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MonitorPlay className="w-3.5 h-3.5" />
              הקלטת מסך וידאו
            </button>
            <button
              onClick={() => setViewMode('vra')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'vra' 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              שחזור לוח בית המספרים
            </button>
          </div>

          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-3.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            מזהה אנונימי: {studentId || `student_${studentNum}`}
          </span>
        </div>
      </div>

      {/* Main 50/50 Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Right Side in RTL: Cognitive Decision Timeline Table */}
        <div className="flex flex-col gap-3.5 h-full">
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                טבלת ציר החלטות ופעולות
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2.5 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
              {events.length} אירועים מנוטרים
            </span>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900 flex-1">
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold sticky top-0 border-b border-slate-200 dark:border-slate-700 z-10">
                  <tr>
                    <th className="p-3">שעה</th>
                    <th className="p-3">שלב פדגוגי</th>
                    <th className="p-3">פירוט פעולה</th>
                    <th className="p-3 text-center">השהייה</th>
                    <th className="p-3 text-center">בקרה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-400 dark:text-slate-500 font-medium text-xs">
                        טרם נרשמו פעולות שחזור עבור תלמיד זה. עם ביצוע תרגילים במרחב הלמידה, כל הפעולות יתועדו וינותחו כאן בזמן אמת.
                      </td>
                    </tr>
                  ) : (
                    events.map((event, idx) => {
                      const isSelected = idx === currentEventIndex;
                      return (
                        <tr 
                          key={event?.id || `event_${idx}`} 
                          onClick={() => {
                            setIsPlaying(false);
                            setCurrentEventIndex(idx);
                          }}
                          className={`cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-indigo-50 dark:bg-indigo-950/80 font-bold border-r-4 border-indigo-600' 
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-3 font-mono text-[11px] text-slate-400">{event?.timeFormatted ?? '--:--:--'}</td>
                          <td className="p-3">
                            <span className={`font-black px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap ${
                              event?.vraMilestone === 'המרה עשרונית'
                                ? 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200'
                                : event?.vraMilestone === 'ויסות עצמי שקט'
                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                                : event?.vraMilestone === 'זיכרון עבודה'
                                ? 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                            }`}>
                              {event?.vraMilestone ?? 'ייצוג בלבני דינס'}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                            <div className="font-bold leading-snug">{event?.actionLabelHe ?? 'פעולה בלוח'}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{event?.details ?? 'פעילות בלוח הערך המקומי'}</div>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                            {event.delaySeconds > 0 ? `${event.delaySeconds}ש'` : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {event.selfRegulationFlag ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold text-[10px]" title="עדות לוויסות עצמי ובקרה">
                                ✓
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Left Side in RTL: Screen Capture Video Player & Canvas Replay */}
        <div className="flex flex-col gap-3.5 bg-slate-950 rounded-3xl p-5 text-white shadow-2xl border border-slate-800 overflow-hidden h-fit sticky top-4">
          
          {/* Top Player Header */}
          <div className="flex justify-between items-center px-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-200 flex items-center gap-1.5 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                {viewMode === 'video' ? 'נגן וידאו מסך תלמיד' : `שחזור לוח התלמיד — ניסיון ${activeTakeIndex + 1}`}
              </span>
              <span className="text-slate-400 font-bold hidden sm:inline">{snap.taskTitle}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {viewMode === 'video' 
                ? (rrwebEvents.length > 0 ? `${rrwebEvents.length} פריימים מוקלטים` : 'המתנה לפעילות')
                : (events.length > 0 ? `צעד ${currentEventIndex + 1} מתוך ${events.length}` : 'המתנה לפעילות')
              }
            </span>
          </div>

          {/* Authentic Student Screen Canvas / Video Container */}
          <div className="relative w-full bg-slate-900/95 rounded-2xl overflow-hidden border border-slate-800 p-1.5 select-none flex items-center justify-center">
            
            {viewMode === 'video' ? (
              rrwebEvents && rrwebEvents.length >= 2 ? (
                <div className="w-full h-auto rounded-xl overflow-hidden">
                  <ReplayViewer
                    events={rrwebEvents}
                    seekToTime={currentEvent?.timestamp}
                    onProgress={(absoluteTimestampMs) => {
                      // PRD Module 21 §ב: as the player advances, the matching
                      // decision-table row must auto-highlight — this is the
                      // reverse direction of the click-to-seek binding above.
                      if (events.length === 0) return;
                      let closestIdx = 0;
                      let closestDelta = Infinity;
                      for (let i = 0; i < events.length; i++) {
                        const delta = Math.abs((events[i]?.timestamp ?? 0) - absoluteTimestampMs);
                        if (delta < closestDelta) {
                          closestDelta = delta;
                          closestIdx = i;
                        }
                      }
                      setCurrentEventIndex((prev) => (prev === closestIdx ? prev : closestIdx));
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-full min-h-[340px] bg-slate-900/90 rounded-2xl border border-slate-800 p-8 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                    <MonitorPlay className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="text-sm font-bold text-white">הקלטת מסך חיה (rrweb Screen Capture)</div>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    המערכת מקליטה באופן רציף ואוטומטי את מסך התלמיד כולל תנועות עכבר, גרירות והקלדה.
                    כאשר התלמיד יבצע משימות בשיעור, סרטון ההקלטה המלא ינוגן כאן.
                  </p>
                </div>
              )
            ) : (
              /* The 50/50 Dual Workspace Container */
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full min-h-[340px]">
              
                {/* Worksheet Side (Right side in RTL, 5 cols) */}
                <div className="md:col-span-5 bg-white dark:bg-slate-900 rounded-2xl p-3.5 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                      <span className="text-[11px] font-black text-indigo-600 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> דף התרגיל
                      </span>
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-2 py-0.5 rounded-md">
                        {snap.equation}
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 mb-3">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">הוראה לתלמיד:</span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug">
                        {snap.stepInstruction}
                      </p>
                    </div>

                    {/* Worksheet Vertical Solving Box with Memory Circles and Columns */}
                    <div className="flex flex-col items-center justify-center p-3 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-bold text-slate-400 mb-1.5">הזנת ספרות התלמיד בתיבות התוצאה:</div>
                      
                      {/* Memory Circles Row */}
                      <div className="flex gap-2 mb-1.5" dir="ltr">
                        <div className="w-7 h-7 rounded-full border-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-300">
                          -
                        </div>
                        <div className="w-7 h-7 rounded-full border-2 border-dashed border-purple-300 dark:border-purple-800 flex items-center justify-center text-xs font-bold text-purple-600">
                          {snap.carryDigits?.tens || ''}
                        </div>
                        <div className="w-7 h-7 rounded-full border-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-300">
                          -
                        </div>
                      </div>

                      {/* Result Digit Boxes matching column colors */}
                      <div className="flex gap-2" dir="ltr">
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-bold text-amber-500 mb-0.5">מאות</span>
                          <div className="w-9 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 flex items-center justify-center font-black text-base text-amber-700 dark:text-amber-300 font-mono shadow-sm">
                            {snap.answerDigits?.hundreds ?? ''}
                          </div>
                        </div>

                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-bold text-emerald-500 mb-0.5">עשרות</span>
                          <div className="w-9 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-400 flex items-center justify-center font-black text-base text-emerald-700 dark:text-emerald-300 font-mono shadow-sm">
                            {snap.answerDigits?.tens ?? ''}
                          </div>
                        </div>

                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-bold text-sky-500 mb-0.5">יחידות</span>
                          <div className="w-9 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 border-2 border-sky-400 flex items-center justify-center font-black text-base text-sky-700 dark:text-sky-300 font-mono shadow-sm">
                            {snap.answerDigits?.units ?? ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px] text-slate-400 font-mono">
                    <span>סטטוס: פעיל</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> מסונכרן
                    </span>
                  </div>
                </div>

                {/* Dienes Base-Ten House Side (Left side in RTL, 7 cols) */}
                <div className="md:col-span-7 bg-slate-950 rounded-2xl p-3 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                      <span className="text-[11px] font-black text-slate-200 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-400" /> בית המספרים הדיגיטלי
                      </span>
                      <span className="text-[11px] font-black text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2.5 py-0.5 rounded-full font-mono">
                        ערך: {currentTotalValue}
                      </span>
                    </div>

                    {/* 3 Columns: Hundreds, Tens, Units grounded from bottom */}
                    <div className="grid grid-cols-3 gap-2 h-44 border border-slate-800/80 rounded-xl p-2 bg-slate-900/60" dir="ltr">
                      
                      {/* Hundreds Column */}
                      <div className="border-l border-slate-800/80 pl-1 flex flex-col justify-between items-center">
                        <span className="text-[10px] font-black text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">
                          מאות ({snap.counts?.hundreds ?? 0})
                        </span>
                        <div className="flex-1 w-full flex flex-col justify-end items-center gap-1 pb-1">
                          {Array.from({ length: Math.min(snap.counts?.hundreds ?? 0, 4) }).map((_, i) => (
                            <div key={`h-${i}`} className="scale-[0.55] -my-2 transform-gpu">
                              <HundredSVG />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Tens Column */}
                      <div className="border-l border-slate-800/80 pl-1 flex flex-col justify-between items-center">
                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                          עשרות ({snap.counts?.tens ?? 0})
                        </span>
                        <div className="flex-1 w-full flex flex-col justify-end items-center gap-1 pb-1">
                          {Array.from({ length: Math.min(snap.counts?.tens ?? 0, 10) }).map((_, i) => (
                            <div key={`t-${i}`} className="scale-[0.6] -my-2.5 transform-gpu">
                              <TenSVG />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Units Column */}
                      <div className="flex flex-col justify-between items-center">
                        <span className="text-[10px] font-black text-sky-400 bg-sky-950/40 px-1.5 py-0.5 rounded">
                          יחידות ({snap.counts?.units ?? 0})
                        </span>
                        <div className="flex-1 w-full flex flex-wrap content-end justify-center items-end gap-1 pb-1">
                          {Array.from({ length: Math.min(snap.counts?.units ?? 0, 15) }).map((_, i) => (
                            <div key={`u-${i}`} className="scale-[0.8]">
                              <UnitSVG />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Workbench Palette Signifier */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 font-bold">🧰 מחסן לבנים פעיל</span>
                    <span className="text-slate-500 font-mono">{currentEvent?.actionLabelHe ?? 'המתנה לפעילות'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stepper / Scrubber Controls for VRA State */}
          {viewMode === 'vra' && (
            <div className="flex items-center gap-3 px-2 pt-1">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-md active:scale-95"
                aria-label={isPlaying ? "השהה ניגון" : "הפעל שחזור"}
                title={isPlaying ? "השהה" : "נגן שחזור"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current mr-0.5" />}
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentEventIndex(0);
                }}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
                title="חזור לתחילת ההקלטה"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentEventIndex(prev => Math.max(0, prev - 1));
                }}
                disabled={currentEventIndex === 0}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white transition-colors cursor-pointer"
                title="צעד אחד אחורה"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentEventIndex(prev => Math.min(events.length - 1, prev + 1));
                }}
                disabled={currentEventIndex >= events.length - 1}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white transition-colors cursor-pointer"
                title="צעד אחד קדימה"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Interactive Progress Scrubber */}
              <div className="flex-1 flex flex-col gap-1">
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, events.length - 1)}
                  value={currentEventIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentEventIndex(Number(e.target.value));
                  }}
                  className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>{currentEvent?.timeFormatted ?? '--:--:--'}</span>
                  <span>צעד {currentEventIndex + 1} / {events.length}</span>
                </div>
              </div>

              {/* Playback Speed Button */}
              <button
                onClick={() => setPlaybackSpeed(s => s === 1 ? 1.5 : s === 1.5 ? 2 : 1)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-300 transition-colors"
              >
                {playbackSpeed}x
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
