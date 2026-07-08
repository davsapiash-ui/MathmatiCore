import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore, selectCanProceed, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { TASKS } from '@/core/QMatrix';
import { ProgressDots } from './ProgressDots';
import { useWorkspaceTour } from './useWorkspaceTour';

/**
 * הסרגל העליון של מרחב הפעילות — ניווט לינארי בלבד (הבא/בטל), ללא תפריטים.
 * אין שום חיווי זמן (איסור טיימרים מהאפיון).
 */
export function WorkspaceTopbar() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const standardTaskIdx = useWorkspaceStore((s) => s.standardTaskIdx);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const canUndo = useWorkspaceStore((s) => s.undoStack.length > 0);
  const canProceed = useWorkspaceStore(selectCanProceed);
  const boardOpen = useWorkspaceStore((s) => s.boardOpen);
  const undo = useWorkspaceStore((s) => s.undo);
  const proceed = useWorkspaceStore((s) => s.proceed);
  const toggleBoard = useWorkspaceStore((s) => s.toggleBoard);
  const requestHelp = useWorkspaceStore((s) => s.requestHelp);
  const { startTour } = useWorkspaceTour();
  const globalChatEnabled = useStore((s) => s.globalChatEnabled);

  // Derived from the REAL task lists — a hardcoded 5 broke when task6 joined session 2,
  // and ignored teacher-approved AI task lists in session 3.
  const activeTaskCount = useWorkspaceStore((s) => getActiveTasks(s).length);
  const totalTasks = sessionNumber === 2 ? TASKS.length : activeTaskCount;
  const currentIdx = sessionNumber === 2 ? Math.min(qflow.taskIdx, TASKS.length - 1) : standardTaskIdx;
  const studentName: string = (user?.displayName as string) || 'תלמיד';

  return (
    <nav className="h-[72px] shrink-0 bg-ws-surface/90 backdrop-saturate-150 border-b border-ws-surface2 shadow-[0_4px_20px_-8px_hsl(var(--ws-shadow-warm)/0.25)] flex items-center justify-between px-5 gap-4 z-20">
      {/* Brand + student */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-11 h-11 rounded-2xl ws-brand flex items-center justify-center font-display font-black text-xl rotate-[-4deg]">
          מ
        </div>
        <div className="hidden sm:flex flex-col leading-tight">
          <span className="text-lg font-display font-extrabold tracking-tight text-ws-ink">מתמטיקאור &copy;</span>
          <span className="text-xs font-bold text-ws-soft">היי {studentName} 👋</span>
        </div>
      </div>

      {/* Progress */}
      <div className="mx-auto bg-ws-bg rounded-full px-4 py-2 border border-ws-surface2" role="progressbar" aria-label="התקדמות במשימות">
        <ProgressDots total={totalTasks} current={currentIdx} />
      </div>

      {/* Actions */}
      <div id="tour-action-buttons" className="flex items-center gap-2 sm:gap-3 shrink-0 bg-ws-surface/50 p-1.5 rounded-full border border-ws-surface2 shadow-sm max-w-full overflow-x-auto no-scrollbar">
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="h-10 px-4 rounded-full text-sm font-bold text-ws-soft hover:text-red-600 hover:bg-red-50 transition-colors"
          aria-label="התנתק"
        >
          יציאה
        </button>

        <div className="w-px h-6 bg-ws-surface2" />

        <button
          onClick={toggleBoard}
          className="h-10 px-4 sm:px-5 rounded-full text-sm font-bold text-ws-blue bg-ws-blueSoft/50 hover:bg-ws-blue hover:text-white transition-all flex items-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
        >
          <span aria-hidden="true">🧮</span>
          <span className="hidden sm:inline">{boardOpen ? 'הסתר לוח מוחשי' : 'הצג לוח מוחשי'}</span>
        </button>

        <button
          onClick={undo}
          disabled={!canUndo}
          className="h-10 px-3 sm:px-4 rounded-full text-sm font-bold text-ws-ink bg-ws-surface2 hover:bg-ws-surface2/80 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="בטל פעולה אחרונה"
        >
          <span aria-hidden="true">↩</span> <span className="hidden sm:inline">בטל</span>
        </button>

        {globalChatEnabled && (
          <button
            onClick={() => document.dispatchEvent(new CustomEvent('toggle-chat'))}
            className="h-10 px-3 sm:px-4 rounded-full text-sm font-bold text-ws-accent bg-ws-surface border border-ws-accent/20 hover:border-ws-accent/50 hover:shadow-md transition-all flex items-center gap-1.5"
          >
            <span aria-hidden="true">💬</span> <span className="hidden sm:inline">צ'אט</span>
          </button>
        )}

        <button
          onClick={requestHelp}
          className="h-10 w-10 rounded-full text-lg bg-amber-100/50 dark:bg-amber-500/20 border border-amber-300/50 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 hover:scale-110 active:scale-95 transition-transform shadow-sm flex items-center justify-center"
          aria-label="בקש עזרה"
          title="לחץ לעזרה"
        >
          💡
        </button>

        <button
          onClick={startTour}
          className="h-10 w-10 rounded-full text-lg bg-ws-blue-soft/50 border border-ws-blue/30 text-ws-blue hover:scale-110 active:scale-95 transition-transform shadow-sm flex items-center justify-center"
          aria-label="הפעל הדרכה מחדש"
          title="הדרכה"
        >
          🧭
        </button>

        <button
          onClick={proceed}
          disabled={!canProceed}
          className="h-10 px-6 rounded-full text-base font-display font-extrabold text-white bg-ws-accent hover:brightness-110 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
          aria-label="עבור למשימה הבאה"
        >
          התקדם
          <span aria-hidden="true" className="text-lg leading-none">←</span>
        </button>
      </div>
    </nav>
  );
}
