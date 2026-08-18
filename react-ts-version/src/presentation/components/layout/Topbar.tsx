import { useAuthStore } from '@/application/useAuthStore';
import { useLocation } from 'react-router-dom';
import { Bell, UserCircle } from 'lucide-react';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { motion } from 'framer-motion';
import { useChatStore } from '@/application/useChatStore';
import { LogoutButton } from '@/presentation/components/ui/LogoutButton';

/** כותרת פשוטה שנגזרת מהנתיב הנוכחי — במקום פירורי לחם מזויפים. */
function titleForPath(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return 'דשבורד מורה';
  if (pathname.startsWith('/hub')) return 'בית';
  if (pathname.startsWith('/admin')) return 'ניהול';
  return '';
}

export function Topbar() {
  const { user } = useAuthStore();
  const { pathname } = useLocation();
  const title = titleForPath(pathname);
  
  const { messages } = useChatStore();
  const unreadCount = messages.filter(m => m.receiverId === user?.uid && !m.read).length;

  return (
    <header className="h-18 sm:h-20 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between px-6 sm:px-8 z-10 sticky top-0 shadow-sm transition-colors duration-300">
      {/* Brand / Page Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white shadow-md text-lg rotate-[-4deg]">
          מ
        </div>
        <div className="flex flex-col text-right">
          <span className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight leading-tight">
            מתמטיקאור &copy;
          </span>
          {title && (
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
              {title}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* User Profile */}
        <div className="flex items-center gap-2.5 bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl py-1.5 px-3 border border-slate-200/50 dark:border-slate-700/50">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
              {(user?.displayName as string) || (user?.role === 'student' ? `תלמיד ${user?.student_id || ''}` : 'משתמש')}
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {user?.role === 'student' ? (user?.class_name || 'כיתת פיילוט') : user?.role === 'teacher' ? 'מורה מוביל' : 'מנהל מערכת'}
            </span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-sm text-xs font-black">
            {user?.role === 'student' ? (user?.student_id || 'ת') : '👤'}
          </div>
        </div>

        {/* Logout Button */}
        <LogoutButton className="bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 rounded-2xl px-4 py-2 text-xs sm:text-sm font-extrabold transition-all border border-rose-200 dark:border-rose-800/60 shadow-sm" />
      </div>
    </header>
  );
}
