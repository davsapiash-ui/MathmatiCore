import { useAuthStore } from '@/application/useAuthStore';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Clock, Settings, GraduationCap } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { LogoutButton } from '../ui/LogoutButton';

export function Sidebar() {
  const { user } = useAuthStore();
  const isStudent = user?.role === 'student';

  const teacherLinks = [
    { name: 'דשבורד ראשי', path: '/dashboard', icon: LayoutDashboard },
    { name: 'ניהול כיתה', path: '/dashboard/class', icon: GraduationCap },
    { name: 'הגדרות', path: '/dashboard/settings', icon: Settings },
  ];

  const studentLinks = [
    { name: 'הקורסים שלי', path: '/hub', icon: BookOpen },
    { name: 'היסטוריית משימות', path: '/hub/history', icon: Clock },
  ];

  const links = isStudent ? studentLinks : teacherLinks;

  return (
    <aside className="w-64 bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border-l border-white/20 dark:border-white/5 flex flex-col h-full shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20 transition-all duration-300">
      <div className="h-20 flex items-center gap-3 px-6 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-display font-black text-lg rotate-[-4deg] shrink-0 shadow-lg shadow-indigo-500/25">
          M
        </div>
        <Logo textClassName="font-display text-ws-ink" />
      </div>

      <nav className="flex-1 py-8 px-4 flex flex-col gap-2 overflow-y-auto no-scrollbar">
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            end={link.path === '/hub' || link.path === '/dashboard'}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all duration-300 ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-ws-soft hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-ws-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <link.icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span>{link.name}</span>
                {isActive && (
                  <span className="absolute right-0 w-1.5 h-6 bg-indigo-600 rounded-r-full shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40">
        <LogoutButton className="w-full justify-start gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors rounded-xl px-4 py-3" />
      </div>
    </aside>
  );
}
