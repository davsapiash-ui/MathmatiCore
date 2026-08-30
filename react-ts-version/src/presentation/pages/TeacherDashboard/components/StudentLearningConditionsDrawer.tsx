import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type StudentData, useStore } from '@/application/useStore';
import { normalizeStudentId } from '@/application/useChatStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { 
  X, 
  Sliders, 
  EyeOff, 
  Clock, 
  Video, 
  MessageCircle, 
  RotateCcw, 
  Check, 
  BellRing, 
  Layers
} from 'lucide-react';
import { StudentReplayAndLogs } from './StudentReplayAndLogs';
import { ResetConfirmationModal } from './ResetConfirmationModal';
import { ref, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { toast } from 'sonner';
import type { ResetReason } from '@/types';

interface Props {
  student: StudentData | null;
  onClose: () => void;
  onOpenChat?: (student: StudentData) => void;
}

export function StudentLearningConditionsDrawer({ student, onClose, onOpenChat }: Props) {
  const [activeTab, setActiveTab] = useState<'scaffolding' | 'accessibility' | 'hesitation' | 'replay'>('scaffolding');
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Form State
  const sAny = (student || {}) as any;
  const [scaffoldLevel, setScaffoldLevel] = useState<0 | 1 | 2>(
    (sAny.scaffoldLevel ?? 0) as 0 | 1 | 2
  );
  const [forceAdditionHelper, setForceAdditionHelper] = useState<boolean>(
    Boolean(sAny.forceAdditionHelper)
  );
  const [isASD, setIsASD] = useState<boolean>(
    Boolean(student?.isASD || sAny.isASD)
  );
  const [hesitationThresholdSeconds, setHesitationThresholdSeconds] = useState<number>(
    sAny.hesitationThresholdSeconds || 30
  );

  useEffect(() => {
    if (student) {
      const s = student as any;
      setScaffoldLevel((s.scaffoldLevel ?? 0) as 0 | 1 | 2);
      setForceAdditionHelper(Boolean(s.forceAdditionHelper));
      setIsASD(Boolean(student.isASD || s.isASD));
      setHesitationThresholdSeconds(s.hesitationThresholdSeconds || 30);
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

  const hasHelpRequest = sAny.helpRequested || sAny.handRaised || sAny.isStruggling;
  const helpCount = sAny.helpCallCount || 0;
  const studentNum = student.studentId.replace(/\D/g, '') || student.studentId;

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const normId = normalizeStudentId(student.studentId);
      const rawNum = student.studentId.replace(/\D/g, '');
      const updatePayload = {
        scaffoldLevel,
        forceAdditionHelper,
        isASD,
        hesitationThresholdSeconds,
        applyAtTaskBoundaryOnly: true,
        adaptationQueuedAt: Date.now(),
        overrideUpdatedAt: Date.now(),
      };

      // 1. Sync to Firebase
      await firebaseSyncService.syncPhysicalOverride(student.studentId, updatePayload);
      await update(ref(database, `users/students/${normId}`), updatePayload);
      if (normId !== rawNum && rawNum) {
        await update(ref(database, `users/students/${rawNum}`), updatePayload).catch(() => {});
      }

      // 2. Update local state
      const store = useStore.getState();
      if (store.applyPhysicalOverride) {
        store.applyPhysicalOverride(student.studentId, updatePayload as any);
      }

      toast.success(`✓ תנאי הלמידה עבור תלמיד ${studentNum} עודכנו בהצלחה!`);
    } catch (err) {
      console.error('Failed to save learning conditions:', err);
      toast.error('שגיאה בשמירת תנאי הלמידה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmResetStudent = async (reason: ResetReason, reasonNote?: string) => {
    setIsResetting(true);
    try {
      await useStore.getState().resetStudentData(student.studentId, reason, reasonNote);
      toast.success(`✓ נתוני תלמיד ${studentNum} אופסו בהצלחה!`);
      setIsResetModalOpen(false);
      onClose();
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('שגיאה באיפוס נתוני התלמיד');
    } finally {
      setIsResetting(false);
    }
  };

  const handleClearHelpRequest = async () => {
    if (!student.studentId) return;
    const normId = normalizeStudentId(student.studentId);
    const rawNum = student.studentId.replace(/[^0-9]/g, '');
    const ids = Array.from(new Set([student.studentId, normId, rawNum, `student_user${rawNum}`].filter(Boolean)));
    
    const studentClearPayload = {
      helpRequested: false,
      handRaised: false,
      isStruggling: false,
      lastAction: 'המורה סימן את בקשת העזרה כטופלה',
    };
    ids.forEach((id) => {
      update(ref(database, `users/students/${id}`), studentClearPayload).catch(console.error);
    });
    toast.success('בקשת העזרה סומנה כטופלה');
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[9998] transition-opacity animate-in fade-in"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className="fixed top-0 right-0 w-full sm:w-[580px] h-[100dvh] bg-white dark:bg-slate-900 shadow-2xl z-[9999] flex flex-col transform transition-transform duration-300 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right" 
        dir="rtl"
      >
        {/* Mobile handle */}
        <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden shrink-0" />
        
        {/* Header */}
        <div className="h-20 px-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  התאמת תנאי למידה — תלמיד {studentNum}
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                בקרת עזרים, רמת פיגום והתאמות נגישות בזמן אמת
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsResetModalOpen(true)}
              disabled={isResetting}
              className="px-2.5 py-1.5 rounded-xl border border-rose-200 hover:border-rose-300 bg-rose-50/70 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="איפוס מלא של נתוני התלמיד"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">איפוס נתונים</span>
            </button>

            {onOpenChat && (
              <button 
                onClick={() => onOpenChat(student)}
                className="p-2 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-xl transition-colors text-indigo-600 dark:text-indigo-400 cursor-pointer"
                title="צ'אט ישיר עם התלמיד"
              >
                <MessageCircle className="w-5 h-5" />
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              title="סגור חלון"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alert Banner for Help Requests */}
        {hasHelpRequest && (
          <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
              <BellRing className="w-4 h-4 text-amber-600 animate-bounce" />
              <span>התלמיד ביקש עזרה ({helpCount} קריאות תועדו)</span>
            </div>
            <button
              onClick={handleClearHelpRequest}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1 shadow-sm shrink-0 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>סמן כטופל</span>
            </button>
          </div>
        )}

        {/* Modern Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-2 bg-slate-50/40 dark:bg-slate-900/40 shrink-0 gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'scaffolding', label: 'רמת עזרה ופיגום', icon: Layers },
            { id: 'accessibility', label: 'שקט חזותי ונגישות', icon: EyeOff },
            { id: 'hesitation', label: 'סף זמן לרמז', icon: Clock },
            { id: 'replay', label: 'שחזור מהלכים', icon: Video },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-3 font-bold text-xs rounded-t-xl transition-all whitespace-nowrap cursor-pointer border-b-2 ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-800 shadow-sm'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: SCAFFOLDING */}
          {activeTab === 'scaffolding' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    רמת תמיכה וייצוג בלוח בית המספרים
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    הגדרת מידת הפיגומים שהתלמיד יקבל במהלך פתרון התרגילים.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    {
                      level: 0,
                      title: 'רמה 0 — עזרה מקיפה והמרות אוטומטיות',
                      desc: 'עזרה מלאה: כפתור המרה אוטומטי (הקפצה), הדגשת טורים והדרכה צעד-אחר-צעד.',
                      badge: 'מומלץ לתלמידים מתקשים',
                      color: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700',
                    },
                    {
                      level: 1,
                      title: 'רמה 1 — עזרה מאוזנת (ברירת מחדל)',
                      desc: 'איזון בין עצמאות להכוונה: דרישה להמרות ידניות עם רמזי גרירה עדינים.',
                      badge: 'קצב למידה רגיל',
                      color: 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700',
                    },
                    {
                      level: 2,
                      title: 'רמה 2 — למידה עצמאית ללא עזרים',
                      desc: 'מינימום עזרה: ללא המרות אוטומטיות, ללא מחסן עזרים – דורש פתרון מופשט ועצמאי.',
                      badge: 'לתלמידים שולטים ומואצים',
                      color: 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700',
                    },
                  ].map((item) => {
                    const isSelected = scaffoldLevel === item.level;
                    return (
                      <div
                        key={item.level}
                        onClick={() => setScaffoldLevel(item.level as any)}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                            {item.title}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.color}`}>
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Additional Helpers */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                  <label className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                    <div>
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">
                        הפעלת עזר חיבור מתמטי (Addition Helper)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        מציג לתלמיד כפתור עזר המציג פירוק כמותי בעת חיבור מאות ועשרות.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={forceAdditionHelper}
                      onChange={(e) => setForceAdditionHelper(e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ACCESSIBILITY & VISUAL CALM */}
          {activeTab === 'accessibility' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-purple-600" />
                    שקט חזותי והתאמת קשב (ASD / Sensory Friendly)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    התאמת סביבת הלמידה לתלמידים עם רגישות חושית או הפרעות קשב וריכוז.
                  </p>
                </div>

                <label className="flex items-start justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <div className="space-y-1">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">
                      הפעלת מצב שקט חזותי (הפחתת גירויים)
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      מכבה אנימציות קופצות, אפקטי תנועה וצלילים מסיחי דעת, ומציג לוח נקי וסולידי עם ניגודיות גבוהה ונעימה לעין.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isASD}
                    onChange={(e) => setIsASD(e.target.checked)}
                    className="w-5 h-5 text-purple-600 rounded-md focus:ring-purple-500 cursor-pointer shrink-0 mt-1"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: HESITATION THRESHOLD */}
          {activeTab === 'hesitation' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    סף זמן היסוס לתמיכה סוקרטית
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    קביעת משך הזמן ללא פעילות שהמערכת תמתין לפני שתציע לתלמיד רמז מכוון.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { sec: 15, label: '15 שניות', desc: 'תמיכה מהירה (לתלמיד חסר ביטחון)' },
                    { sec: 30, label: '30 שניות', desc: 'מאוזן (ברירת מחדל פדגוגית)' },
                    { sec: 60, label: '60 שניות', desc: 'מרחב חשיבה ארוך (לתלמיד עצמאי)' },
                  ].map((item) => {
                    const isSelected = hesitationThresholdSeconds === item.sec;
                    return (
                      <button
                        key={item.sec}
                        type="button"
                        onClick={() => setHesitationThresholdSeconds(item.sec)}
                        className={`p-3.5 rounded-xl border-2 text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-600 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-bold shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="block text-sm font-black mb-1">{item.label}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight">{item.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REPLAY & TRACES */}
          {activeTab === 'replay' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                <StudentReplayAndLogs studentId={student.studentId} />
              </div>
            </div>
          )}

        </div>

        {/* Footer with Save Action */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            * השינויים יוחלו על הלוח של התלמיד במעבר לתרגיל הבא
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              ביטול
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'שומר שינויים...' : 'שמור תנאי למידה'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* PRD v7.1 Module 23א §ה: level 2+ resets must never be single-click. */}
      <ResetConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        resetLevel="single_student"
        targetStudentId={student.studentId}
        targetStudentName={`תלמיד ${studentNum}`}
        onConfirm={handleConfirmResetStudent}
      />
    </>,
    document.body
  );
}
