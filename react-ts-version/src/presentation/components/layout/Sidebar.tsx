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
    <aside className="w-64 bg-ws-surface border-l border-ws-surface2 flex flex-col h-full shadow-sm z-20">
      <div className="h-20 flex items-center gap-3 px-6 border-b border-ws-surface2">
        <div className="w-10 h-10 rounded-2xl ws-brand flex items-center justify-center font-display font-black text-lg rotate-[-4deg] shrink-0">
          מ
        </div>
        <Logo textClassName="font-display text-ws-ink" />
      </div>

      <nav className="flex-1 py-8 px-4 flex flex-col gap-2">
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            end={link.path === '/hub' || link.path === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all duration-200 ${
                isActive
                  ? 'bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))] shadow-sm'
                  : 'text-ws-soft hover:bg-[hsl(var(--ws-blue-soft)/0.4)] hover:text-ws-ink'
              }`
            }
          >
            <link.icon className="w-5 h-5" />
            {link.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-ws-surface2">
        <LogoutButton className="w-full justify-start gap-3" />
      </div>
    </aside>
  );
}
