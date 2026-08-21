import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore, selectCanProceed, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useChatStore, normalizeStudentId } from '@/application/useChatStore';
import { TASKS } from '@/core/QMatrix';
import { ProgressDots } from './ProgressDots';
import { RotateCcw, Home, MessageSquare, ArrowLeft, Cloud, CloudOff, Eye, EyeOff } from 'lucide-react';
import { LogoutButton } from '@/presentation/components/ui/LogoutButton';

/**
 * הסרגל העליון של מרחב הפעילות — ניווט לינארי בלבד (הבא/בטל), ללא תפריטים.
 * אין שום חיווי זמן (איסור טיימרים מהאפיון).
 * כפתור Undo בגודל 48x48px מדויק לפי מודול 11 ב-PRD.
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
  const globalChatEnabled = useStore((s) => s.globalChatEnabled);
  const messages = useChatStore((s) => s.messages);

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

        {/* Module 1 & 6: Zero-PII Student Identity Badge */}
        <div className="flex items-center gap-2 bg-indigo-50/90 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/80 px-3 py-1.5 rounded-xl shadow-xs">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-xs">
            {user?.student_id || (user?.uid ? user.uid.replace(/\D/g, '') : '1') || '1'}
          </div>
          <span className="text-xs font-black text-indigo-950 dark:text-indigo-200">
            תלמיד {user?.student_id || (user?.uid ? user.uid.replace(/\D/g, '') : '1') || '1'}
          </span>
        </div>

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
          <button
            onClick={undo}
            disabled={!canUndo}
            className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl text-sm font-bold text-ws-ink bg-ws-surface2 hover:bg-ws-surface2/80 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            aria-label="בטל פעולה אחרונה"
            title="בטל פעולה אחרונה"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}

        {sessionNumber !== 8 && (
          <button
            onClick={toggleBoard}
            className={`h-12 px-4 rounded-2xl text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-sm active:scale-95 ${
              boardOpen 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300' 
                : 'bg-ws-surface2/60 border-ws-surface2 text-ws-ink hover:bg-ws-surface2'
            }`}
            aria-label={boardOpen ? "הסתר לוח עבודה" : "הצג לוח עבודה"}
            title={boardOpen ? "הסתר את לוח העבודה והבלוקים" : "הצג את לוח העבודה והבלוקים"}
          >
            {boardOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">{boardOpen ? "הסתר לוח" : "הצג לוח"}</span>
          </button>
        )}

        {/* Home / Lobby */}
        <button
          onClick={() => navigate('/hub')}
          className="h-12 px-4 rounded-2xl text-sm font-bold text-ws-ink bg-ws-surface2 hover:bg-ws-surface2/80 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          aria-label="חזרה ללובי"
          title="חזרה ללובי הראשי"
        >
          <Home className="w-4 h-4" />
          <span className="hidden sm:inline">לובי</span>
        </button>

        {/* Chat Drawer Toggle */}
        <button
          id="chat-toggle-button"
          onClick={() => document.dispatchEvent(new CustomEvent('toggle-chat'))}
          disabled={!globalChatEnabled}
          className={`h-12 px-4 rounded-2xl text-sm font-bold active:scale-95 transition-all flex items-center gap-1.5 relative border shadow-sm ${
            !globalChatEnabled
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 cursor-pointer'
          }`}
          aria-label={globalChatEnabled ? "פתיחת צ'אט מול המורה" : "הצ'אט מושבת זמנית"}
          title={globalChatEnabled ? "פתיחת צ'אט מול המורה" : "הצ'אט הושבת על ידי המורה"}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:inline">צ'אט מורה</span>
          {messages.filter(m => !m.read && normalizeStudentId(m.receiverId) === normalizeStudentId(user?.uid || '')).length > 0 && (
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 absolute -top-1 -right-1 animate-pulse" />
          )}
        </button>

        <button
          onClick={proceed}
          disabled={!canProceed}
          className="h-12 px-6 rounded-2xl text-base font-display font-extrabold text-white bg-ws-accent hover:brightness-110 active:scale-95 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed cursor-pointer"
          aria-label="עבור למשימה הבאה"
          title="התקדם למשימה הבאה"
        >
          <span>התקדם</span>
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Module 1: Clean Synchronous Logout */}
        <LogoutButton className="h-12 px-3 rounded-2xl text-xs sm:text-sm font-bold text-ws-soft hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 border border-transparent hover:border-red-200" />
      </div>
    </nav>
  );
}
