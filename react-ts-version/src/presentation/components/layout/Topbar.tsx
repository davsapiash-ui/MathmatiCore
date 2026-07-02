import { useAuthStore } from '@/application/useAuthStore';
import { Bell, UserCircle } from 'lucide-react';
import { UdlButton } from '@/presentation/design-system/UdlButton';

export function Topbar() {
  const { user } = useAuthStore();

  return (
    <header className="h-20 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between px-8 z-10 sticky top-0 shadow-sm">
      
      {/* Breadcrumbs Placeholder */}
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
        <span className="hover:text-indigo-500 cursor-pointer transition-colors">בית</span>
        <span>/</span>
        <span className="text-slate-800 dark:text-slate-200 font-bold">סביבת למידה</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <UdlButton variant="ghost" size="icon" className="relative text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-full">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-slate-900"></span>
        </UdlButton>

        {/* User Profile */}
        <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 rounded-full py-1.5 px-1.5 pr-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{user?.displayName || 'אורח'}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{user?.role === 'student' ? 'תלמיד' : 'מורה'}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-inner">
            <UserCircle className="w-6 h-6" />
          </div>
        </div>
      </div>
      
    </header>
  );
}
