import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type StudentData, useStore } from '@/application/useStore';
import { normalizeStudentId } from '@/application/useChatStore';
import { X, CheckCircle, Video, ListTodo, Sliders, BellRing, Check, MessageCircle, RotateCcw, FileText } from 'lucide-react';
import { StudentReplayAndLogs } from './StudentReplayAndLogs';
import { BlueprintEditor } from './BlueprintEditor';
import { SilentAdaptationPanel, type AdaptationSettings } from './SilentAdaptationPanel';
import { ref, update } from 'firebase/database';
import { database, functions } from '@/infrastructure/firebase';
import { httpsCallable } from 'firebase/functions';
import { pedagogicalReportService } from '@/infrastructure/services/PedagogicalReportService';
import { toast } from 'sonner';

interface Props {
  student: StudentData | null;
  onClose: () => void;
  isPendingApproval: boolean;
  onApproveTasks?: (studentId: string) => Promise<void>;
  onOpenChat?: (student: StudentData) => void;
}

export function StudentSideDrawer({ student, onClose, isPendingApproval, onApproveTasks, onOpenChat }: Props) {
  const [activeTab, setActiveTab] = useState<'replays' | 'blueprint' | 'adaptations'>(
    isPendingApproval ? 'blueprint' : 'replays'
  );
  const [isResetting, setIsResetting] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

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

  const handleGenerateReport = async (overrideSessionNum?: number) => {
    setIsGeneratingReport(true);
    try {
      const rawNum = student.studentId.replace(/\D/g, '') || '1';
      // Module 23: Determine target diagnostic session dynamically: Session 2 (Gate) or Session 8 (Final)
      const targetSession = overrideSessionNum || (isPendingApproval ? 2 : (sAny.sessionNumber || student.current_session || student.workspaceState?.sessionNumber || 8));
      const sessionId = `session_${targetSession}_student_${rawNum}`;
      const generateReportCallable = httpsCallable(functions, 'generatePedagogicalReportPDF');
      const res: any = await generateReportCallable({ 
        sessionId,
        sessionNumber: targetSession,
      });

      if (!res.data || !res.data.report) {
        throw new Error('Server failed to return valid pedagogical report data.');
      }

      const sReport = res.data.report;
      const downloadUrl = res.data.downloadUrl;
      const isDegraded = res.data.status === 'DEGRADED_JSON_ONLY' || !res.data.pdf_stored;

      // Explicit Notification: Alert if PDF storage was degraded
      if (isDegraded) {
        toast.warning(`שים לב: שמירת ה-PDF ב-Cloud Storage לא הושלמה (${res.data.error_message || 'שגיאת אחסון'}). מוצגת תצוגת דוח מקומית זמנית בלבד.`, { duration: 6000 });
      }

      // Primary Delivery: If authoritative Cloud Storage PDF URL exists, open/download it directly
      if (!isDegraded && downloadUrl && typeof downloadUrl === 'string' && downloadUrl.startsWith('http')) {
        window.open(downloadUrl, '_blank');
        toast.success(`✓ קובץ PDF אותנטי (מפגש ${targetSession}) נשמר והורד מ-Cloud Storage בהצלחה!`);
      } else {
        // Fallback presentation preview (or degraded fallback)
        const html = pedagogicalReportService.generatePrintableHtml({
          studentId: student.studentId,
          displayId: sReport.student_id || parseInt(rawNum, 10),
          sessionNumber: sReport.session_number || targetSession,
          finalScore: sReport.score_percent || 0,
          persistenceIndex: 100,
          undoCount: 0,
          errorCount: 0,
          guessCount: 0,
          routeType: sReport.matrix_recommended_path === 'green_path' ? 'GREEN' : 'YELLOW_REMEDIATION_PATH',
          groupRecommendation: (sReport.score_percent < 50 ? 'HOMOGENEOUS_PHYSICAL_TENS' : sReport.score_percent <= 75 ? 'HETEROGENEOUS_GROUPING' : 'INDEPENDENT_CHALLENGE'),
          recommendationLabelHebrew: sReport.routing_label_he || 'שיבוץ מותאם',
          recommendationDetailsHebrew: sReport.recommendation_details_he || '',
          completedMilestones: [
            'זיהוי המבנה העשרוני בתחום ה-10,000',
            'ביצוע המרות כפל בעשרות שלמות',
            'הפעלת בקרה עצמית ושימוש ב-Undo',
          ],
          exerciseNarratives: sReport.exercise_narratives,
          timestamp: sReport.generated_at || Date.now(),
        });

        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
        if (!isDegraded) {
          toast.success(`דוח פדגוגי עבור תלמיד ${rawNum} (מפגש ${targetSession}) הופק בהצלחה!`);
        }
      }
    } catch (err: any) {
      console.error('Pedagogical report error:', err);
      toast.error('הפקת הדוח הפדגוגי נכשלה. נסה שוב מאוחר יותר.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleResetStudent = async () => {
    setIsResetting(true);
    try {
      const sNum = student.studentId.replace(/\D/g, '') || student.studentId;
      await useStore.getState().resetStudentData(student.studentId);
      toast.success(`✓ נתוני תלמיד ${sNum} אופסו בהצלחה!`);
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
              תלמיד {student.studentId.replace(/\D/g, '') || student.studentId}
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
            {isPendingApproval ? (
              <button
                onClick={() => handleGenerateReport(2)}
                disabled={isGeneratingReport}
                className="px-2.5 py-1.5 rounded-xl border border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="הפק דוח פדגוגי מסכם למפגש 2 (שער אישור)"
              >
                <FileText className={`w-3.5 h-3.5 ${isGeneratingReport ? 'animate-spin' : ''}`} />
                <span>דוח מפגש 2</span>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleGenerateReport(2)}
                  disabled={isGeneratingReport}
                  className="px-2 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-300 bg-slate-50 hover:bg-indigo-50 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                  title="הפק דוח פדגוגי למפגש 2 (שער ניתוב)"
                >
                  <FileText className="w-3 h-3 text-indigo-500" />
                  <span>דוח 2</span>
                </button>
                <button
                  onClick={() => handleGenerateReport(8)}
                  disabled={isGeneratingReport}
                  className="px-2 py-1.5 rounded-xl border border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                  title="הפק דוח פדגוגי מסכם למפגש 8"
                >
                  <FileText className="w-3 h-3 text-indigo-500" />
                  <span>דוח 8</span>
                </button>
              </div>
            )}
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
            onClick={() => setActiveTab('adaptations')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 text-sm whitespace-nowrap ${
              activeTab === 'adaptations'
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4 text-indigo-500" />
            התאמות פדגוגיות (UDL)
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

              <StudentReplayAndLogs studentId={student.studentId} />
            </div>
          )}

          {activeTab === 'adaptations' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              {/* Module 19: Silent Adaptation Control Panel (Task-Boundary Rule) */}
              <SilentAdaptationPanel
                student={{
                  studentId: student.studentId,
                  anonymousLabel: `תלמיד ${student.studentId.replace(/\D/g, '') || ''}`,
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
