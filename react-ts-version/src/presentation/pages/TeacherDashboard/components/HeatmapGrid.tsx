import { useState, useEffect, useMemo } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { normalizeStudentId } from '@/application/useChatStore';
import { toast } from 'sonner';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Lock, 
  ShieldAlert, 
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type RadarStatusColor = 'RED' | 'GREY' | 'YELLOW' | 'GREEN';

export function computeStudentRadarColor(
  student: any | undefined,
  now = Date.now(),
  presenceTimeoutMs = 15000
): { color: RadarStatusColor; statusText: string; isOnline: boolean } {
  if (!student) {
    return { color: 'GREY', statusText: 'טרם החל', isOnline: false };
  }

  const lastActivity = student.lastActivityTimestamp || student.lastPing || 0;
  if (lastActivity === 0) {
    return { color: 'GREY', statusText: 'טרם החל', isOnline: false };
  }

  const isOnline = now - lastActivity <= presenceTimeoutMs;

  const errors = student.consecutiveErrors || student.errorCount || 0;
  const hesitation = student.hesitationSeconds || student.hesitation_seconds || 0;
  const isHelpActive = Boolean(student.hasRequestedBasicHelp || student.scaffoldLevel);
  const isPassiveDrifting = Boolean(student.isPassiveDrifting || student.passive_drifting);

  // Strict priority order: RED > GREY > YELLOW > GREEN
  // 1. RED: Severe cognitive difficulty, passive drifting, or consecutive errors >= 3
  if (errors >= 3 || isPassiveDrifting || student.hasActiveFriction) {
    return {
      color: 'RED',
      statusText: errors >= 3 ? `${errors} שגיאות רצופות` : 'קושי קוגניטיבי ממושך',
      isOnline,
    };
  }

  // 2. GREY: Offline / disconnected (>15s presence timeout)
  if (!isOnline) {
    return {
      color: 'GREY',
      statusText: 'לא מחובר (מעל 15 שנ׳)',
      isOnline: false,
    };
  }

  // 3. YELLOW: Hesitation (>30s) or active scaffolding/help
  if (hesitation >= 30 || isHelpActive) {
    return {
      color: 'YELLOW',
      statusText: hesitation >= 30 ? `היסוס (${hesitation} שניות)` : 'נעזר בפיגום פדגוגי',
      isOnline: true,
    };
  }

  // 4. GREEN: On track / solving normally
  return {
    color: 'GREEN',
    statusText: 'התקדמות תקינה',
    isOnline: true,
  };
}

export interface AnonymousStudent {
  id: string; // e.g. "student_1"
  studentNumber: number; // 1-12
  displayName: string; // "תלמיד 1"
  sessionNumber: number; // 1-8
  currentPath: 'ירוק' | 'צמצום פערים';
  status: 'active' | 'locked' | 'completed';
  hesitationSeconds: number;
  errorCount: number;
  physicalOverride: boolean; // VRA virtual support override
  isStruggling: boolean;
  isSocraticActive: boolean;
  lastAction?: string;
  isOnline?: boolean;
}

export interface LiveFeedItem {
  id: string;
  studentId: string;
  studentName: string;
  timestamp: number;
  message: string;
  severity: 'info' | 'warning' | 'alert';
}

// Fixed 12-slot pilot structure (1 to 12) strictly without layout shifts
const INITIAL_MOCK_STUDENTS: AnonymousStudent[] = Array.from({ length: 12 }, (_, index) => {
  const studentNum = index + 1;
  return {
    id: `student_${studentNum}`,
    studentNumber: studentNum,
    displayName: `תלמיד ${studentNum}`,
    sessionNumber: 1,
    currentPath: 'ירוק',
    status: 'active' as const,
    hesitationSeconds: 0,
    errorCount: 0,
    physicalOverride: false,
    isStruggling: false,
    isSocraticActive: false,
    lastAction: '',
    isOnline: false,
  };
});

const INITIAL_MOCK_FEED: LiveFeedItem[] = [];

interface HeatmapGridProps {
  /** Called when teacher clicks Drill Down — parent opens full StudentSideDrawer */
  onDrillDown?: (studentId: string) => void;
}

/**
 * מודול 18: רדאר פדגוגי שקט (Silent Radar Module Spec)
 * רשת קבועה 3x4 עבור 12 תלמידי הפיילוט (מזהים 1-12 בלבד, אפס שמות/תמונות/ראשי תיבות).
 * צבעי רקע בזמן אמת עם מסנן 1000ms:
 * - ירוק: פעילות תקינה ורציפה
 * - צהוב: היסוס מעל 45 שניות בטור הפעיל
 * - אדום: כרטיס חניכה סוקרטי פעיל
 * - אפור: מנותק / לא החל
 */
export function HeatmapGrid({ onDrillDown }: HeatmapGridProps = {}) {
  const [students, setStudents] = useState<AnonymousStudent[]>(INITIAL_MOCK_STUDENTS);
  const [feedItems, setFeedItems] = useState<LiveFeedItem[]>(INITIAL_MOCK_FEED);
  const [selectedStudent, setSelectedStudent] = useState<AnonymousStudent | null>(null);

  // Filter state for Heatmap
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'STRUGGLING' | 'LOCKED' | 'PHYSICAL_OVERRIDE'>('ALL');

  // Subscribe to live Firebase data and merge with 12 pilot student slots (sorted strictly by student ID 1..12)
  useEffect(() => {
    let throttleTimeout: NodeJS.Timeout | null = null;
    let pendingData: any = null;

    const flushThrottledData = () => {
      if (!pendingData) return;
      const rawData = pendingData;
      pendingData = null;

      setStudents((prev) => {
        const updated = [...prev];
        const now = Date.now();
        
        for (let i = 0; i < 12; i++) {
          const studentNum = i + 1;
          const uid = `student_${studentNum}`;
          const data = rawData[uid] || rawData[`slot_${studentNum}`] || rawData[`student_user${studentNum}`] || {};
          
          // Presence heartbeat check (resilient 60-second window per PRD Module 18)
          const lastPing = Number(data.lastPing || data.lastActivityTimestamp || data.lastActive || 0);
          const isOnline = Boolean(data.isOnline) && (lastPing > 0 ? (now - lastPing <= 60000) : Boolean(data.isOnline));

          const wsState = data.workspaceState || {};
          const sessionState = data.sessionState || {};
          const hesitationEvents = Math.max(
            wsState.hesitationCount || 0,
            data.traceData?.hesitation_events || 0,
            data.radar?.hesitations || 0
          );
          const hesitationSeconds = isOnline && hesitationEvents ? hesitationEvents * 45 : (sessionState.hesitation_seconds || 0);
          const errorCount = isOnline ? Math.max(wsState.undoCount || 0, data.traceData?.undo_clicks || 0, sessionState.error_count || 0) : 0;
          const isYellowPath = data.routeRecommendation === 'YELLOW' || sessionState.current_path === 'remediation_path';
          const physicalOverride = Boolean(data.physicalOverrideActive || data.physicalOverride || sessionState.physical_override || data.enhanced_support_profile);

          const isSocraticActive = isOnline && (wsState.helpState === 'socratic' || data.isSocraticActive === true || data.helpRequested === true);
          const isStruggling = isOnline && (hesitationSeconds >= 45 || isYellowPath || errorCount > 2 || physicalOverride || isSocraticActive);

          const rawSessionNum = wsState.sessionNumber || sessionState.session_number || (data.highestCompletedMeeting ? data.highestCompletedMeeting + 1 : 1);
          const sessionNumber = Math.min(8, Math.max(1, Number(rawSessionNum) || 1));

          updated[i] = {
            id: uid,
            studentNumber: studentNum,
            displayName: `תלמיד ${studentNum}`,
            sessionNumber,
            currentPath: isYellowPath ? 'צמצום פערים' : 'ירוק',
            status: wsState.flowStatus === 'sessionDone' ? 'completed' : (data.isBoardLocked || sessionState.status === 'locked') ? 'locked' : 'active',
            hesitationSeconds,
            errorCount,
            physicalOverride,
            isStruggling,
            isSocraticActive,
            lastAction: isOnline ? (data.lastAction || (isSocraticActive ? 'כרטיס חניכה סוקרטי פעיל' : hesitationSeconds >= 45 ? 'היסוס מעל 45 שניות בטור הפעיל' : 'פעיל בלמידה עצמאית')) : 'לא מחובר',
            isOnline: isOnline,
          };
        }
        return updated;
      });
    };

    const studentsRef = ref(database, 'users/students');
    const unsubStudents = onValue(
      studentsRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        pendingData = snapshot.val() || {};

        if (!throttleTimeout) {
          throttleTimeout = setTimeout(() => {
            throttleTimeout = null;
            flushThrottledData();
          }, 1000);
        }
      },
      (err) => {
        console.warn('[HeatmapGrid] students listener notice:', err);
      }
    );

    const alertsRef = ref(database, 'radar_alerts');
    const unsubAlerts = onValue(
      alertsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setFeedItems([]);
          return;
        }
        const rawAlerts = snapshot.val() || {};
        const sixtyMinsAgo = Date.now() - 60 * 60 * 1000;
        const newItems: LiveFeedItem[] = Object.entries(rawAlerts)
          .map(([key, val]: [string, any]) => ({
            id: key,
            studentId: val.studentId || val.rawStudentId || 'student_1',
            studentName: `תלמיד ${val.studentId ? String(val.studentId).replace(/\D+/g, '') || '1' : '1'}`,
            timestamp: val.timestamp || Date.now(),
            message: val.type === 'HESITATION' ? 'השהייה מעל 45 שניות בטור הפעיל' : val.type === 'PASSIVE_DRIFTING' ? 'זיהוי מחיקות או ביטולים רצופים' : val.message || 'התראת רדאר שקטה בזמן אמת',
            severity: (val.type === 'TAB_ESCAPE' || val.type === 'PASSIVE_DRIFTING' || val.type === 'CALL_FOR_HELP' ? 'alert' : val.type === 'HESITATION' ? 'warning' : 'info') as 'info' | 'warning' | 'alert',
          }))
          .filter((item) => item.timestamp > sixtyMinsAgo)
          .sort((a, b) => b.timestamp - a.timestamp);

        setFeedItems(newItems.slice(0, 15));
      },
      (err) => {
        console.warn('[HeatmapGrid] alerts listener notice:', err);
      }
    );

    return () => {
      unsubStudents();
      unsubAlerts();
    };
  }, []);

  const handleTogglePhysicalOverride = async (student: AnonymousStudent) => {
    const updatedStatus = student.status === 'locked' ? 'active' : student.status;
    const newOverrideState = !student.physicalOverride;

    // Update local grid state
    setStudents((prev) =>
      prev.map((s) =>
        s.id === student.id
          ? {
              ...s,
              physicalOverride: newOverrideState,
              status: updatedStatus,
              isStruggling: newOverrideState || s.hesitationSeconds >= 45 || s.errorCount > 2,
            }
          : s
      )
    );

    if (selectedStudent && selectedStudent.id === student.id) {
      setSelectedStudent({
        ...selectedStudent,
        physicalOverride: newOverrideState,
        status: updatedStatus,
      });
    }

    // Persist to Firebase
    try {
      const normId = normalizeStudentId(student.id);
      const studentPayload = {
        physicalOverride: newOverrideState,
        physicalOverrideActive: newOverrideState,
        isBoardLocked: false,
      };
      await update(ref(database, `users/students/${student.id}`), studentPayload);
      if (normId !== student.id) {
        await update(ref(database, `users/students/${normId}`), studentPayload).catch((err) => {
          console.warn('Mirror to normalized studentId notice:', err);
        });
      }
    } catch (e) {
      console.error('Failed to sync VRA support override to Firebase:', e);
      toast.error('שגיאה בעדכון עקיפת תמיכה לתלמיד בשרת.');
    }
  };

  const getPedagogicalRecommendations = (student: AnonymousStudent) => {
    if (student.physicalOverride) {
      return {
        category: 'תמיכת VRA דיגיטלית / עקיפת מורה מודרכת',
        questions: [
          'מה הפעולה שהתלמיד מנסה לבצע בלבני הדינס הווירטואליות?',
          'האם נדרשת הכוונה נוספת להמחשת עקרון ההמרה העשרונית?',
          'כיצד לחבר בין הייצוג הווירטואלי בלוח לרישום המספרי המופשט?'
        ]
      };
    }
    if (student.errorCount >= 3 || student.lastAction?.includes('ללא פריטה')) {
      return {
        category: 'קושי בפריטה והמרה עשרונית',
        questions: [
          'איך אפשר לייצג את המספר בצורה נוספת באמצעות עשרות ויחידות?',
          'מה קורה כאשר מגיעים ל-10 יחידות בעמודת היחידות בבית המספרים?',
          'מדוע נדרש לפרוט עשרת אחת לפני שניתן לחסר מתוך עמודת היחידות?'
        ]
      };
    }
    if (student.hesitationSeconds >= 45) {
      return {
        category: 'עומס קוגניטיבי / השהייה מעל 45 שניות',
        questions: [
          'איזה צעד ראשון שקלת לבצע? מה גורם לך להתלבט בטור הפעיל?',
          'איזה כלי עזר בלוח בית המספרים יכול לעזור לך להתחיל?',
          'האם תרצה שנבדוק יחד דוגמה פשוטה יותר במספרים קטנים?'
        ]
      };
    }
    if (student.currentPath === 'צמצום פערים') {
      return {
        category: 'מסלול צמצום פערים - חיזוק תפיסת המבנה',
        questions: [
          'מה מייצגת כל ספרה במספר הזה לפי עמודת הערך המקומי שלה?',
          'מה תפקיד הספרה 0 במספר? מה ישתנה אם נשמיט אותה?',
          'איך ניתן לבדוק את התוצאה שקיבלת באמצעות חישוב הפוך?'
        ]
      };
    }
    return {
      category: 'שיח פדגוגי מעמיק (מסלול ירוק)',
      questions: [
        'איזו אסטרטגיה בחרת לפתרון הבעיה ומדוע היא יעילה בעיניך?',
        'האם קיימת דרך נוספת להגיע לאותה התוצאה?',
        'איך תוכל להסביר את תהליך הפתרון לחבר בכיתה?'
      ]
    };
  };

  // Counts
  const strugglingCount = useMemo(() => students.filter(s => s.isStruggling).length, [students]);
  const lockedCount = useMemo(() => students.filter(s => s.status === 'locked').length, [students]);
  const physicalOverrideCount = useMemo(() => students.filter(s => s.physicalOverride).length, [students]);

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* Module 18: Clean Header & Legend for Silent Radar Matrix */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>רדאר פדגוגי שקט (Silent Radar)</span>
            <span className="text-xs bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800 px-2.5 py-0.5 rounded-full font-bold">
              12 תלמידים
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            גריד 3×4 קבוע ואנונימי. עדכוני צבע בלבד ללא הפרעה לתלמיד. לחץ על משבצת לצפייה בלוח ובפעולות.
          </p>
        </div>

        {/* 4-Color Status Legend per PRD Module 18 */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-2xl border border-slate-200/60 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" />
            <span>תקין</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-400 shadow-sm" />
            <span>היסוס (45 שנ׳)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 shadow-sm animate-pulse" />
            <span>כרטיס סוקרטי</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600 shadow-sm" />
            <span>מנותק</span>
          </div>
        </div>
      </section>

      {/* Fixed 12-Slot CSS Grid (3x4) Without Layout Reflows */}
      <section className="w-full">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 max-w-4xl mx-auto w-full">
          {students.map((student) => {
            return (
              <button
                key={student.id}
                onClick={() => setSelectedStudent(student)}
                className={`p-4 rounded-2xl border text-right transition-colors duration-500 ease-in-out flex flex-col justify-between min-h-[115px] relative overflow-hidden shadow-sm hover:shadow-md cursor-pointer ${
                  student.isSocraticActive
                    ? 'bg-rose-500/20 border-2 border-rose-500 text-rose-950 dark:text-rose-100'
                    : !student.isOnline
                    ? 'bg-slate-100 dark:bg-slate-800/60 border-2 border-slate-300 dark:border-slate-700 text-slate-500'
                    : student.hesitationSeconds >= 45
                    ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-950 dark:text-amber-100'
                    : 'bg-emerald-500/15 border-2 border-emerald-500 text-emerald-950 dark:text-emerald-100'
                }`}
              >
                {/* Top Badge Row */}
                <div className="flex justify-between items-start w-full">
                  <span className="font-black text-xs tracking-tight text-slate-900 dark:text-slate-100">
                    תלמיד {student.studentNumber}
                  </span>
                  
                  {/* Status Icon - Deterministic Precedence: RED > GREY > YELLOW > GREEN */}
                  {student.isSocraticActive ? (
                    <span className="inline-flex items-center gap-1 bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm animate-pulse" title="חניכה סוקרטית פעילה">
                      <ShieldAlert className="w-3 h-3" />
                      סוקרטי
                    </span>
                  ) : !student.isOnline ? (
                    <span className="inline-flex items-center gap-1 bg-slate-400 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm" title="לא מחובר">
                      מנותק
                    </span>
                  ) : student.hesitationSeconds >= 45 ? (
                    <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm" title="היסוס > 45 שניות">
                      <AlertTriangle className="w-3 h-3" />
                      היסוס
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm" title="פעיל ותקין">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      פעיל
                    </span>
                  )}
                </div>

                {!student.isOnline ? (
                  <div className="flex flex-col justify-center items-center py-3 text-slate-400 dark:text-slate-500">
                    <span className="text-xs font-semibold">לא מחובר כעת</span>
                  </div>
                ) : (
                  <>
                    {/* Session & Path Info */}
                    <div className="flex flex-col gap-1 my-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span>מפגש {student.sessionNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${student.currentPath === 'צמצום פערים' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>
                          {student.currentPath}
                        </span>
                      </div>

                      {student.physicalOverride && (
                        <span className="text-[10px] bg-purple-600 text-white font-black px-2 py-0.5 rounded-md text-center shadow-sm">
                          תמיכת VRA פעילה
                        </span>
                      )}
                    </div>

                    {/* Real-Time Trace Metrics */}
                    <div className="text-[10px] text-slate-600 dark:text-slate-300 flex justify-between items-center pt-1 border-t border-slate-200/60 dark:border-slate-800 font-mono font-bold">
                      <span>השהייה: {student.hesitationSeconds}ש'</span>
                      <span>ביטולים: {student.errorCount}</span>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Drill-Down View / Student Detail Drawer */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-end">
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl p-6 md:p-8 overflow-y-auto flex flex-col justify-between border-r border-slate-200 dark:border-slate-800" 
              dir="rtl"
            >
              <div>
                <div className="flex justify-between items-center pb-4 mb-6 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-lg flex items-center justify-center shadow-lg shadow-indigo-500/25">
                      {selectedStudent.displayName.replace('תלמיד ', '')}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                        {selectedStudent.displayName}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        מזהה מערכת: {selectedStudent.id}
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedStudent(null)}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white font-bold"
                  >
                    ✕ סגירה
                  </button>
                </div>

                {/* State Badges */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-xs text-slate-500 font-bold block mb-1">מסלול למידה נוכחי</span>
                    <span className={`text-base font-extrabold ${selectedStudent.currentPath === 'צמצום פערים' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {selectedStudent.currentPath}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-xs text-slate-500 font-bold block mb-1">התקדמות ברצף המפגשים</span>
                    <span className="text-base font-extrabold text-indigo-600">
                      מפגש {selectedStudent.sessionNumber} מתוך 8
                    </span>
                  </div>
                </div>

                {/* Pedagogical Recommendations */}
                {(() => {
                  const rec = getPedagogicalRecommendations(selectedStudent);
                  return (
                    <div className="p-5 rounded-2xl bg-indigo-50/70 dark:bg-slate-800/80 border border-indigo-100 dark:border-slate-700 mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">💡</span>
                        <h4 className="font-extrabold text-sm text-indigo-950 dark:text-indigo-200">
                          {rec.category}
                        </h4>
                      </div>
                      <ul className="flex flex-col gap-2">
                        {rec.questions.map((q, i) => (
                          <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                            <span className="text-indigo-500 font-bold">•</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {/* VRA Support Override Toggle */}
                <div className="p-5 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 mb-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-black text-sm text-purple-950 dark:text-purple-200">
                        תמיכת VRA דיגיטלית (Digital Manipulatives Override)
                      </h4>
                      <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                        מאפשר פתיחת לבני דינס וירטואליות וסיוע ויזואלי מוגבר לתלמיד
                      </p>
                    </div>
                    <button
                      onClick={() => handleTogglePhysicalOverride(selectedStudent)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md ${
                        selectedStudent.physicalOverride
                          ? 'bg-purple-600 text-white shadow-purple-600/30 hover:bg-purple-700'
                          : 'bg-white text-purple-700 border-2 border-purple-300 hover:bg-purple-50'
                      }`}
                    >
                      {selectedStudent.physicalOverride ? 'פעיל (בטל)' : 'הפעל תמיכה'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex gap-3">
                {onDrillDown && (
                  <button
                    onClick={() => {
                      const sid = selectedStudent.id;
                      setSelectedStudent(null);
                      onDrillDown(sid);
                    }}
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-md hover:bg-indigo-700 transition-all text-center"
                  >
                    מעבר לניתוח מעמיק (Drill Down)
                  </button>
                )}
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="py-3 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 transition-all"
                >
                  סגירה
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
