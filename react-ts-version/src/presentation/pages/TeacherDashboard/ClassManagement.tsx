import { useState, useEffect } from 'react';
import { useAdminStore } from '@/application/useAdminStore';
import { Users, Check, Lock, Sparkles, ChevronRight, Zap, CheckCircle2, Sliders, ShieldCheck } from 'lucide-react';
import { useStore, type StudentData } from '@/application/useStore';
import { HeatmapGrid } from './components/HeatmapGrid';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { ref, onValue, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { normalizeStudentId } from '@/application/useChatStore';

interface StudentGateState {
  id: string;
  studentNumber: number;
  session2Completed: boolean;
  recommendedPath: 'ירוק' | 'צמצום פערי קדם';
  isApproved: boolean;
  enhancedSupport: boolean;
}

const INITIAL_GATE_STUDENTS: StudentGateState[] = Array.from({ length: 12 }, (_, index) => {
  const num = index + 1;
  return {
    id: `student_${num}`,
    studentNumber: num,
    session2Completed: false,
    recommendedPath: 'ירוק',
    isApproved: false,
    enhancedSupport: false,
  };
});

/**
 * מודולים 19 ו-20: ניהול כיתה, פרופיל תמיכה מוגבר ושער אישור מורה (Teacher Gate & Profiles)
 * 1. רשת 12 תלמידים קבועה (מזהים 1-12 בלבד, ללא שמות).
 * 2. מתג שקט להפעלת enhanced_support_profile הנשמר ישירות ב-Firestore/RTDB ללא חיווי בתלמיד.
 * 3. שער אישור מורה: אישור מסלול מעבר למפגש 3 (teacher_gate_approved = true).
 * 4. אכיפת מגבלת 12 תלמידים פעילים לכיתת המבקרים תחת בית ספר ביקורת.
 */
export function ClassManagement({ 
  allStudents, 
  onDrillDown 
}: { 
  allStudents: StudentData[]; 
  onDrillDown?: (studentId: string) => void 
}) {
  const classes = useAdminStore(s => s.classes);
  const schools = useAdminStore(s => s.schools);
  const [studentStates, setStudentStates] = useState<StudentGateState[]>(INITIAL_GATE_STUDENTS);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // We're working with a single default school & class based on the strict hierarchy with reliable fallback
  const currentClass = classes.length > 0 ? classes[0] : { id: 'class_1', name: 'המבקרים', schoolId: 'school_bikorot', studentLimit: 12 };
  const currentSchool = schools.find(s => s.id === currentClass?.schoolId) || schools[0] || { id: 'school_bikorot', name: 'בית ספר ביקורת' };

  useEffect(() => {
    const studentsRef = ref(database, 'users/students');
    const unsub = onValue(
      studentsRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const raw = snapshot.val() || {};

        setStudentStates((prev) => {
          return prev.map((s, index) => {
            const num = index + 1;
            const uid = `student_${num}`;
            const data = raw[uid] || raw[`slot_${num}`] || raw[`student_user${num}`] || {};

            const session2Done = Boolean(
              data.completedMeeting2 ||
              data.session_completed === 2 ||
              (typeof data.highestCompletedMeeting === 'number' && data.highestCompletedMeeting >= 2) ||
              data.routeStatus === 'PENDING_TEACHER_APPROVAL' ||
              data.routeStatus === 'APPROVED'
            );

            const isYellow = data.routeRecommendation === 'YELLOW' || data.sessionState?.current_path === 'remediation_path';
            const isApproved = data.teacher_gate_approved === true || data.routeStatus === 'APPROVED';
            const enhanced = Boolean(data.enhanced_support_profile || data.physicalOverrideActive || data.physicalOverride);

            return {
              id: uid,
              studentNumber: num,
              session2Completed: session2Done,
              recommendedPath: isYellow ? 'צמצום פערי קדם' : 'ירוק',
              isApproved,
              enhancedSupport: enhanced,
            };
          });
        });
      },
      (err) => {
        console.warn('[ClassManagement] studentsRef listener notice:', err);
      }
    );

    return () => unsub();
  }, []);

  // Module 19: Toggle enhanced support profile for a specific student ID (1..12)
  const handleToggleEnhancedSupport = async (student: StudentGateState) => {
    const nextVal = !student.enhancedSupport;
    setUpdatingId(student.id);

    try {
      const studentPayload = {
        enhanced_support_profile: nextVal,
        physicalOverride: nextVal,
        physicalOverrideActive: nextVal,
      };

      await update(ref(database, `users/students/${student.id}`), studentPayload);
      const normId = normalizeStudentId(student.id);
      if (normId !== student.id) {
        await update(ref(database, `users/students/${normId}`), studentPayload);
      }
    } catch (err) {
      console.error('Failed to update enhanced support profile:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Module 20: Approve Teacher Gate for Session 3
  const handleApproveGate = async (student: StudentGateState, chosenPath?: 'ירוק' | 'צמצום פערי קדם') => {
    setUpdatingId(student.id);
    const path = chosenPath || student.recommendedPath;

    try {
      const gatePayload = {
        teacher_gate_approved: true,
        routeStatus: 'APPROVED',
        routeRecommendation: path === 'צמצום פערי קדם' ? 'YELLOW' : 'GREEN',
        gateApprovedAt: Date.now(),
      };

      await update(ref(database, `users/students/${student.id}`), gatePayload);
      const normId = normalizeStudentId(student.id);
      if (normId !== student.id) {
        await update(ref(database, `users/students/${normId}`), gatePayload);
      }
    } catch (err) {
      console.error('Failed to approve teacher gate:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const [isResetting, setIsResetting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const handleResetClassToVirginState = async () => {
    if (!window.confirm('האם לאפס את כל נתוני תלמידי כיתת הביקורת לאפס מוחלט (התחלה נקייה לחלוטין)?')) {
      return;
    }

    setIsResetting(true);
    try {
      const updates: Record<string, any> = {};
      for (let i = 1; i <= 30; i++) {
        const studentPayload = {
          studentId: `student_${i}`,
          name: `תלמיד ${i}`,
          isOnline: false,
          currentTaskIdx: 0,
          activeStep: 1,
          routeStatus: 'GREEN_PATH',
          difficultyRecommendation: 'standard',
          highestCompletedMeeting: 0,
          completedMeeting2: false,
          teacher_gate_approved: false,
          enhanced_support_profile: false,
          physicalOverrideActive: false,
          radar_history: null,
          workspaceState: {
            sessionNumber: 1,
            isASD: false,
            standardTaskIdx: 0,
            counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
            undoCount: 0,
            hesitationCount: 0,
            hasInteracted: false,
            flowStatus: 'task'
          }
        };

        updates[`users/students/student_${i}`] = studentPayload;
        updates[`students/student_${i}`] = studentPayload;
      }

      await update(ref(database), updates);
      setResetFeedback('✓ כל נתוני כיתת הביקורת אופסו בהצלחה לאפס מוחלט!');
      setTimeout(() => setResetFeedback(null), 5000);
    } catch (err) {
      console.error('Failed to reset class data:', err);
      setResetFeedback('שגיאה באיפוס: ' + (err as Error).message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full h-full flex flex-col space-y-8 animate-in fade-in duration-500" dir="rtl">
      
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 p-8 text-white shadow-xl shadow-indigo-500/20 border border-indigo-400/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-100">
              <span className="bg-white/15 border border-white/20 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                בית ספר ביקורת
              </span>
              <ChevronRight className="w-4 h-4 opacity-70 rotate-180" />
              <span className="bg-white/15 border border-white/20 px-3 py-1 rounded-full text-white backdrop-blur-sm">
                כיתת המבקרים
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              <Users className="w-9 h-9 text-indigo-200" />
              ניהול כיתה, פרופילים ושער מורה
            </h1>
            <p className="text-indigo-100 text-sm md:text-base font-medium max-w-2xl">
              הגדרת פרופילי תמיכה סמויים (Module 19), שער אישור מעבר למפגש 3 (Module 20), ואכיפת מגבלת 12 תלמידים.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
            <button
              onClick={handleResetClassToVirginState}
              disabled={isResetting}
              className="bg-red-500/90 hover:bg-red-600 active:scale-95 text-white font-black text-xs px-4 py-2.5 rounded-xl border border-red-300/40 shadow-lg backdrop-blur-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              title="מחיקת כל הנתונים של תלמידי הכיתה והחזרתם למצב נקי לחלוטין"
            >
              <span>🧹</span>
              <span>{isResetting ? 'מאפס נתונים...' : 'איפוס כל נתוני הכיתה לאפס'}</span>
            </button>

            <div className="flex items-center gap-3 bg-white/15 border border-white/25 backdrop-blur-md px-4 py-3 rounded-2xl">
              <div className="text-center">
                <span className="text-[11px] text-indigo-100 block font-semibold">תלמידי הפיילוט</span>
                <span className="text-xl font-black text-white">12 / 12</span>
              </div>
            </div>
          </div>
        </div>

        {resetFeedback && (
          <div className="mt-4 p-3 bg-white/20 border border-white/30 rounded-xl text-sm font-bold text-center text-white backdrop-blur-md animate-fade-in">
            {resetFeedback}
          </div>
        )}
      </header>

      {/* Module 20: Teacher Gate Approvals Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-indigo-600" />
              שער אישור מורה למפגש 3 (Teacher Gate)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              בסיום מפגש 2, התלמידים ממתינים במסך "מעוף הדבורה". אישור המורה כאן משחרר את הנתיב מיידית (פחות משנייה אחת).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {studentStates.map((student) => {
            const isDoneM2 = student.session2Completed;
            const isApproved = student.isApproved;

            return (
              <div 
                key={student.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 ${
                  isApproved
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                    : isDoneM2
                    ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 opacity-75'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">
                      תלמיד {student.studentNumber}
                    </h3>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      מזהה: {student.id}
                    </span>
                  </div>

                  {isApproved ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-1 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      מאושר למפגש 3
                    </span>
                  ) : isDoneM2 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2.5 py-1 rounded-lg animate-pulse">
                      ממתין בשער (מעוף הדבורה)
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                      טרם השלים מפגש 2
                    </span>
                  )}
                </div>

                {/* Recommendation & Approval Actions */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-600 dark:text-slate-400">המלצת מטריקס:</span>
                    <span className={`font-black px-2 py-0.5 rounded-md ${
                      student.recommendedPath === 'צמצום פערי קדם'
                        ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
                        : 'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                    }`}>
                      {student.recommendedPath}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleApproveGate(student, 'ירוק')}
                      disabled={updatingId === student.id}
                      className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                        isApproved && student.recommendedPath === 'ירוק'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200'
                      }`}
                    >
                      אישור מסלול ירוק
                    </button>
                    <button
                      onClick={() => handleApproveGate(student, 'צמצום פערי קדם')}
                      disabled={updatingId === student.id}
                      className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                        isApproved && student.recommendedPath === 'צמצום פערי קדם'
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200'
                      }`}
                    >
                      אישור צמצום פערים
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Module 19: Enhanced Cognitive Support Profiles Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Sliders className="w-6 h-6 text-purple-600" />
              פרופילי תמיכה קוגניטיביים סמויים (Module 19)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              הפעלת פרופיל תמיכה מוגבר נועלת את המקלדת בשורת התוצאה עד להמרה בלבני הדינס. הפעולה סמויה ב-100% ללא תיוג בממשק התלמיד.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {studentStates.map((student) => (
            <div 
              key={student.id}
              className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all ${
                student.enhancedSupport
                  ? 'bg-purple-50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800 shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-black text-sm text-slate-900 dark:text-white">
                  תלמיד {student.studentNumber}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  student.enhancedSupport
                    ? 'bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-100'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {student.enhancedSupport ? 'תמיכה מוגברת' : 'מסלול רגיל'}
                </span>
              </div>

              <button
                onClick={() => handleToggleEnhancedSupport(student)}
                disabled={updatingId === student.id}
                className={`w-full py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  student.enhancedSupport
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md'
                    : 'bg-white hover:bg-purple-50 text-purple-700 border-2 border-purple-200 dark:bg-slate-800 dark:text-purple-300 dark:border-purple-800'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{student.enhancedSupport ? 'בטל תמיכה מוגברת' : 'הפעל תמיכה מוגברת'}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Heatmap Grid Component */}
      <HeatmapGrid onDrillDown={onDrillDown} />
    </div>
  );
}
