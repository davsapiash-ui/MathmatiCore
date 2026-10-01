import { useState, useEffect } from 'react';
import { currentStudentNumber, currentStudentUid } from '@/application/useAuthStore';
import { useWorkspaceStore, selectCanProceed, getActiveTasks, selectBoardOpen, selectStandardTask } from '@/application/useWorkspaceStore';
import { session1Checklist } from '@/core/session1Checklist';
import { BOARD_OPEN_HE, BOARD_STAYS_OPEN_HE, boardStaysOpen } from '@/core/boardVisibility';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useChatStore, normalizeStudentId } from '@/application/useChatStore';
import { TASKS } from '@/core/QMatrix';
import { ProgressDots } from './ProgressDots';
import { CloudSyncStatus } from './CloudSyncStatus';
import { RotateCcw, MessageSquare, ArrowLeft, Eye, EyeOff, HandHelping } from 'lucide-react';
import { LogoutButton } from '@/presentation/components/ui/LogoutButton';
import { Logo } from '@/presentation/components/ui/Logo';
import { PROCEED_HE, studentBadgeHe } from '@/core/toolbarNames';

/**
 * הסרגל העליון של מרחב הפעילות.
 *
 * מסמך 04 §3 (נראות, עקביות) governs this bar:
 *  - "לחצן עזרה שקט… נראותו הקבועה בסרגל הכלים העליון מקנה להם ביטחון וסוכנות
 *    למידה בכל רגע נתון" — a call-teacher button did exist, but only inside the
 *    chat overlay, so reaching it took opening a window first. The silent help
 *    button is now permanent and visible here, as the document requires. The
 *    board toggle and the chat button stay exactly as they were.
 *  - "כפתור חזור ללובי ממוקם תמיד בפינה השמאלית העליונה" — the lobby button is
 *    the last element, alone in the left corner (RTL end).
 *  - Every button is fully on the screen at 1024 px wide (a tablet, מסמך 03),
 *    in every meeting (owner, 28.9.2026). The spacing, the button paddings,
 *    their words and the progress dots grow and shrink with the window's
 *    width (`flw-*` in tailwind.config.js), with no step; every button keeps
 *    its words ("יציאה", "מספר תלמיד: 12") at every width. The one change of shape —
 *    the logo with or without its words — follows the bar's own width (a
 *    container query, `.ws-topbar` in index.css). The row never scrolls
 *    sideways — a hidden scroll is how "התקדם" disappeared.
 * No time indicator anywhere (visible timers are forbidden).
 * Undo is exactly 48x48px per PRD Module 11.
 */
interface WorkspaceTopbarProps {
  isDragging?: boolean;
}

/** How long the station-1 note under the board button stays (long enough to hear it read aloud). */
const STAYS_OPEN_NOTE_MS = 10_000;

export function WorkspaceTopbar({ isDragging = false }: WorkspaceTopbarProps) {
  const studentNumber = currentStudentNumber();
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const standardTaskIdx = useWorkspaceStore((s) => s.standardTaskIdx);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const canUndo = useWorkspaceStore((s) => s.undoStack.length > 0) && !isDragging;
  // Station 1, step 5 (owner, 29.9.2026): "לחצו על כפתור ביטול פעולה" names a
  // button that shows only an arrow, so it is marked until the step's first
  // line is ticked — the same check that ticks it (core/session1Checklist.ts).
  const undoHint = useWorkspaceStore((s) => {
    if (s.sessionNumber !== 1) return false;
    const task = selectStandardTask(s);
    if (!task || task.id !== 's1_undo_trash') return false;
    const items = session1Checklist(task.id, s);
    return Boolean(items && !items[0].done);
  });
  const canProceed = useWorkspaceStore(selectCanProceed);
  const boardOpen = useWorkspaceStore(selectBoardOpen);
  // Station 1: the board is not hidden; the button explains why (owner, 27.9.2026).
  const staysOpen = boardStaysOpen(sessionNumber);
  /** When the note was last asked for (each press restarts its time), or null while it is not shown. */
  const [staysOpenNote, setStaysOpenNote] = useState<number | null>(null);
  const showStaysOpenNote = () => setStaysOpenNote(Date.now());
  // The note is calm and passing: it goes after a while, and with the meeting.
  useEffect(() => {
    if (staysOpenNote === null) return;
    const t = setTimeout(() => setStaysOpenNote(null), STAYS_OPEN_NOTE_MS);
    return () => clearTimeout(t);
  }, [staysOpenNote]);
  useEffect(() => {
    if (!staysOpen) setStaysOpenNote(null);
  }, [staysOpen]);
  // Station 1 names what the board is — open — since pressing cannot hide it
  // (owner, 28.9.2026). Elsewhere the button names what a press does.
  const boardButtonHe = staysOpen ? BOARD_OPEN_HE : boardOpen ? 'הסתרת בית המספרים' : 'הצגת בית המספרים';
  const undo = useWorkspaceStore((s) => s.undo);
  const proceed = useWorkspaceStore((s) => s.proceed);
  const toggleBoard = useWorkspaceStore((s) => s.toggleBoard);
  const requestSilentHelp = useWorkspaceStore((s) => s.requestSilentHelp);
  const hasRequestedHelp = useWorkspaceStore((s) => s.hasRequestedBasicHelp);
  const globalChatEnabled = useChatStore((s) => s.globalChatEnabled);
  const messages = useChatStore((s) => s.messages);

  const activeTaskCount = useWorkspaceStore((s) => getActiveTasks(s).length);
  const totalTasks = sessionNumber === 2 ? TASKS.length : activeTaskCount;
  // The correction round comes after all seven tasks: every dot stays done.
  // It used to jump back to the failed task, as if the tasks after it were undone.
  const currentIdx = sessionNumber === 2
    ? (qflow.phase === 'correction' ? TASKS.length : Math.min(qflow.taskIdx, TASKS.length - 1))
    : standardTaskIdx;

  return (
    // Below 1024 px (a portrait tablet — tier B; every tier-A screen is wider)
    // the bar takes a second row: in one row "ממשיכים" and "יציאה" fell off
    // the screen.
    <nav className="relative h-[72px] max-lg:h-auto max-lg:flex-wrap max-lg:py-2 shrink-0 bg-ws-surface/90 backdrop-saturate-150 border-b border-ws-surface2 shadow-[0_4px_20px_-8px_hsl(var(--ws-shadow-warm)/0.25)] flex items-center justify-between px-flw-12-20 gap-flw-8-16 z-20 ws-topbar">
      {/* Brand + Student Identity + Silent Cloud Status Icon */}
      <div className="flex items-center gap-flw-8-12 shrink-0">
        <span className="ws-topbar-wide"><Logo size="md" subtitle="מרחב חקר אישי" /></span>
        <span className="ws-topbar-narrow"><Logo size="md" showText={false} /></span>

        {/* מודול 1 ו-6: תג זהות אנונימי. המספר נגזר מ-student_id שאומת
            בכניסה — לא מניקוי ספרות ממזהה ה-Auth, שהיה מציג "תלמיד 1"
            לכל לומד שמזההו לא נפתר. */}
        {studentNumber !== null && (
          <div className="flex items-center gap-2 bg-ws-accentSoft border border-ws-accent/25 px-flw-8-12 py-1.5 rounded-xl shadow-xs" title={studentBadgeHe(studentNumber)} data-testid="student-badge">
            {/* The number once: "מספר תלמיד: 12", not a "12" chip beside it. */}
            <span className="text-xs font-black text-ws-ink whitespace-nowrap">
              {studentBadgeHe(studentNumber)}
            </span>
          </div>
        )}

        {/* Module 17 §ד: Silent Cloud Status Icon — green only when synced,
            grey while offline or while the queue is still being delivered. */}
        <CloudSyncStatus />
      </div>

      {/* Progress */}
      <div className="mx-auto min-w-0 bg-ws-bg rounded-full px-flw-12-16 py-2 border border-ws-surface2" role="progressbar" aria-label="התקדמות במשימות">
        <ProgressDots total={totalTasks} current={currentIdx} />
      </div>

      {/* Actions */}
      <div id="tour-action-buttons" className="flex items-center gap-flw-6-12 shrink-0 bg-ws-surface/50 p-1.5 rounded-full border border-ws-surface2 shadow-sm">
        {/* Undo Button (Module 11: 48x48px exact).
            It used to be hidden in meeting 8, where the blocks are gone and
            typing is all there is. PRD Module 12 §א makes meeting 8 the ONE
            meeting with a third coaching trigger — "שלוש פעולות ביטול רצופות
            בתרגיל בודד… אינדיקציה ללולאת ניחושים" — precisely because the
            blocks are gone, so the button has to be there for it to fire. */}
        <button
          onClick={undo}
          disabled={!canUndo}
          data-hint={undoHint ? 'true' : undefined}
          className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl text-sm font-bold text-ws-ink bg-ws-surface2 hover:bg-ws-surface2/80 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
            undoHint ? 'ws-hint-ring' : 'shadow-sm'
          }`}
          aria-label="ביטול הפעולה האחרונה"
          title="ביטול הפעולה האחרונה"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        {/* מסמך 04 §2א/§5: the silent help signal, permanently visible so the
            learner never has to open a window to reach it. */}
        <button
          onClick={requestSilentHelp}
          className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl transition-all flex items-center justify-center cursor-pointer border shadow-sm active:scale-95 ${
            hasRequestedHelp
              ? 'bg-amber-50 border-amber-300 text-amber-600 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-400'
              : 'bg-ws-surface border-ws-surface2 text-ws-soft hover:text-ws-accent hover:border-ws-accent/40'
          }`}
          aria-label={hasRequestedHelp ? 'ביטול הקריאה למורה' : 'קריאה שקטה למורה'}
          aria-pressed={hasRequestedHelp}
          title={hasRequestedHelp ? 'ביטול הקריאה למורה' : 'קריאה שקטה למורה'}
        >
          <HandHelping className="w-5 h-5" />
        </button>

        {/* The board toggle exists only where there is a board. In meetings 2
            and 8 the place-value board and the blocks are not mounted at all
            (PRD Module 14 §ב; מסמך 03 §3.2 and §3.8: "לוח לבני הדינס ולוח בית
            המספרים אינם מוצגים"), so "הצג לוח" there showed nothing.
            Station 1 (owner, 27.9.2026): the button stays, but the board is not
            hidden; hovering or pressing it says why. aria-disabled rather than
            the disabled attribute, so the hover and the press still reach it. */}
        {sessionNumber !== 2 && sessionNumber !== 8 && (
          <button
            type="button"
            onClick={staysOpen ? showStaysOpenNote : toggleBoard}
            className={`h-12 px-flw-12-16 rounded-2xl text-sm font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border shadow-sm ${
              staysOpen
                ? 'bg-indigo-50/60 border-indigo-200/70 text-indigo-700/60 dark:bg-indigo-950/30 dark:border-indigo-800/60 dark:text-indigo-300/60 cursor-help'
                : boardOpen
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300 cursor-pointer active:scale-95'
                  : 'bg-ws-surface2/60 border-ws-surface2 text-ws-ink hover:bg-ws-surface2 cursor-pointer active:scale-95'
            }`}
            aria-disabled={staysOpen ? true : undefined}
            aria-describedby={staysOpen && staysOpenNote !== null ? 'board-stays-open-note' : undefined}
            aria-label={boardButtonHe}
            title={staysOpen ? BOARD_STAYS_OPEN_HE : boardButtonHe}
            data-testid="board-toggle"
          >
            {/* The eye shows what the board IS: open (and in station 1, always open). */}
            {staysOpen || !boardOpen ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{boardButtonHe}</span>
          </button>
        )}

        {/* Chat Drawer Toggle */}
        <button
          id="chat-toggle-button"
          onClick={() => document.dispatchEvent(new CustomEvent('toggle-chat'))}
          disabled={!globalChatEnabled}
          className={`h-12 px-flw-12-16 rounded-2xl text-sm font-bold whitespace-nowrap active:scale-95 transition-all flex items-center gap-1.5 relative border shadow-sm ${
            !globalChatEnabled
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 cursor-pointer'
          }`}
          aria-label={globalChatEnabled ? "פתיחת צ'אט מול המורה" : "הצ'אט מושבת זמנית"}
          title={globalChatEnabled ? "פתיחת צ'אט מול המורה" : "הצ'אט הושבת על ידי המורה"}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:inline">צ'אט מורה</span>
          {messages.filter(m => !m.read && normalizeStudentId(m.receiverId) === currentStudentUid()).length > 0 && (
            <>
              {/* מסמך העיצוב §1.1 ו-§1.3: הנקודה לבדה לא אמרה כלום למי
                  שנעזר בהקראה, וההבהוב הפר את השקט החזותי. */}
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-rose-500 absolute -top-1 -right-1" />
              <span className="sr-only">יש הודעה חדשה מהמורה</span>
            </>
          )}
        </button>

        <button
          onClick={proceed}
          disabled={!canProceed}
          className="h-12 px-flw-16-24 rounded-2xl text-base font-display font-extrabold text-white whitespace-nowrap bg-ws-accent hover:brightness-110 active:scale-95 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed cursor-pointer"
          // Announced by the name it shows (label in name), the name every
          // sentence uses; it was "מעבר למשימה הבאה", also in meeting 1, whose
          // steps are not "משימות".
          title={PROCEED_HE}
          data-testid="proceed-button"
        >
          <span>{PROCEED_HE}</span>
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Module 1: Clean Synchronous Logout */}
        <LogoutButton className="h-12 px-flw-8-12 rounded-2xl text-sm font-bold whitespace-nowrap text-ws-soft hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 border border-transparent hover:border-red-200" />
      </div>

      {/* Station 1: why the board button does nothing — a quiet note under the
          buttons (not an error), with its read-aloud button (PRD Module 24). It
          sits outside the button row, whose horizontal scroll would clip it. */}
      {staysOpen && staysOpenNote !== null && (
        <div
          id="board-stays-open-note"
          role="status"
          aria-live="polite"
          data-testid="board-stays-open-note"
          className="absolute top-full left-5 mt-2 z-30 max-w-md flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-800 shadow-md dark:bg-indigo-950/90 dark:border-indigo-800 dark:text-indigo-200"
        >
          <span>{BOARD_STAYS_OPEN_HE}</span>
          <UdlSpeechButton text={BOARD_STAYS_OPEN_HE} className="shrink-0" />
        </div>
      )}
    </nav>
  );
}
