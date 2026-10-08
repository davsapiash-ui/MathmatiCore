import React, { useState, useCallback } from 'react';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { createPortal } from 'react-dom';
import { AlertTriangle, ShieldAlert, RefreshCw, X, Check } from 'lucide-react';
import type { ResetReason, ResetTarget, SingleStudentResetScope } from '@/types';
import { validateChatInputForPII, anonymizeChatMessageBody, reportPiiFilterFailure } from '@/core/security/PiiFilter';
import { meetingLabelHe } from '@/core/stationNames';
import { useResetMeetingTarget } from '@/application/useResetMeetingTarget';
import { finishedMeetingRefusalHe } from '@/core/resetMeetingTarget';
import { RESET_ACTION_HE, RESET_LOG_LINE_HE, RESET_REASON_HE, TEACHER_GATE_HE } from '@/core/routeLabels';

/** "תלמיד 3" → "3", for a sentence that already says "תלמיד". */
function learnerLabelOf(name: string | undefined): string {
  return String(name ?? '').replace(/\D/g, '') || String(name ?? '');
}

export interface ResetConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  resetLevel: 'alerts' | 'single_student' | 'system';
  /**
   * Level 2 only. 'class' restarts the open meeting for all 12 learners in one
   * action (register, deviation 20); it has no learner, no scope choice, and
   * needs a meeting the teacher has open.
   */
  resetTarget?: ResetTarget;
  targetStudentId?: string;
  targetStudentName?: string;
  /** Level 2: the meeting the teacher currently has open (Module 14), if any. */
  activeSessionNumber?: number | null;
  /**
   * Level 2: `scope` is what the teacher chose (PRD 23א §ב.2 default is the
   * active meeting), `sessionNumber` the meeting the class has open, if any.
   */
  onConfirm: (reason: ResetReason, reasonNote?: string, options?: { scope: SingleStudentResetScope; sessionNumber: number | null }) => Promise<void>;
}

// One list with the journey and the reports (core/routeLabels.ts).
const REASON_LABELS: Record<ResetReason, string> = RESET_REASON_HE;

/**
 * PRD 23א §ד keeps one closed list of five reasons. Each reset offers only the
 * reasons that can be true of it: "פתיחה מחודשת של המפגש לכלל הכיתה" is the
 * whole-class restart, and "התלמיד נתקע" is one learner. All five were offered
 * everywhere, so the log could say a learner got stuck on a class-wide wipe.
 */
export function resetReasonsFor(level: 'alerts' | 'single_student' | 'system', target: ResetTarget = 'student'): ResetReason[] {
  if (level === 'single_student' && target === 'class') return ['technical_fault', 'restart_session', 'test_run', 'other'];
  if (level === 'single_student') return ['technical_fault', 'student_stuck', 'test_run', 'other'];
  return ['technical_fault', 'test_run', 'other'];
}

export const ResetConfirmationModal: React.FC<ResetConfirmationModalProps> = ({
  isOpen,
  onClose,
  resetLevel,
  resetTarget = 'student',
  targetStudentId,
  targetStudentName,
  activeSessionNumber: activeSessionProp,
  onConfirm,
}) => {
  // PRD 23א §ד: "בכל פעולת איפוס המורה נדרשת לבחור סיבה מתוך רשימה סגורה".
  // The list used to open on "פתיחה מחודשת של המפגש לכלל הכיתה", and kept the
  // last reason for the next reset, so one click logged a reason nobody chose.
  const [selectedReason, setSelectedReason] = useState<ResetReason | ''>('');
  const [reasonNote, setReasonNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doubleConfirmed, setDoubleConfirmed] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  // PRD Module 23א §ב.2: the default is the active meeting only.
  const [scope, setScope] = useState<SingleStudentResetScope>('active_session');
  // Twelve learners lose the work of the open meeting: one explicit tick, so
  // the button next to "איפוס התראות" cannot do it on a stray click.
  const [classConfirmed, setClassConfirmed] = useState(false);
  const classSessionNumber = activeSessionProp && activeSessionProp >= 1 && activeSessionProp <= 8 ? activeSessionProp : null;
  const isClassTarget = resetLevel === 'single_student' && resetTarget === 'class';
  // PRD 23א §ה: the meeting is named before the teacher confirms. For one
  // learner it is worked out by the server's own rule (core/resetMeetingTarget.ts):
  // the class's open meeting, else the meeting the learner is in. The window
  // used to say only "המפגש הנוכחי" when no meeting was open.
  const isOneLearner = resetLevel === 'single_student' && !isClassTarget;
  const resetMeeting = useResetMeetingTarget(isOpen && isOneLearner, targetStudentId, classSessionNumber);
  // A finished meeting with none open is refused (core/resetMeetingTarget.ts, step 4): no meeting to reset.
  const finishedTarget = isOneLearner && resetMeeting.target?.finished ? resetMeeting.target : null;
  const activeSessionNumber = isOneLearner
    ? (finishedTarget ? null : resetMeeting.target?.sessionNumber ?? null)
    : classSessionNumber;

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setStep(1);
    setDoubleConfirmed(false);
    setSelectedReason('');
    setReasonNote('');
    // The red line under the note stayed for the next reset, over an empty field.
    setNoteError(null);
    setScope('active_session');
    setClassConfirmed(false);
    onClose();
  }, [isSubmitting, onClose]);

  // מסמך העיצוב §1.2: Escape סוגר, הפוקוס נלכד בחלון, ובסגירה חוזר למקומו.
  //
  // Escape קרא קודם ל-onClose הגולמי ולא ל-handleClose, וכל שלושת המשתמשים
  // משאירים את הרכיב מורכב ומחליפים רק את isOpen — כך שהמצב המקומי שרד.
  // איפוס מערכת: להיכנס, ללחוץ "המשך לשלב אישור סופי", לסמן את האישור
  // הכפול, ואז Escape. בפתיחה הבאה step עדיין 2, כלומר שדה החובה "סיבת
  // האיפוס" אינו מוצג כלל, האישור הכפול כבר מסומן, והכפתור הראשי הוא כבר
  // "בצע איפוס מבוקר" — לחיצה אחת מוחקת את כל 12 הלומדים, עם הסיבה הקודמת
  // ביומן הביקורת. וברמה 2: בחירת "איפוס מוחלט של הלומד" שרדה גם היא, כך
  // שהחלון כבר לא נפתח על ברירת המחדל שמודול 23א §ב.2 מחייב.
  const dialogRef = useDismissableOverlay<HTMLDivElement>(isOpen, handleClose);

  if (!isOpen) return null;

  const handleExecute = async () => {
    if (!selectedReason) return;
    if (resetLevel === 'system' && step === 1) {
      setStep(2);
      return;
    }
    if (resetLevel === 'system' && !doubleConfirmed) {
      return;
    }
    if (isClassTarget && (!activeSessionNumber || !classConfirmed)) {
      return;
    }
    if (isOneLearner && scope === 'active_session' && !activeSessionNumber) {
      return;
    }

    // Zero-PII (architecture invariant 1, Module 3): the note goes into the
    // audit log and the reset backup, which the admin console and the
    // research export read. Every other free-text field a teacher types
    // passes the same check; this one did not, so "איפוס כי דניאל בכה" would
    // have put a child’s name in the one place nothing else ever does.
    // PRD Module 3 §א (v7.9): if the filter itself fails, nothing is locked —
    // the note is kept, the reset goes ahead, and the failure is logged. The
    // server still runs its own PII filter on reason_note (Module 22 §ב).
    const trimmedNote = reasonNote.trim();
    if (trimmedNote) {
      let check: { valid: boolean; errorHe?: string } = { valid: true };
      try {
        check = validateChatInputForPII(trimmedNote);
      } catch (err) {
        reportPiiFilterFailure('ResetConfirmationModal', err);
      }
      if (!check.valid) {
        setNoteError(check.errorHe || 'ההערה מכילה פרטים מזהים. כתבו רק את מספר התלמיד (1–12).');
        return;
      }
    }
    setNoteError(null);

    setIsSubmitting(true);
    try {
      await onConfirm(
        selectedReason,
        trimmedNote ? anonymizeChatMessageBody(trimmedNote) : undefined,
        resetLevel === 'single_student'
          ? { scope: isClassTarget ? 'active_session' : scope, sessionNumber: activeSessionNumber }
          : undefined
      );
      handleClose();
    } catch (e) {
      console.error('Reset execution failed:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLevel3 = resetLevel === 'system';
  const isLevel2 = resetLevel === 'single_student';
  const isFullStudent = isLevel2 && !isClassTarget && scope === 'full_student';
  // The meeting under the name the children see (owner, 27.9.2026, register
  // ט), wherever this window names it: the line under the heading, the list
  // of what is deleted, the tick and the "… בלבד" choice.
  const meetingLabel = activeSessionNumber ? meetingLabelHe(activeSessionNumber) : '';
  const learnerName = targetStudentName || targetStudentId;
  const reasons = resetReasonsFor(resetLevel, resetTarget);

  // Above the learner drawer (its backdrop z-[9998], its panel z-[9999]),
  // which opens this window from its "איפוס נתונים" button. At z-50 the window
  // was drawn under the drawer's backdrop: the confirm click landed on the
  // backdrop and closed everything. Which overlay answers Escape and Tab is
  // decided by useDismissableOverlay (the one opened last).
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="אישור איפוס נתונים"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
      dir="rtl"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl relative">
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          aria-label="סגירת החלון"
          className="absolute top-4 left-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 rounded-2xl ${isLevel3 ? 'bg-red-50 dark:bg-red-950/50 text-red-600' : isLevel2 ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600' : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'}`}>
            {isLevel3 ? <ShieldAlert className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
          </div>
          <div>
            {/* One name per action: the heading is the button's own name (HeatmapGrid, the drawer). */}
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              {isLevel3
                ? `${RESET_ACTION_HE.system} (רמה 3)`
                : isClassTarget
                ? `${RESET_ACTION_HE.classMeeting} (רמה 2)`
                : isLevel2
                ? `איפוס של תלמיד אחד (רמה 2): ${learnerName}`
                : `${RESET_ACTION_HE.alerts} (רמה 1)`}
            </h3>
            {isLevel2 && !isFullStudent && activeSessionNumber ? (
              // The one meeting this reset touches. A full reset of the learner
              // touches all eight, so no single meeting is named for it.
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300 mt-0.5">{meetingLabelHe(activeSessionNumber)}</p>
            ) : null}
            {/* Level 1 deletes no learning data and needs no backup (PRD 23א §ב.1); it used to claim one. */}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isLevel2 || isLevel3
                ? 'לפני שנמחק משהו נשמר גיבוי, והפעולה נרשמת ביומן האיפוסים.'
                : 'הפעולה נרשמת ביומן האיפוסים. לא נשמר גיבוי, כי לא נמחקים נתוני למידה.'}
            </p>
          </div>
        </div>

        {/* Deletion details breakdown (PRD 23א §ה: "מפרט במפורש מה עומד להימחק") */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 mb-4 border border-slate-200/60 dark:border-slate-700/60 text-sm">
          <p className="font-bold text-slate-800 dark:text-slate-200 mb-2">מה יקרה בעת ביצוע הפעולה?</p>
          <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {isLevel3 && (
              <>
                <li className="text-amber-700 dark:text-amber-300 font-semibold">לפני שנמחק משהו נשמר גיבוי של הנתונים של כל 12 התלמידים.</li>
                <li className="text-red-700 dark:text-red-300 font-semibold">יימחקו כל נתוני הלמידה של הכיתה: ההתקדמות בכל המפגשים, ציוני האבחון והמסלולים שאושרו, ההקלטות, הודעות הצ'אט, הדוחות, הרפלקציות, רישום הפעולות והתראות הרדאר.</li>
                <li>יימחקו גם ההגדרות של כל התלמידים: פרופיל התמיכה המוגברת ומצב השקט החזותי.</li>
                <li>המפגש הפתוח ייסגר, והשידור למסכי התלמידים ייעצר.</li>
                <li>כל 12 התלמידים יתחילו מההתחלה.</li>
                <li>{RESET_LOG_LINE_HE}</li>
              </>
            )}
            {isClassTarget && (
              <>
                <li className="text-amber-700 dark:text-amber-300 font-semibold">לפני האיפוס נשמר גיבוי של הנתונים של כל 12 התלמידים.</li>
                {activeSessionNumber ? <li>יימחקו העבודה וההתקדמות של כל 12 התלמידים ב{meetingLabel}.</li> : null}
                <li>כל התלמידים יחזרו לתחילת המפגש. העבודה במפגשים האחרים, ההקלטות והודעות הצ'אט נשמרות.</li>
                {/* Register deviation 20, "מה לא משתנה": the radar alerts are not reset (that is level 1). */}
                <li>{`הקריאות לעזרה של התלמידים נשארות ברדאר. כדי לנקות אותן לחצו על "${RESET_ACTION_HE.alerts}".`}</li>
                {activeSessionNumber === 2 && (
                  // Register deviation 10/20: the diagnostic's outputs are part of meeting 2's progress.
                  <li className="text-red-700 dark:text-red-300 font-semibold">
                    במפגש 2 יימחקו גם ציוני האבחון, ההמלצות והמסלולים שאושרו ב"{TEACHER_GATE_HE}" לכל התלמידים. מי שכבר התקדם למפגש 3 ואילך ימתין עד שיעשה שוב את מפגש 2 ותאשרו לו מסלול מחדש.
                  </li>
                )}
                {activeSessionNumber === 8 && (
                  // PRD 23א §ב.2: in meeting 8 the class reset deletes the meeting's reflections, so the class can redo it.
                  <li className="text-red-700 dark:text-red-300 font-semibold">במפגש 8 יימחקו גם הרפלקציות של המפגש, כדי שאפשר יהיה לבצע את המפגש מחדש בכיתה. הן נשמרות בגיבוי.</li>
                )}
                <li>המפגש של הכיתה נשאר פתוח, והשעון שלו ממשיך מהרגע שהופעל.</li>
                <li>{RESET_LOG_LINE_HE}</li>
              </>
            )}
            {isLevel2 && !isClassTarget && !isFullStudent && (
              <>
                <li className="text-amber-700 dark:text-amber-300 font-semibold">לפני האיפוס נשמר גיבוי של כל הנתונים של {learnerName}.</li>
                {activeSessionNumber ? <li>יימחקו העבודה וההתקדמות של התלמיד ב{meetingLabel}.</li> : null}
                <li>התלמיד יחזור לתחילת המפגש. העבודה במפגשים האחרים, ההקלטות והודעות הצ'אט נשמרות.</li>
                {resetMeeting.loading ? (
                  <li>בודקים איזה מפגש יאופס…</li>
                ) : !resetMeeting.target ? (
                  <li className="text-red-700 dark:text-red-300 font-semibold">אין מפגש פתוח לכיתה, ולא ידוע באיזה מפגש התלמיד נמצא, ולכן אין מפגש לאפס.</li>
                ) : finishedTarget ? (
                  <li className="text-red-700 dark:text-red-300 font-semibold">
                    {finishedMeetingRefusalHe(String(targetStudentId ?? '').replace(/\D/g, '') || learnerLabelOf(targetStudentName), finishedTarget.sessionNumber)}
                  </li>
                ) : (
                  <>
                    <li className="font-semibold text-slate-800 dark:text-slate-100">
                      {resetMeeting.target.source === 'class'
                        ? `יאופס מפגש ${resetMeeting.target.sessionNumber}, המפגש הפתוח לכיתה.`
                        : `אין מפגש פתוח לכיתה, ולכן יאופס מפגש ${resetMeeting.target.sessionNumber}, המפגש שהתלמיד נמצא בו.`}
                    </li>
                    {resetMeeting.target.completed && (
                      <li>התלמיד כבר סיים את מפגש {resetMeeting.target.sessionNumber}, והאיפוס יבטל גם את הסיום.</li>
                    )}
                    {resetMeeting.target.sessionNumber === 2 && (
                      // Register deviation 10: "במפגש 2 גם תוצאות המטריקס, ההמלצה והשער".
                      <li className="text-red-700 dark:text-red-300 font-semibold">
                        במפגש 2 יימחקו גם ציון האבחון, ההמלצה והמסלול שאושר ב"{TEACHER_GATE_HE}". אם התלמיד כבר התקדם למפגש 3 ואילך, הוא לא ימשיך משם: הוא ימתין עד שיעשה שוב את מפגש 2 ותאשרו לו מסלול מחדש.
                      </li>
                    )}
                    {resetMeeting.target.sessionNumber === 8 && (
                      // Register deviation 10: "במפגש 8 גם הרפלקציה".
                      <li>במפגש 8 תימחק גם הרפלקציה של התלמיד.</li>
                    )}
                  </>
                )}
                <li>{RESET_LOG_LINE_HE}</li>
              </>
            )}
            {isFullStudent && (
              <>
                <li className="text-amber-700 dark:text-amber-300 font-semibold">לפני האיפוס נשמר גיבוי של כל הנתונים של {learnerName}.</li>
                <li className="text-red-700 dark:text-red-300 font-semibold">יימחקו: ההתקדמות בכל 8 המפגשים, תוצאות האבחון וההמלצה, המסלול שאושר ב"{TEACHER_GATE_HE}", ההקלטות והודעות הצ'אט.</li>
                {/* Owner, 2.10.2026: the teacher's settings stay (functions LEARNER_SETTINGS_FIELDS). */}
                <li>יישמרו: ההגדרות שקבעתם לתלמיד (פרופיל התמיכה המוגברת ומצב השקט החזותי), רישום הפעולות של התלמיד למחקר, הדוחות והרפלקציות.</li>
                <li>התלמיד יתחיל מההתחלה. כדי להגיע למפגש 3 הוא יצטרך לעשות שוב את מפגש 2, ותצטרכו לאשר לו מסלול מחדש.</li>
                <li>{RESET_LOG_LINE_HE}</li>
              </>
            )}
            {!isLevel2 && !isLevel3 && (
              <>
                <li>יימחקו הקריאות לעזרה של כל התלמידים והיסטוריית ההתראות של השיעור.</li>
                <li>המשבצות ברדאר יחזרו למצב רגיל. משבצת של תלמיד שפתוח אצלו עכשיו כרטיס חניכה, או שמהסס עכשיו, תישאר צבועה, כי זה המצב שלו ברגע זה.</li>
                <li>נתוני הלמידה לא משתנים: ההתקדמות, רישום הפעולות והמפגשים נשארים כמו שהם.</li>
                <li>האיפוס נרשם ביומן האיפוסים.</li>
              </>
            )}
          </ul>
        </div>

        {/* Step 1: Mandatory Reason Selector */}
        {step === 1 && (
          <div className="space-y-4 mb-6">
            {isClassTarget && !activeSessionNumber && (
              <div role="alert" className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
                אין מפגש פתוח לכיתה, ולכן אי אפשר לאפס את המפגש לכל הכיתה. לאיפוס של תלמיד אחד, לחצו על המשבצת שלו ברדאר, אחר כך על "מעבר לניתוח מעמיק" ואז על "איפוס נתונים".
              </div>
            )}
            {isClassTarget && activeSessionNumber && (
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 transition-colors">
                <input
                  type="checkbox"
                  checked={classConfirmed}
                  onChange={(e) => setClassConfirmed(e.target.checked)}
                  className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  כן, לאפס את {meetingLabel} לכל 12 התלמידים.
                </span>
              </label>
            )}
            {isLevel2 && !isClassTarget && (
              <fieldset>
                <legend className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  מה לאפס?
                </legend>
                <div className="space-y-2" role="radiogroup" aria-label="היקף האיפוס">
                  <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors ${scope === 'active_session' ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                    <input
                      type="radio"
                      name="reset-scope"
                      value="active_session"
                      checked={scope === 'active_session'}
                      onChange={() => setScope('active_session')}
                      className="mt-0.5 w-4 h-4 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-xs">
                      {/* No meeting to reset (none determined, or a finished one): no meeting named here either. */}
                      <span className="block font-bold text-slate-800 dark:text-slate-200">
                        {activeSessionNumber ? `המפגש הזה בלבד (ברירת המחדל): ${meetingLabel}` : 'המפגש הזה בלבד (ברירת המחדל)'}
                      </span>
                      <span className="block text-slate-500 dark:text-slate-400">התלמיד מתחיל את המפגש הזה מההתחלה. העבודה במפגשים האחרים נשמרת.</span>
                    </span>
                  </label>
                  <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors ${scope === 'full_student' ? 'border-red-400 bg-red-50/60 dark:bg-red-950/30' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                    <input
                      type="radio"
                      name="reset-scope"
                      value="full_student"
                      checked={scope === 'full_student'}
                      onChange={() => setScope('full_student')}
                      className="mt-0.5 w-4 h-4 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-xs">
                      <span className="block font-bold text-slate-800 dark:text-slate-200">איפוס מוחלט של התלמיד</span>
                      <span className="block text-slate-500 dark:text-slate-400">ההתקדמות בכל 8 המפגשים, תוצאות האבחון, המסלול, ההקלטות והצ'אט נמחקים. ההגדרות של התלמיד נשמרות.</span>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}
            <div>
              <label htmlFor="reset-reason" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                סיבת האיפוס (שדה חובה):
              </label>
              <select
                id="reset-reason"
                required
                aria-required="true"
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value as ResetReason | '')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="" disabled>
                  בחרו סיבה מהרשימה
                </option>
                {reasons.map((val) => (
                  <option key={val} value={val}>
                    {REASON_LABELS[val]}
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
                onChange={(e) => { setReasonNote(e.target.value); if (noteError) setNoteError(null); }}
                placeholder="הסבר קצר על נסיבות האיפוס, בלי שמות. אפשר לכתוב מספר תלמיד."
                aria-invalid={noteError ? true : undefined}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
              />
              {noteError && (
                <p role="alert" className="mt-1.5 text-xs font-bold text-red-700 dark:text-red-300">{noteError}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: System Double Confirmation */}
        {step === 2 && isLevel3 && (
          <div className="space-y-4 mb-6 animate-in fade-in">
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
              <p className="font-extrabold mb-1">⚠️ נדרש אישור נוסף ל{RESET_ACTION_HE.system}</p>
              {/* The backup is written only after this confirmation; this used to say it already existed. */}
              <p className="text-xs leading-relaxed">
                כל נתוני הלמידה של 12 התלמידים יימחקו. אחרי האישור נשמר גיבוי, ורק אחריו הנתונים נמחקים.
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
                כן, למחוק את כל נתוני הלמידה של הכיתה.
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
            disabled={isSubmitting || !selectedReason || (isLevel3 && step === 2 && !doubleConfirmed) || (isClassTarget && (!activeSessionNumber || !classConfirmed)) || (isOneLearner && scope === 'active_session' && !activeSessionNumber)}
            className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed ${
              isLevel3
                ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50'
                : isLevel2
                ? 'bg-amber-600 hover:bg-amber-700 disabled:opacity-50'
                : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50'
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isLevel2 || isLevel3 ? 'שומרים גיבוי ומאפסים…' : 'מאפסים התראות…'}</span>
              </>
            ) : isLevel3 && step === 1 ? (
              <span>המשיכו לשלב אישור סופי</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>בצעו איפוס מבוקר</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
