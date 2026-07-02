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
    <aside className="w-64 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-lg z-20 transition-all">
      <div className="h-20 flex items-center px-6 border-b border-slate-200/50 dark:border-slate-800/50">
        <Logo />
      </div>

      <nav className="flex-1 py-8 px-4 flex flex-col gap-2">
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            end={link.path === '/hub' || link.path === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
              }`
            }
          >
            <link.icon className="w-5 h-5" />
            {link.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50">
        <LogoutButton className="w-full justify-start gap-3" />
      </div>
    </aside>
  );
}
