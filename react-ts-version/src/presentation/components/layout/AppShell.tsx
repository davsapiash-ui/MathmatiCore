import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans" dir="rtl">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50 relative">
          {/* Outlet renders the nested child routes */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
