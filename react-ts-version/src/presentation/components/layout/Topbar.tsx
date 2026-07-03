import { useAuthStore } from '@/application/useAuthStore';
import { useLocation } from 'react-router-dom';
import { Bell, UserCircle } from 'lucide-react';
import { UdlButton } from '@/presentation/design-system/UdlButton';

/** כותרת פשוטה שנגזרת מהנתיב הנוכחי — במקום פירורי לחם מזויפים. */
function titleForPath(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return 'דשבורד מורה';
  if (pathname.startsWith('/hub')) return 'בית';
  return '';
}

export function Topbar() {
  const { user } = useAuthStore();
  const { pathname } = useLocation();
  const title = titleForPath(pathname);

  return (
    <header className="h-20 bg-ws-surface border-b border-ws-surface2 flex items-center justify-between px-8 z-10 sticky top-0 shadow-sm">

      {/* Current page title (derived from route) */}
      <div className="font-display font-extrabold text-lg text-ws-ink">{title}</div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <UdlButton variant="ghost" size="icon" className="relative text-ws-soft hover:text-ws-ink rounded-full">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-ws-danger rounded-full border border-ws-surface"></span>
        </UdlButton>

        {/* User Profile */}
        <div className="flex items-center gap-3 bg-ws-surface rounded-full py-1.5 px-1.5 pr-4 shadow-sm border border-ws-surface2">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-sm font-bold text-ws-ink">{user?.displayName || 'אורח'}</span>
            <span className="text-xs text-ws-soft">{user?.role === 'student' ? 'תלמיד' : 'מורה'}</span>
          </div>
          <div className="w-9 h-9 rounded-full ws-brand flex items-center justify-center">
            <UserCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

    </header>
  );
}
