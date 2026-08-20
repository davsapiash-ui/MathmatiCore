import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore, selectCanProceed, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { TASKS } from '@/core/QMatrix';
import { ProgressDots } from './ProgressDots';
import { useWorkspaceTour } from './useWorkspaceTour';
import { RotateCcw, Home, LogOut, MessageSquare, Compass, ArrowLeft, Cloud, CloudOff, Eye, EyeOff } from 'lucide-react';

/**
 * הסרגל העליון של מרחב הפעילות — ניווט לינארי בלבד (הבא/בטל), ללא תפריטים.
 * אין שום חיווי זמן (איסור טיימרים מהאפיון).
 * כפתור Undo בגודל 48x48px מדויק לפי מודול 11 ב-PRD v5.0.
 * חיווי שקט של מצב קישוריות (Module 17): ירוק=Online, אפור=Offline ללא מודאלים.
 */
interface WorkspaceTopbarProps {
  isDragging?: boolean;
}

export function WorkspaceTopbar({ isDragging = false }: WorkspaceTopbarProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
  const { startTour } = useWorkspaceTour();
  const globalChatEnabled = useStore((s) => s.globalChatEnabled);

  const activeTaskCount = useWorkspaceStore((s) => getActiveTasks(s).length);
  const totalTasks = sessionNumber === 2 ? TASKS.length : activeTaskCount;
  const currentIdx = sessionNumber === 2 ? Math.min(qflow.taskIdx, TASKS.length - 1) : standardTaskIdx;

  return (
    <nav className="h-[72px] shrink-0 bg-ws-surface/90 backdrop-saturate-150 border-b border-ws-surface2 shadow-[0_4px_20px_-8px_hsl(var(--ws-shadow-warm)/0.25)] flex items-center justify-between px-5 gap-4 z-20">
      {/* Brand + Student Identity + Silent Cloud Status Icon */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-11 h-11 rounded-2xl ws-brand flex items-center justify-center font-display font-black text-xl rotate-[-4deg]">
          מ
        </div>
        <div className="hidden md:flex flex-col leading-tight">
          <span className="text-lg font-display font-extrabold tracking-tight text-ws-ink">מתמטיקאור &copy;</span>
          <span className="text-xs font-bold text-ws-soft">מרחב חקר אישי</span>
        </div>

        {/* Student User Identity Badge */}
        {user && (
          <div className="flex items-center gap-2 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-2xl shadow-xs">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
              {user.student_id || (user.displayName ? String(user.displayName).slice(0, 1) : '🎓')}
            </div>
            <div className="flex flex-col text-right leading-tight">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                {(user.displayName as string) || (user.student_id ? `תלמיד ${user.student_id}` : (user.name as string) || 'תלמיד')}
              </span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {user.class_name || 'כיתת ביקורת'}
              </span>
            </div>
          </div>
        )}

        {/* Module 17: Silent Cloud Status Icon (Green=Online, Grey=Offline) */}
        <div className="flex items-center mr-1" title={isOnline ? 'מחובר לסנכרון ענן (Online)' : 'מצב לא מקוון - הנתונים נשמרים מקומית ויסונכרנו אוטומטית (Offline)'}>
          {isOnline ? (
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <Cloud className="w-3.5 h-3.5" />
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full border border-slate-300 dark:border-slate-700">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <CloudOff className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="mx-auto bg-ws-bg rounded-full px-4 py-2 border border-ws-surface2" role="progressbar" aria-label="התקדמות במשימות">
        <ProgressDots total={totalTasks} current={currentIdx} />
      </div>

      {/* Actions */}
      <div id="tour-action-buttons" className="flex items-center gap-2 sm:gap-3 shrink-0 bg-ws-surface/50 p-1.5 rounded-full border border-ws-surface2 shadow-sm max-w-full overflow-x-auto no-scrollbar">
        {/* Undo Button (Module 11: 48x48px exact) */}
        {sessionNumber !== 8 && (
          <div className="relative group">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl text-sm font-bold text-ws-ink bg-ws-surface2 hover:bg-ws-surface2/80 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              aria-label="בטל פעולה אחרונה"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <div className="absolute top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-48 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
              <span>↩ בטל את הגרירה או הפעולה האחרונה בקנבס</span>
            </div>
          </div>
        )}

        {sessionNumber !== 8 && (
          <div className="relative group">
            <button
              onClick={toggleBoard}
              className={`h-12 px-4 sm:px-5 rounded-2xl text-sm font-bold border-2 active:scale-95 transition-all flex items-center gap-2 shadow-sm cursor-pointer ${
                boardOpen 
                  ? 'text-ws-blue border-ws-blue/40 bg-ws-blue/5 hover:bg-ws-blue/10'
                  : 'text-white bg-ws-blue border-ws-blue hover:brightness-110 shadow-md'
              }`}
              aria-label={boardOpen ? 'הסתר בית המספרים' : 'הצג בית המספרים'}
            >
              {boardOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden sm:inline">{boardOpen ? 'הסתר לוח' : 'הצג לוח'}</span>
            </button>
            <div className="absolute top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
              <span>{boardOpen ? '👁️ הסתרת בית המספרים והגדלת שטח המשימה' : '🏠 הצגת בית המספרים וארגז הכלים'}</span>
            </div>
          </div>
        )}

        {globalChatEnabled && (
          <div className="relative group">
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('toggle-chat'))}
              className="h-12 px-4 rounded-2xl text-sm font-bold text-ws-accent bg-ws-surface border border-ws-accent/20 hover:border-ws-accent/50 hover:shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">צ'אט</span>
            </button>
            <div className="absolute top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
              <span>💬 פתח חלון צ'אט והתכתבות ישירה עם המורה</span>
            </div>
          </div>
        )}

        <div className="relative group">
          <button
            onClick={() => navigate('/hub')}
            className="h-12 px-4 rounded-2xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 hover:scale-105 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer border border-slate-200/80"
            aria-label="חזרה ללובי התלמיד"
          >
            <Home className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline font-bold">לובי</span>
          </button>
          <div className="absolute top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-48 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <span>🏠 חזרה למסך הראשי של התלמיד</span>
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={startTour}
            className="h-12 px-4 rounded-2xl text-sm font-bold text-ws-blue bg-ws-blue-soft/50 border border-ws-blue/30 hover:scale-105 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            aria-label="הפעל הדרכה מחדש"
          >
            <Compass className="w-4 h-4" />
            <span className="hidden sm:inline font-bold">הדרכה</span>
          </button>
          <div className="absolute top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <span>🧭 הפעל הדרכה אינטראקטיבית מלווה במרחב</span>
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={proceed}
            disabled={!canProceed}
            className="h-12 px-6 rounded-2xl text-base font-display font-extrabold text-white bg-ws-accent hover:brightness-110 active:scale-95 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed cursor-pointer"
            aria-label="עבור למשימה הבאה"
          >
            <span>התקדם</span>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="absolute top-14 left-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <span>← התקדם למשימה הבאה במפת הלמידה</span>
          </div>
        </div>

        <div className="w-px h-6 bg-ws-surface2" />

        <div className="relative group">
          <button
            onClick={() => {
              logout();
              window.location.href = '/login';
            }}
            className="h-12 px-4 rounded-2xl text-sm font-bold text-ws-soft hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            aria-label="התנתק"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">יציאה</span>
          </button>
          <div className="absolute top-14 left-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-44 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <span>🚪 התנתקות בטוחה מהמערכת</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
