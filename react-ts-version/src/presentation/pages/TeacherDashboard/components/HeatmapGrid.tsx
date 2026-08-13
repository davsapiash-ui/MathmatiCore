import { useState, useEffect, useMemo } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  ShieldAlert, 
  Sparkles,
  UserCheck,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface AnonymousStudent {
  id: string; // e.g. "student_1"
  displayName: string; // "תלמיד 1"
  sessionNumber: number; // 1-8
  currentPath: 'ירוק' | 'צמצום פערים';
  status: 'active' | 'locked' | 'completed';
  hesitationSeconds: number;
  errorCount: number;
  physicalOverride: boolean;
  isStruggling: boolean;
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

const INITIAL_MOCK_STUDENTS: AnonymousStudent[] = Array.from({ length: 35 }, (_, index) => {
  const studentNum = index + 1;
  return {
    id: `slot_${studentNum}`,
    displayName: `מושב ${studentNum}`,
    sessionNumber: 0,
    currentPath: 'ירוק',
    status: 'active' as const,
    hesitationSeconds: 0,
    errorCount: 0,
    physicalOverride: false,
    isStruggling: false,
    lastAction: '',
    isOnline: false,
  };
});

const INITIAL_MOCK_FEED: LiveFeedItem[] = [];

interface HeatmapGridProps {
  /** Called when teacher clicks Drill Down — parent opens full StudentSideDrawer */
  onDrillDown?: (studentId: string) => void;
}

export function HeatmapGrid({ onDrillDown }: HeatmapGridProps = {}) {
  const [students, setStudents] = useState<AnonymousStudent[]>(INITIAL_MOCK_STUDENTS);
  const [feedItems, setFeedItems] = useState<LiveFeedItem[]>(INITIAL_MOCK_FEED);
  const [selectedStudent, setSelectedStudent] = useState<AnonymousStudent | null>(null);

  // Filter state for Heatmap
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'STRUGGLING' | 'LOCKED' | 'PHYSICAL_OVERRIDE'>('ALL');

  // Subscribe to live Firebase data and merge with 35 student slots
  useEffect(() => {
    const studentsRef = ref(database, 'users/students');
    const unsubStudents = onValue(studentsRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const rawData = snapshot.val() || {};

      setStudents((prev) => {
        const updated = [...prev];
        const entries = Object.entries(rawData);

        entries.forEach(([uid, data]: [string, any], idx) => {
          if (idx >= 35) return;
          const slotIndex = idx;
          const studentNum = slotIndex + 1;

          const wsState = data.workspaceState || {};
          const sessionState = data.sessionState || {};
          const hesitationEvents = Math.max(
            wsState.hesitationCount || 0,
            data.traceData?.hesitation_events || 0,
            data.radar?.hesitations || 0
          );
          const hesitationSeconds = hesitationEvents ? hesitationEvents * 30 : (sessionState.hesitation_seconds || 0);
          const errorCount = Math.max(wsState.undoCount || 0, data.traceData?.undo_clicks || 0, sessionState.error_count || 0);
          const isYellowPath = data.routeRecommendation === 'YELLOW' || sessionState.current_path === 'gap_reduction';
          const physicalOverride = data.physicalOverride || sessionState.physical_override || false;

          const hasCalledForHelp = !!(data.helpRequested || data.handRaised || data.isStruggling);
          const isStruggling = hesitationSeconds >= 30 || isYellowPath || errorCount > 2 || physicalOverride || hasCalledForHelp;

          updated[slotIndex] = {
            id: uid,
            displayName: data.name || `תלמיד ${studentNum}`,
            sessionNumber: wsState.sessionNumber || sessionState.session_number || ((studentNum % 8) + 1),
            currentPath: isYellowPath ? 'צמצום פערים' : 'ירוק',
            status: wsState.flowStatus === 'sessionDone' ? 'completed' : (data.isBoardLocked || sessionState.status === 'locked') ? 'locked' : 'active',
            hesitationSeconds,
            errorCount,
            physicalOverride,
            isStruggling,
            lastAction: data.lastAction || (isStruggling ? 'מאבק קוגניטיבי נותח על ידי הרדאר' : 'פעיל במשימה נוכחית'),
            isOnline: data.isOnline !== false,
          };
        });
        return updated;
      });
    });

    const alertsRef = ref(database, 'radar_alerts');
    const unsubAlerts = onValue(alertsRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const rawAlerts = snapshot.val() || {};
      const newItems: LiveFeedItem[] = Object.entries(rawAlerts).map(([key, val]: [string, any]) => ({
        id: key,
        studentId: val.studentId || val.rawStudentId || 'student_1',
        studentName: val.studentName || val.studentId || 'תלמיד',
        timestamp: val.timestamp || Date.now(),
        message: val.type === 'HESITATION' ? 'השהייה מעל 30 שניות בלוח העזרים' : val.type === 'PASSIVE_DRIFTING' ? 'ביצע ביטולים מרובים רצופים' : val.message || 'התראת רדאר בזמן אמת',
        severity: (val.type === 'TAB_ESCAPE' || val.type === 'PASSIVE_DRIFTING' ? 'alert' : 'warning') as "alert" | "warning",
      })).reverse();

      if (newItems.length > 0) {
        setFeedItems((prev) => {
          const combined = [...newItems, ...prev];
          const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
          return unique.slice(0, 15);
        });
      }
    });

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
              isStruggling: newOverrideState || s.hesitationSeconds >= 30 || s.errorCount > 2,
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
      const updates: Record<string, any> = {};
      updates[`users/students/${student.id}/physicalOverride`] = newOverrideState;
      updates[`users/students/${student.id}/isBoardLocked`] = false;
      updates[`sessions/${student.id}/physical_override`] = newOverrideState;
      updates[`sessions/${student.id}/status`] = updatedStatus;
      await update(ref(database), updates);
    } catch (e) {
      console.error('Failed to sync physical override to Firebase:', e);
    }
  };

  const getPedagogicalRecommendations = (student: AnonymousStudent) => {
    if (student.physicalOverride) {
      return {
        category: 'תיווך פיזי / עקיפה ידנית פעילה',
        questions: [
          'מה הצעד שהתלמיד מנסה לבצע פיזית על הלוח?',
          'האם נדרשת הכוונה במגע יד או הדגמה ישירה של פעולת הפריטה?',
          'כיצד אפשר לסייע לתלמיד לחבר בין הייצוג הפיזי על הלוח לרישום המספרי?'
        ]
      };
    }
    if (student.errorCount >= 3 || student.lastAction?.includes('ללא פריטה')) {
      return {
        category: 'קושי בפריטה והמרה עשרונית',
        questions: [
          'איך אפשר לייצג את המספר בצורה נוספת באמצעות עשרות ויחידות?',
          'מה קורה כאשר מגיעים ל-10 יחידות בעמודת היחידות?',
          'מדוע נדרש לפרוט עשרת אחת לפני שניתן לחסר מתוך עמודת היחידות?'
        ]
      };
    }
    if (student.hesitationSeconds > 30) {
      return {
        category: 'עומס קוגניטיבי / השהייה מתמשכת',
        questions: [
          'איזה צעד ראשון שקלת לבצע? מה גורם לך להתלבט?',
          'איזה כלי חזותי בלוח העזרים יכול לעזור לך להתחיל?',
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

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (activeFilter === 'STRUGGLING') return s.isStruggling;
      if (activeFilter === 'LOCKED') return s.status === 'locked';
      if (activeFilter === 'PHYSICAL_OVERRIDE') return s.physicalOverride;
      return true;
    });
  }, [students, activeFilter]);

  return (
    <div className="flex flex-col gap-8" dir="rtl">
      {/* Visual Live Feed Component (Mini-Radar) */}
      <section className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white rounded-3xl p-6 shadow-xl shadow-indigo-500/15 border border-indigo-400/30 relative overflow-hidden">
        <div className="absolute -top-16 -left-16 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-white/15 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-5 w-5 rounded-full bg-emerald-400 opacity-75" />
              <div className="relative w-10 h-10 rounded-2xl bg-emerald-400/20 border border-emerald-300/40 flex items-center justify-center text-emerald-300 shadow-lg shadow-emerald-500/20">
                <Activity className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                רדאר פדגוגי בזמן אמת
                <span className="text-xs bg-white/20 text-white border border-white/30 px-2.5 py-0.5 rounded-full font-bold backdrop-blur-md">
                  לייב
                </span>
              </h2>
              <p className="text-xs text-indigo-100 mt-0.5">
                ניטור רציף של פעולות התלמידים, השהיות והתראות קוגניטיביות בזמן אמת
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="bg-white/15 border border-white/25 backdrop-blur-md px-4 py-2 rounded-2xl text-xs flex items-center gap-2 shadow-inner">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-300 animate-pulse" />
              <span className="text-indigo-100">תלמידים במאבק: <strong className="text-amber-300 font-extrabold text-sm">{strugglingCount} / 35</strong></span>
            </div>
          </div>
        </div>

        {/* Live Feed Event Stream */}
        <div className="flex flex-col gap-2.5 max-h-[170px] overflow-y-auto pr-1">
          {feedItems.length === 0 ? (
            <div className="py-6 text-center text-slate-500 text-xs">
              ממתין לאירועי רדאר חדשים... הנתונים יוזרמו אוטומטית בעת זיהוי השהייה קוגניטיבית.
            </div>
          ) : (
            feedItems.map((item) => (
              <div 
                key={item.id}
                className={`p-3.5 rounded-2xl border text-sm flex items-center justify-between transition-all backdrop-blur-sm shadow-sm ${
                  item.severity === 'alert'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    : item.severity === 'warning'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : 'bg-slate-900/70 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    item.severity === 'alert' ? 'bg-rose-400 animate-ping' : item.severity === 'warning' ? 'bg-amber-400' : 'bg-indigo-400'
                  }`} />
                  <strong className="font-bold text-white min-w-[75px]">{item.studentName}:</strong>
                  <span className="text-xs md:text-sm font-medium">{item.message}</span>
                </div>
                <span className="text-[11px] font-mono opacity-60 text-slate-400 shrink-0 mr-2" dir="ltr">
                  {new Date(item.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Heatmap Grid Section */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-500" />
              מפת חום כיתתית (35 תלמידים)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              תלמידים במאבק מוחרגים בכתום בעוצמה מתונה (Low-Arousal Orange) לפי הנחיות הפדגוגיה.
            </p>
          </div>

          {/* Interactive Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeFilter === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              הכל (35)
            </button>
            <button
              onClick={() => setActiveFilter('STRUGGLING')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === 'STRUGGLING'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              במאבק ({strugglingCount})
            </button>
            <button
              onClick={() => setActiveFilter('LOCKED')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === 'LOCKED'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              נעול ({lockedCount})
            </button>
            <button
              onClick={() => setActiveFilter('PHYSICAL_OVERRIDE')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === 'PHYSICAL_OVERRIDE'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              עקיפה פיזית ({physicalOverrideCount})
            </button>
          </div>
        </div>

        {/* 5x7 Student Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3.5">
          {filteredStudents.map((student) => {
            const isStruggling = student.isStruggling;

            return (
              <motion.button
                key={student.id}
                layout
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedStudent(student)}
                className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col justify-between h-[135px] relative overflow-hidden group shadow-md ${
                  student.physicalOverride
                    ? 'bg-purple-500/10 border-2 border-purple-500 text-purple-950 dark:text-purple-100 shadow-purple-500/20'
                    : student.status === 'locked'
                    ? 'bg-rose-500/10 border-2 border-rose-500 text-rose-950 dark:text-rose-100 shadow-rose-500/20'
                    : isStruggling
                    ? 'bg-amber-500/15 border-2 border-amber-500 text-amber-950 dark:text-amber-100 shadow-amber-500/20'
                    : 'bg-emerald-500/10 border-2 border-emerald-500/60 text-slate-900 dark:text-slate-100 hover:border-emerald-500'
                }`}
              >
                {/* Top Badge Row */}
                <div className="flex justify-between items-start w-full">
                  <span className="font-black text-xs tracking-tight text-slate-900 dark:text-slate-100">
                    {student.displayName}
                  </span>
                  
                  {/* Status Icon */}
                  {student.status === 'locked' ? (
                    <span className="inline-flex items-center gap-1 bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm" title="מפגש נעול">
                      <Lock className="w-3 h-3" />
                      נעול
                    </span>
                  ) : student.status === 'completed' ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm" title="הושלם בהצלחה">
                      <CheckCircle2 className="w-3 h-3" />
                      הושלם
                    </span>
                  ) : isStruggling ? (
                    <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm animate-bounce" title="מאבק קוגניטיבי">
                      <AlertTriangle className="w-3 h-3" />
                      מאבק
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm" title="למידה תקינה">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      פעיל
                    </span>
                  )}
                </div>

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
                      תיווך פיזי (Dienes)
                    </span>
                  )}
                </div>

                {/* Real-Time Trace Metrics */}
                <div className="text-[10px] text-slate-600 dark:text-slate-300 flex justify-between items-center pt-1 border-t border-slate-200/60 dark:border-slate-800 font-mono font-bold">
                  <span>השהייה: {student.hesitationSeconds}ש'</span>
                  <span>ביטולים: {student.errorCount}</span>
                </div>
              </motion.button>
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
                    className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold"
                  >
                    ✕
                  </button>
                </div>

                {/* Student Overview Cards */}
                <div className="grid grid-cols-2 gap-3.5 mb-6">
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-slate-400 block mb-1">מפגש נוכחי</span>
                    <span className="font-extrabold text-lg text-slate-900 dark:text-white">מפגש {selectedStudent.sessionNumber}</span>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-slate-400 block mb-1">מסלול למידה</span>
                    <span className={`font-extrabold text-lg ${selectedStudent.currentPath === 'צמצום פערים' ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {selectedStudent.currentPath}
                    </span>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-slate-400 block mb-1">אירועי השהייה</span>
                    <span className="font-extrabold text-lg text-slate-900 dark:text-white font-mono">{selectedStudent.hesitationSeconds} שניות</span>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-slate-400 block mb-1">ביטולים / מחיקות</span>
                    <span className="font-extrabold text-lg text-slate-900 dark:text-white font-mono">{selectedStudent.errorCount} פעמים</span>
                  </div>
                </div>

                {/* Prominent Physical Override Button */}
                <div className="mb-8 p-6 bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-purple-950 dark:text-purple-200 text-base flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        עקיפה פיזית / תיווך פיזי (Physical Override)
                      </h4>
                      <p className="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1 leading-relaxed">
                        התרת נעילת הלוח וסימון תיווך מורה פיזי ישיר בתהליך הלמידה.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTogglePhysicalOverride(selectedStudent)}
                    className={`w-full py-3.5 px-5 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${
                      selectedStudent.physicalOverride
                        ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/25'
                        : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-amber-500/25'
                    }`}
                  >
                    {selectedStudent.physicalOverride ? (
                      <>
                        <UserCheck className="w-5 h-5" />
                        <span>תיווך פיזי פעיל - לחץ לבלימה/סיום עקיפה</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-5 h-5" />
                        <span>הפעל עקיפה פיזית / תיווך פיזי להתרת המפגש</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Pedagogical Dialogue Recommendations Section */}
                {(() => {
                  const recs = getPedagogicalRecommendations(selectedStudent);
                  return (
                    <div className="mb-6 p-6 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-3xl space-y-4">
                      <div>
                        <h4 className="font-extrabold text-indigo-950 dark:text-indigo-200 text-base flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          המלצות לשיח פדגוגי (Pedagogical Dialogue)
                        </h4>
                        <span className="text-xs text-indigo-700 dark:text-indigo-300 font-bold block mt-1">
                          קטגוריה: {recs.category}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {recs.questions.map((q, idx) => (
                          <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-indigo-100 dark:border-slate-800 shadow-sm flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <p className="text-xs md:text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                              {q}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3">
                {onDrillDown && (
                  <button
                    onClick={() => {
                      onDrillDown(selectedStudent.id);
                      setSelectedStudent(null);
                    }}
                    className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-95"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    פתח Drill Down מלא (הקלטות + עקיפה)
                  </button>
                )}
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-xl transition-colors"
                >
                  סגור תצוגה
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
