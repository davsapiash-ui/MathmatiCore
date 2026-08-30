import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type StudentData, useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { approveTeacherGate } from '@/core/teacherGate';
import { normalizeStudentId } from '@/application/useChatStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  TrendingUp, 
  ShieldCheck, 
  Edit3, 
  BrainCircuit, 
  Compass, 
  Layers,
  ArrowRight,
  ListTodo
} from 'lucide-react';
import { ref, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { toast } from 'sonner';

interface Props {
  student: StudentData | null;
  onClose: () => void;
  onApproveSuccess?: () => void;
}

export function TeacherGateApprovalDrawer({ student, onClose, onApproveSuccess }: Props) {
  const [isApproving, setIsApproving] = useState(false);
  const sAny = (student || {}) as any;

  // Track selected pedagogical path
  const defaultPath = (sAny.pedagogicalPath === 'remediation_path' || sAny.currentPath === 'צמצום פערים' || student?.routeRecommendation === 'YELLOW')
    ? 'remediation_path'
    : 'green_path';
  const [selectedPath, setSelectedPath] = useState<'green_path' | 'remediation_path'>(defaultPath);

  // Diagnostic tasks from AI or student state
  const diagnosticReport = student?.diagnosticReport || sAny.diagnosticReport;
  const initialTasks = diagnosticReport?.tasks || [];
  const [tasks, setTasks] = useState<any[]>(initialTasks);
  const [isEditingTasks, setIsEditingTasks] = useState(false);

  useEffect(() => {
    if (student) {
      const s = student as any;
      const path = (s.pedagogicalPath === 'remediation_path' || s.currentPath === 'צמצום פערים' || student.routeRecommendation === 'YELLOW')
        ? 'remediation_path'
        : 'green_path';
      setSelectedPath(path);
      setTasks(student.diagnosticReport?.tasks || s.diagnosticReport?.tasks || []);
    }
  }, [student]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!student) return null;

  const studentNum = student.studentId.replace(/\D/g, '') || student.studentId;
  const clinicalDiagnosis = diagnosticReport?.clinicalDiagnosisHe || "התלמיד סיים בהצלחה את מפגש 2 הדיאגנוסטי. מנוע ה-AI ניתח את דפוסי הגרירה והמחיקה ובנה מערך תרגילים מותאם.";
  const actionPlan = diagnosticReport?.actionPlanHe || "חיזוק מיומנות ההמרה עם אפס בעשרות ומעבר הדרגתי לתרגילים מורכבים יותר במפגש 3.";
  const focusConcept = diagnosticReport?.focusConcept || (selectedPath === 'green_path' ? 'שליטה מתקדמת והרחבת מבנה עשרוני' : 'צמצום פערי המרה ושומר מקום (אפס)');

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      // PRD v7.1 Module 20: the session-2 SessionDocument in Firestore is the sole
      // source of truth; approveTeacherGate performs the authoritative write and
      // mirrors to RTDB only so the learner's listener unlocks immediately.
      const teacherId = useAuthStore.getState().user?.uid || null;
      const result = await approveTeacherGate(student.studentId, selectedPath, teacherId);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      useStore.getState().approveRoute(student.studentId);
      toast.success(`✓ שער המורה אושר! תלמיד ${studentNum} הועבר למסלול ${selectedPath === 'green_path' ? 'ירוק (מואץ)' : 'צהוב (צמצום פערים)'} ונפתח למפגש 3 🚀`);
      if (onApproveSuccess) onApproveSuccess();
      onClose();
    } catch (err) {
      console.error('Error approving gate:', err);
      toast.error('שגיאה באישור שער המורה');
    } finally {
      setIsApproving(false);
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/65 backdrop-blur-md z-[9998] transition-opacity animate-in fade-in"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className="fixed top-0 right-0 w-full sm:w-[620px] h-[100dvh] bg-white dark:bg-slate-900 shadow-2xl z-[9999] flex flex-col transform transition-transform duration-300 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right" 
        dir="rtl"
      >
        {/* Mobile handle */}
        <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden shrink-0" />
        
        {/* Header */}
        <div className="h-20 px-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-gradient-to-l from-indigo-50/70 via-purple-50/40 to-white dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/20">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  שער אישור מעבר — תלמיד {studentNum}
                </h2>
                <span className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  ממתין להחלטתך
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                אישור מסלול לימוד ותוכנית תרגילים לקראת מפגש 3
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            title="סגור חלון"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* STEP 1: CHOOSE PEDAGOGICAL PATH */}
          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
              <Compass className="w-4 h-4 text-indigo-600" />
              <span>1. קביעת מסלול הלימוד למפגש 3 ואילך:</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Green Path */}
              <div
                onClick={() => setSelectedPath('green_path')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                  selectedPath === 'green_path'
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      מסלול ירוק (מואץ)
                    </span>
                  </div>
                  {selectedPath === 'green_path' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  התקדמות שוטפת לעבר חיבור וחיסור במספרים תלת-ספרתיים מורכבים והעמקה קוגניטיבית.
                </p>
              </div>

              {/* Yellow Path */}
              <div
                onClick={() => setSelectedPath('remediation_path')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                  selectedPath === 'remediation_path'
                    ? 'border-amber-600 bg-amber-50/60 dark:bg-amber-950/40 shadow-sm ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      מסלול צהוב (צמצום פערים)
                    </span>
                  </div>
                  {selectedPath === 'remediation_path' && (
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  הוראת עמיתים וסגירת פערי קדם במבנה עשרוני, המרות שקטות ושומר מקום (אפס).
                </p>
              </div>
            </div>
          </div>

          {/* STEP 2: AI CLINICAL DIAGNOSIS & RATIONALE */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-bold text-sm">
              <BrainCircuit className="w-4 h-4 text-indigo-600" />
              <span>2. ניתוח אבחוני והיגיון פדגוגי (AI Diagnostic Blueprint)</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  🎯 מוקד קוגניטיבי:
                </span>
                <span className="text-indigo-700 dark:text-indigo-400 font-semibold font-mono">
                  {focusConcept}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  📋 אבחון קליני:
                </span>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {clinicalDiagnosis}
                </p>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  💡 תוכנית פעולה מוצעת:
                </span>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {actionPlan}
                </p>
              </div>
            </div>
          </div>

          {/* STEP 3: EXERCISES BLUEPRINT */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
                <ListTodo className="w-4 h-4 text-indigo-600" />
                <span>3. מערך תרגילים מוכן למפגש 3 ({tasks.length} תרגילים):</span>
              </label>
              <button
                type="button"
                onClick={() => setIsEditingTasks(!isEditingTasks)}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditingTasks ? 'סיום עריכה' : 'עריכת תרגילים'}</span>
              </button>
            </div>

            {tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((task: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="p-3.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          {task.titleHe || `תרגיל ${idx + 1}`}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {task.rationale || 'התאמה אדפטיבית לפי תוצאות האבחון.'}
                        </span>
                      </div>
                    </div>

                    <div className="font-mono text-sm font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-indigo-700 dark:text-indigo-400 shrink-0" dir="ltr">
                      {task.equation || (task.numberA ? `${task.numberA} ${task.isSubtraction ? '-' : '+'} ${task.numberB} = ?` : '245 + 137 = ?')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500">
                מערך תרגילי ברירת המחדל מוכן להפעלה ישירה.
              </div>
            )}
          </div>

        </div>

        {/* Footer with Approve Action */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-gradient-to-l from-indigo-50/70 via-purple-50/40 to-white dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-slate-900 backdrop-blur-md flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            ביטול
          </button>

          <button
            onClick={handleApprove}
            disabled={isApproving}
            className="px-7 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <CheckCircle2 className="w-5 h-5 text-amber-300" />
            <span>{isApproving ? 'מאשר ומפעיל...' : 'אשר והפעל תוכנית למפגש 3'}</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
