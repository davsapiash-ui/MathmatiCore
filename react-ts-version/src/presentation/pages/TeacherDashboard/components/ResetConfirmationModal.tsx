import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, RefreshCw, X, Check } from 'lucide-react';
import type { ResetReason } from '@/types';

export interface ResetConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  resetLevel: 'alerts' | 'single_student' | 'system';
  targetStudentId?: string;
  targetStudentName?: string;
  onConfirm: (reason: ResetReason, reasonNote?: string) => Promise<void>;
}

const REASON_LABELS: Record<ResetReason, string> = {
  technical_fault: 'תקלה טכנית במכשיר או בתקשורת',
  student_stuck: 'הלומד נתקע וזקוק להתחלה מחדש',
  restart_session: 'פתיחה מחודשת של המפגש לכלל הכיתה',
  test_run: 'הרצת בדיקה / פיילוט מבוקר',
  other: 'אחר (פירוט בהערה)',
};

export const ResetConfirmationModal: React.FC<ResetConfirmationModalProps> = ({
  isOpen,
  onClose,
  resetLevel,
  targetStudentId,
  targetStudentName,
  onConfirm,
}) => {
  const [selectedReason, setSelectedReason] = useState<ResetReason>('restart_session');
  const [reasonNote, setReasonNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doubleConfirmed, setDoubleConfirmed] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSubmitting) return;
    setStep(1);
    setDoubleConfirmed(false);
    setReasonNote('');
    onClose();
  };

  const handleExecute = async () => {
    if (resetLevel === 'system' && step === 1) {
      setStep(2);
      return;
    }
    if (resetLevel === 'system' && !doubleConfirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(selectedReason, reasonNote.trim() || undefined);
      handleClose();
    } catch (e) {
      console.error('Reset execution failed:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLevel3 = resetLevel === 'system';
  const isLevel2 = resetLevel === 'single_student';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative">
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          className="absolute top-4 left-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 rounded-2xl ${isLevel3 ? 'bg-red-50 dark:bg-red-950/50 text-red-600' : isLevel2 ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600' : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'}`}>
            {isLevel3 ? <ShieldAlert className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              {isLevel3
                ? 'איפוס מערכת כולל (רמה 3)'
                : isLevel2
                ? `איפוס לומד יחיד (רמה 2): ${targetStudentName || targetStudentId}`
                : 'איפוס התראות רדאר (רמה 1)'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              מודול 23א: גיבוי מקדים מלא ותיעוד מחייב ביומן הביקורת (Audit Trail)
            </p>
          </div>
        </div>

        {/* Deletion details breakdown */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 mb-4 border border-slate-200/60 dark:border-slate-700/60 text-sm">
          <p className="font-bold text-slate-800 dark:text-slate-200 mb-2">מה יקרה בעת ביצוע הפעולה?</p>
          <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {isLevel3 && (
              <>
                <li className="text-amber-700 dark:text-amber-300 font-semibold">יבוצע גיבוי מלא של כל 12 התלמידים אל Google Drive לפני כל מחיקה.</li>
                <li>יימחקו כל נתוני מרחב העבודה, הטלמטריה, הודעות הצ'אט והסשנים של כלל הכיתה.</li>
                <li>כל 12 הלומדים יוחזרו למצב התחלה נקי.</li>
                <li>יירשם תיעוד בלתי-מחיק ביומן הביקורת reset_audit_log.</li>
              </>
            )}
            {isLevel2 && (
              <>
                <li className="text-amber-700 dark:text-amber-300 font-semibold">יבוצע גיבוי מלא של נתוני {targetStudentName || targetStudentId} אל Google Drive.</li>
                <li>יימחקו מצב מרחב העבודה והתקדמות המפגש הפעיל של לומד זה בלבד.</li>
                <li>הלומד יוחזר לתחילת המפגש הפעיל.</li>
                <li>יירשם תיעוד בלתי-מחיק ביומן הביקורת reset_audit_log.</li>
              </>
            )}
            {!isLevel2 && !isLevel3 && (
              <>
                <li>ינוקה מצב הרדאר הפדגוגי ו-12 המשבצות יוחזרו לברירת מחדל.</li>
                <li>לא יימחקו נתוני למידה או טלמטריה.</li>
                <li>יירשם תיעוד ביומן הביקורת reset_audit_log.</li>
              </>
            )}
          </ul>
        </div>

        {/* Step 1: Mandatory Reason Selector */}
        {step === 1 && (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                סיבת האיפוס (שדה חובה):
              </label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value as ResetReason)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
              >
                {Object.entries(REASON_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                הערה פדגוגית / טכנית (אופציונלי):
              </label>
              <input
                type="text"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="הסבר קצר על נסיבות האיפוס..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Step 2: System Double Confirmation */}
        {step === 2 && isLevel3 && (
          <div className="space-y-4 mb-6 animate-in fade-in">
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
              <p className="font-extrabold mb-1">⚠️ אישור כפול נדרש לאיפוס מערכת כולל</p>
              <p className="text-xs leading-relaxed">
                פעולה זו תאפס את כל 12 הלומדים בכיתה. אנא אשר/י כי ברצונך להמשיך לאחר יצירת קובץ הגיבוי בדרייב.
              </p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
              <input
                type="checkbox"
                checked={doubleConfirmed}
                onChange={(e) => setDoubleConfirmed(e.target.checked)}
                className="w-5 h-5 rounded text-red-600 focus:ring-red-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                אני מאשר/ת באופן מפורש את ביצוע איפוס המערכת הכולל.
              </span>
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            ביטול
          </button>

          <button
            type="button"
            onClick={handleExecute}
            disabled={isSubmitting || (isLevel3 && step === 2 && !doubleConfirmed)}
            className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer ${
              isLevel3
                ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50'
                : isLevel2
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>מבצע גיבוי ואיפוס...</span>
              </>
            ) : isLevel3 && step === 1 ? (
              <span>המשך לשלב אישור סופי</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>בצע איפוס מבוקר</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
