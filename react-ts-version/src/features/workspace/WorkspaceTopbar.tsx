import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore, selectCanProceed } from '@/application/useWorkspaceStore';
import { getCurrentQTask } from '@/core/qmatrixFlow';
import { getSessionTasks } from '@/data/sessionTasks';
import { ProgressDots } from './ProgressDots';

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

  const totalTasks = sessionNumber === 2 ? 5 : getSessionTasks(sessionNumber as 1 | 3 | 4).length;
  const currentIdx = sessionNumber === 2 ? Math.min(qflow.taskIdx, 4) : standardTaskIdx;
  void getCurrentQTask;

  const studentName: string = user?.displayName || user?.username || 'תלמיד';

  return (
    <nav className="h-16 shrink-0 bg-ws-surface border-b border-ws-surface2 shadow-sm flex items-center justify-between px-5 gap-4 z-20">
      {/* Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-ws-accent flex items-center justify-center text-white font-display font-black text-lg">מ</div>
        <span className="text-lg font-display font-extrabold tracking-tight hidden sm:inline">מתמטיקאור</span>
      </div>

      {/* Progress */}
      <div className="mx-auto" role="progressbar" aria-label="התקדמות במשימות">
        <ProgressDots total={totalTasks} current={currentIdx} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="h-9 px-3 rounded-full text-sm font-bold text-ws-danger border border-ws-danger/40 hover:bg-red-50 transition-colors"
          aria-label="התנתק"
        >
          התנתק
        </button>

        <button
          onClick={toggleBoard}
          className="h-9 px-3 rounded-full text-sm font-bold text-ws-soft border border-ws-surface2 hover:bg-ws-surface2/60 transition-colors"
        >
          {boardOpen ? 'סגור טבלה' : 'פתח טבלה'}
        </button>

        <button
          onClick={undo}
          disabled={!canUndo}
          className="h-9 px-3 rounded-full text-sm font-bold text-ws-soft border border-ws-surface2 hover:bg-ws-surface2/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="בטל פעולה אחרונה"
        >
          ↩ בטל
        </button>

        <button
          onClick={requestHelp}
          className="h-10 w-10 rounded-full text-lg bg-ws-accentSoft border border-ws-accent/40 hover:scale-105 transition-transform"
          aria-label="בקש עזרה"
          title="לחץ לעזרה"
        >
          💡
        </button>

        <button
          onClick={proceed}
          disabled={!canProceed}
          className="h-10 px-5 rounded-full text-base font-display font-extrabold text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="עבור למשימה הבאה"
        >
          הבא ←
        </button>

        <button
          onClick={() => document.dispatchEvent(new CustomEvent('toggle-chat'))}
          className="h-10 px-4 rounded-full text-sm font-bold text-ws-ink bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 transition-colors"
        >
          💬 צ'אט
        </button>

        <div className="w-px h-6 bg-ws-surface2 mx-1" />
        <span className="text-sm font-bold text-ws-soft whitespace-nowrap">🎓 {studentName}</span>
      </div>
    </nav>
  );
}
