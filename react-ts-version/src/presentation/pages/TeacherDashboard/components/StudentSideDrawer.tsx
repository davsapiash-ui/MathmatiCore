import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type StudentData, useStore } from '@/application/useStore';
import { normalizeStudentId } from '@/application/useChatStore';
import { X, CheckCircle, Video, ListTodo, Sliders, BellRing, Check, MessageCircle, Settings, RotateCcw } from 'lucide-react';
import { StudentReplayAndLogs } from './StudentReplayAndLogs';
import { BlueprintEditor } from './BlueprintEditor';
import { PhysicalOverrideControl } from './PhysicalOverrideControl';
import { SilentAdaptationPanel, type AdaptationSettings } from './SilentAdaptationPanel';
import { ref, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { toast } from 'sonner';

interface Props {
  student: StudentData | null;
  onClose: () => void;
  isPendingApproval: boolean;
  onApproveTasks?: (studentId: string) => Promise<void>;
  onOpenChat?: (student: StudentData) => void;
}

export function StudentSideDrawer({ student, onClose, isPendingApproval, onApproveTasks, onOpenChat }: Props) {
  const [activeTab, setActiveTab] = useState<'replays' | 'blueprint' | 'override'>(
    isPendingApproval ? 'blueprint' : 'replays'
  );
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!student) return null;

  const sAny = student as any;
  const hasHelpRequest = sAny.helpRequested || sAny.handRaised || sAny.isStruggling;
  const helpCount = sAny.helpCallCount || 0;

  const handleResetStudent = async () => {
    if (!window.confirm(`האם לאפס את כל נתוני ${student.name || student.studentId} ולהתחיל מחדש כלוח נקי?`)) {
      return;
    }
    setIsResetting(true);
    try {
      await useStore.getState().resetStudentData(student.studentId);
      toast.success(`✓ כל נתוני ${student.name || student.studentId} אופסו בהצלחה!`);
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
  };

  return createPortal(
    <>
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[9998] transition-opacity"
        onClick={onClose}
      />
      
      <div className="fixed top-0 right-0 w-full sm:w-[600px] h-[100dvh] bg-white dark:bg-slate-900 shadow-2xl z-[9999] flex flex-col transform transition-transform duration-300 border-l border-slate-200 dark:border-slate-800" dir="rtl">
        {/* Mobile Drag Handle Signifier */}
        <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden shrink-0" />
        
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {student.name || student.studentId}
            </h2>
            {isPendingApproval && (
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-md border border-amber-200">
                ממתין לאישור
              </span>
            )}
            {student.physicalOverride && (
              <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded-md border border-purple-200">
                עקיפה פיזית פעילה
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetStudent}
              disabled={isResetting}
              className="px-2.5 py-1.5 rounded-xl border border-rose-200 hover:border-rose-400 bg-rose-50/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="איפוס מלא של נתוני התלמיד"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>אפס נתונים</span>
            </button>
            {onOpenChat && (
              <button 
                onClick={() => onOpenChat(student)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-indigo-600 dark:text-indigo-400"
                title="צ'אט עם התלמיד"
              >
                <MessageCircle className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="סגור חלון אבחון"
              title="סגור חלון אבחון"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Persistent Help Call Alert Banner */}
        {hasHelpRequest && (
          <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
              <BellRing className="w-4 h-4 text-amber-600 animate-bounce" />
              <span>תלמיד ביקש עזרה מהמורה (סך הכל {helpCount} קריאות תועדו)</span>
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

        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 pt-2 bg-slate-50/50 dark:bg-slate-800/20 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('replays')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 text-sm whitespace-nowrap ${
              activeTab === 'replays'
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Video className="w-4 h-4" />
            אבחון והקלטות
          </button>
          <button
            onClick={() => setActiveTab('override')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 text-sm whitespace-nowrap ${
              activeTab === 'override'
                ? 'border-amber-500 text-amber-700 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4 text-amber-500" />
            עקיפה פיזית (Physical Override)
          </button>
          <button
            onClick={() => setActiveTab('blueprint')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 text-sm whitespace-nowrap ${
              activeTab === 'blueprint'
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ListTodo className="w-4 h-4" />
            תוכנית עבודה ואישור
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-900 space-y-6">
          {activeTab === 'replays' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div>
                <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-slate-200">נתוני אבחון AI (Q-Matrix)</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {Object.entries(student.conceptMastery || {}).map(([key, val]) => (
                    <div key={key} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl flex justify-between items-center shadow-sm">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {key.replace('_', ' ')}
                      </span>
                      <span className={`font-bold text-sm ${val < 0.8 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {Math.round(val * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {sAny.reflections && (
                <div className="bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-4 rounded-xl space-y-2 mb-6">
                  <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-200">רפלקציית תלמיד מתועדת</h4>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300">
                    <span className="font-semibold">מאמץ מוערך:</span> {sAny.reflections.effort || 'לא רלוונטי'}
                  </p>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300">
                    <span className="font-semibold">אסטרטגיות שנבחרו:</span> {Array.isArray(sAny.reflections.strategies) ? sAny.reflections.strategies.join(', ') : (sAny.reflections.strategies || 'אין')}
                  </p>
                </div>
              )}
              
              {/* Physical Override Controls inside Replay Tab */}
              <PhysicalOverrideControl student={student} />

              <StudentReplayAndLogs studentId={student.studentId} />
            </div>
          )}

          {activeTab === 'override' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <PhysicalOverrideControl student={student} />

              {/* Module 19: Silent Adaptation Control Panel (Task-Boundary Rule) */}
              <SilentAdaptationPanel
                student={{
                  studentId: student.studentId,
                  anonymousLabel: student.name || `תלמיד ${student.studentId.replace(/\D/g, '') || ''}`,
                  path: (sAny.pedagogicalPath === 'remediation_path' || sAny.currentPath === 'צמצום פערים') ? 'remediation_path' : 'green_path',
                  scaffoldLevel: (sAny.scaffoldLevel ?? 0) as 0 | 1 | 2,
                  forceAdditionHelper: Boolean(sAny.forceAdditionHelper),
                  hesitationThresholdSeconds: sAny.hesitationThresholdSeconds || 30,
                  applyAtTaskBoundaryOnly: true,
                }}
                onApplyAdaptation={async (settings: AdaptationSettings) => {
                  const normId = normalizeStudentId(student.studentId);
                  const rawNum = student.studentId.replace(/\D/g, '');
                  const updatePayload = {
                    pedagogicalPath: settings.path,
                    currentPath: settings.path === 'green_path' ? 'ירוק' : 'צמצום פערים',
                    scaffoldLevel: settings.scaffoldLevel,
                    forceAdditionHelper: settings.forceAdditionHelper,
                    hesitationThresholdSeconds: settings.hesitationThresholdSeconds,
                    applyAtTaskBoundaryOnly: true,
                    adaptationQueuedAt: Date.now(),
                  };
                  await update(ref(database, `users/students/${normId}`), updatePayload);
                  if (normId !== rawNum) {
                    await update(ref(database, `users/students/${rawNum}`), updatePayload).catch(() => {});
                  }
                  toast.success(`התאמה פדגוגית שקטה נשמרה (תחול בגבול התרגיל הבא) 🛡️`);
                }}
              />
            </div>
          )}

          {activeTab === 'blueprint' && (
            <div className="animate-in fade-in duration-300 flex flex-col h-full">
              <BlueprintEditor student={student} />
              
              {isPendingApproval && onApproveTasks && (
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                  <button
                    onClick={() => onApproveTasks(student.studentId)}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
                  >
                    <CheckCircle className="w-5 h-5" />
                    אשר תוכנית למפגש הבא
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
