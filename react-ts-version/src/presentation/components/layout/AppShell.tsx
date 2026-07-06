import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuthStore } from '@/application/useAuthStore';

export function AppShell() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher';

  return (
    <div className="flex h-screen w-full bg-ws-bg font-body text-ws-ink overflow-hidden" dir="rtl">
      {/* Sidebar - Hidden for teachers as they have their own integrated sidebar */}
      {!isTeacher && <Sidebar />}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />

        {/* Page Content */}
        <main className="flex-1 overflow-auto no-scrollbar bg-ws-bg relative">
          {/* Outlet renders the nested child routes */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
