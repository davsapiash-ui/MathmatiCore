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
          <span className="text-lg font-display font-extrabold tracking-tight text-ws-ink">מתמטיקאור &copy;</span>
          <span className="text-xs font-bold text-ws-soft">היי {studentName} 👋</span>
        </div>
      </div>

      {/* Progress */}
      <div className="mx-auto bg-ws-bg rounded-full px-4 py-2 border border-ws-surface2" role="progressbar" aria-label="התקדמות במשימות">
        <ProgressDots total={totalTasks} current={currentIdx} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 shrink-0 bg-white/50 p-1.5 rounded-full border border-ws-surface2 shadow-sm">
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="h-10 px-4 rounded-full text-sm font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          aria-label="התנתק"
        >
          יציאה
        </button>

        <div className="w-px h-6 bg-slate-200" />

        <button
          onClick={toggleBoard}
          className="h-10 px-5 rounded-full text-sm font-bold text-ws-blue bg-ws-blue-soft/50 hover:bg-ws-blue hover:text-white transition-all flex items-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
        >
          <span aria-hidden="true">🧮</span>
          {boardOpen ? 'הסתר לוח' : 'הצג לוח'}
        </button>

        <button
          onClick={undo}
          disabled={!canUndo}
          className="h-10 px-4 rounded-full text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="בטל פעולה אחרונה"
        >
          <span aria-hidden="true">↩</span> בטל
        </button>

        <button
          onClick={() => document.dispatchEvent(new CustomEvent('toggle-chat'))}
          className="h-10 px-4 rounded-full text-sm font-bold text-ws-blue bg-white border border-ws-blue/20 hover:border-ws-blue/50 hover:shadow-md transition-all flex items-center gap-1.5"
        >
          <span aria-hidden="true">💬</span> צ'אט
        </button>

        <button
          onClick={requestHelp}
          className="h-10 w-10 rounded-full text-lg bg-gradient-to-b from-amber-100 to-amber-200 border border-amber-300 text-amber-700 hover:scale-110 active:scale-95 transition-transform shadow-sm flex items-center justify-center"
          aria-label="בקש עזרה"
          title="לחץ לעזרה"
        >
          💡
        </button>

        <button
          onClick={proceed}
          disabled={!canProceed}
          className="h-10 px-6 rounded-full text-base font-display font-extrabold text-white bg-gradient-to-r from-ws-blue-2 to-ws-blue hover:brightness-110 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
          aria-label="עבור למשימה הבאה"
        >
          הבא
          <span aria-hidden="true" className="text-lg leading-none">←</span>
        </button>
      </div>
    </nav>
  );
}
