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
interface WorkspaceTopbarProps {
  isDragging?: boolean;
}

export function WorkspaceTopbar({ isDragging = false }: WorkspaceTopbarProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const standardTaskIdx = useWorkspaceStore((s) => s.standardTaskIdx);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const canUndo = useWorkspaceStore((s) => s.undoStack.length > 0) && !isDragging;
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
        <div className="relative group">
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="h-10 px-4 rounded-full text-sm font-bold text-ws-soft hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
            aria-label="התנתק"
          >
            יציאה
          </button>
          <div className="absolute top-12 left-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-44 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <span>🚪 התנתקות בטוחה מהמערכת</span>
          </div>
        </div>

        <div className="w-px h-6 bg-ws-surface2" />

        {sessionNumber !== 8 && (
          <>
            <div className="relative group">
              <button
                onClick={toggleBoard}
                className={`h-10 px-4 sm:px-5 rounded-full text-sm font-bold border-2 active:scale-95 transition-all flex items-center gap-2 shadow-sm cursor-pointer ${
                  boardOpen 
                    ? 'text-ws-blue border-ws-blue bg-white hover:bg-ws-blue/10'
                    : 'text-white bg-ws-blue border-ws-blue hover:brightness-110'
                }`}
                aria-label={boardOpen ? 'הסתר בית המספרים' : 'פתח בית המספרים'}
              >
                <span aria-hidden="true">🏠</span>
                <span className="hidden sm:inline">{boardOpen ? 'הסתר' : 'בית המספרים'}</span>
              </button>
              <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
                <span>🏠 פתח/הסתר את קנבס המבנה העשרוני וקוביות הדינס</span>
              </div>
            </div>

            <div className="relative group">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="h-10 px-3 sm:px-4 rounded-full text-sm font-bold text-ws-ink bg-ws-surface2 hover:bg-ws-surface2/80 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="בטל פעולה אחרונה"
              >
                <span aria-hidden="true">↩</span> <span className="hidden sm:inline">בטל</span>
              </button>
              <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-48 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
                <span>↩ בטל את הגרירה או הפעולה האחרונה בקנבס</span>
              </div>
            </div>
          </>
        )}

        {globalChatEnabled && (
          <div className="relative group">
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('toggle-chat'))}
              className="h-10 px-3 sm:px-4 rounded-full text-sm font-bold text-ws-accent bg-ws-surface border border-ws-accent/20 hover:border-ws-accent/50 hover:shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span aria-hidden="true">💬</span> <span className="hidden sm:inline">צ'אט</span>
            </button>
            <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
              <span>💬 פתח חלון צ'אט והתכתבות ישירה עם המורה</span>
            </div>
          </div>
        )}

        <div className="relative group">
          <button
            onClick={requestHelp}
            className="h-10 px-3.5 rounded-full text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-amber-500/25 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 border border-amber-300/40 cursor-pointer"
            aria-label="בקש עזרה וחניכה"
          >
            <span aria-hidden="true">💡</span>
            <span className="hidden sm:inline font-bold">בקש עזרה</span>
          </button>

          {/* Norman Principle: Explanatory Hover Tooltip */}
          <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-64 p-3 bg-slate-900/95 text-white text-xs rounded-2xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <div className="font-bold text-amber-300 mb-1 flex items-center gap-1">
              <span>💡</span> בקשת עזרה וחניכה
            </div>
            <span>בלחיצה כאן תוכל לקבל רמז סוקרטי מנחה או להתריע למורה שאתה זקוק לסיוע בכיתה.</span>
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={startTour}
            className="h-10 px-3 sm:px-4 rounded-full text-sm font-bold text-ws-blue bg-ws-blue-soft/50 border border-ws-blue/30 hover:scale-105 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            aria-label="הפעל הדרכה מחדש"
          >
            <span aria-hidden="true">🧭</span>
            <span className="hidden sm:inline font-bold">הדרכה</span>
          </button>
          <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <span>🧭 הפעל הדרכה אינטראקטיבית מלווה במרחב</span>
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={proceed}
            disabled={!canProceed}
            className="h-10 px-6 rounded-full text-base font-display font-extrabold text-white bg-ws-accent hover:brightness-110 active:scale-95 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed cursor-pointer"
            aria-label="עבור למשימה הבאה"
          >
            התקדם
            <span aria-hidden="true" className="text-lg leading-none">←</span>
          </button>
          <div className="absolute top-12 left-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <span>← התקדם למשימה הבאה במפת הלמידה</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
