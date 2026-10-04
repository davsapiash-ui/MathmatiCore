import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar';

export function AppShell() {
  return (
    <div className="flex h-screen w-full mesh-bg-ambient font-body text-ws-ink overflow-hidden" dir="rtl">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />

        {/* Page Content */}
        <main className="flex-1 overflow-auto custom-scrollbar bg-ws-bg relative">
          {/* Outlet renders the nested child routes */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
