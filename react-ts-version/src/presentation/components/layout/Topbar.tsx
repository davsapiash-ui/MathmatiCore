import { useAuthStore } from '@/application/useAuthStore';
import { useLocation } from 'react-router-dom';
import { Bell, UserCircle } from 'lucide-react';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { motion } from 'framer-motion';

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

  return (
    <header className="h-20 bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border-b border-white/20 dark:border-white/5 flex items-center justify-between px-8 z-10 sticky top-0 shadow-sm transition-colors duration-300">

      {/* Current page title (derived from route) */}
      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="font-display font-extrabold text-2xl text-ws-ink tracking-tight"
      >
        {title}
      </motion.div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <UdlButton variant="ghost" size="icon" className="relative text-ws-soft hover:text-ws-ink rounded-full transition-transform hover:scale-105 active:scale-95">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-ws-danger rounded-full border-2 border-white dark:border-slate-900 shadow-sm animate-pulse"></span>
        </UdlButton>

        {/* User Profile */}
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-full py-1.5 px-1.5 pr-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50 cursor-pointer transition-all"
        >
          <div className="flex flex-col items-end leading-tight">
            <span className="text-sm font-bold text-ws-ink">{(user?.displayName as string) || 'אורח'}</span>
            <span className="text-xs font-medium text-ws-soft">{user?.role === 'student' ? 'תלמיד' : 'מורה'}</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md">
            <UserCircle className="w-6 h-6" />
          </div>
        </motion.div>
      </div>

    </header>
  );
}
