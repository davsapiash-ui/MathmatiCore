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
    <nav className="h-[72px] shrink-0 bg-ws-surface/90 backdrop-saturate-150 border-b border-ws-surface2 shadow-[0_4px_20px_-8px_hsl(var(--ws-shadow-warm)/0.25)] flex items-center justify-between px-5 gap-4 z-20">
      {/* Brand + student */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-11 h-11 rounded-2xl ws-brand flex items-center justify-center font-display font-black text-xl rotate-[-4deg]">
          מ
        </div>
        <div className="hidden sm:flex flex-col leading-tight">
          <span className="text-lg font-display font-extrabold tracking-tight text-ws-ink">מתמטיקאור</span>
          <span className="text-xs font-bold text-ws-soft">היי {studentName} 👋</span>
        </div>
      </div>

      {/* Progress */}
      <div className="mx-auto bg-ws-bg rounded-full px-4 py-2 border border-ws-surface2" role="progressbar" aria-label="התקדמות במשימות">
        <ProgressDots total={totalTasks} current={currentIdx} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="h-10 px-3 rounded-2xl text-sm font-bold text-ws-soft hover:text-ws-danger hover:bg-red-50 transition-all"
          aria-label="התנתק"
        >
          יציאה
        </button>

        <div className="w-px h-7 bg-ws-surface2" />

        <button
          onClick={toggleBoard}
          className="ws-chip h-11 px-4 rounded-2xl text-sm font-bold transition-all flex items-center gap-1.5"
        >
          <span aria-hidden="true">🧮</span>
          {boardOpen ? 'הסתר לוח' : 'הצג לוח'}
        </button>

        <button
          onClick={undo}
          disabled={!canUndo}
          className="ws-chip h-11 px-4 rounded-2xl text-sm font-bold transition-all flex items-center gap-1.5 disabled:opacity-35 disabled:cursor-not-allowed disabled:transform-none"
          aria-label="בטל פעולה אחרונה"
        >
          <span aria-hidden="true">↩</span> בטל
        </button>

        <button
          onClick={() => document.dispatchEvent(new CustomEvent('toggle-chat'))}
          className="ws-chip h-11 px-4 rounded-2xl text-sm font-bold transition-all flex items-center gap-1.5"
        >
          <span aria-hidden="true">💬</span> צ'אט
        </button>

        <button
          onClick={requestHelp}
          className="h-11 w-11 rounded-2xl text-xl bg-ws-accentSoft border-[1.5px] border-ws-accent/40 hover:scale-110 hover:rotate-6 active:scale-95 transition-transform shadow-[0_2px_8px_-2px_hsl(var(--ws-accent)/0.4)]"
          aria-label="בקש עזרה"
          title="לחץ לעזרה"
        >
          💡
        </button>

        <button
          onClick={proceed}
          disabled={!canProceed}
          className="ws-btn-primary h-12 pr-6 pl-5 rounded-2xl text-lg font-display font-extrabold transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:filter-none"
          aria-label="עבור למשימה הבאה"
        >
          הבא
          <span aria-hidden="true" className="text-xl leading-none">←</span>
        </button>
      </div>
    </nav>
  );
}
