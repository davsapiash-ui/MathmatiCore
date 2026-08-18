import { useAuthStore } from "@/application/useAuthStore";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";

interface TeacherSidebarProps {
  activeTab: string;
  handleTabChange: (tab: string) => void;
  allAlerts: any[];
  pendingRouteStudents: any[];
  unreadAdminCount: number;
  unreadStudentsCount?: number;
}

export function TeacherSidebar({
  activeTab,
  handleTabChange,
  allAlerts,
  pendingRouteStudents,
  unreadAdminCount,
  unreadStudentsCount = 0,
}: TeacherSidebarProps) {
  const { user } = useAuthStore();
  return (
    <aside className="w-full md:w-64 bg-ws-surface/80 backdrop-blur-xl border-b md:border-b-0 md:border-l border-ws-surface2 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20 transition-all overflow-y-auto max-h-screen">
      <div className="p-6 border-b border-ws-surface2">
        <h2 className="font-display font-black text-2xl text-ws-ink tracking-tight mb-2">
          תחנת עבודה מורה
        </h2>
        
        <div className="mt-4">
          <button
            onClick={() => window.open('/projector', '_blank')}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl transition-all shadow-md font-bold text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
            <span>ארגז חול למקרן</span>
          </button>
        </div>
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-2">
        <div className="text-[10px] font-bold text-slate-400 mb-2 mt-2 px-2 uppercase tracking-widest">
          פדגוגיה ומעקב
        </div>
        <button
          id="tour-tab-heatmap"
          onClick={() => handleTabChange("heatmap")}
          className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "heatmap" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft"}`}
        >
          מפת חום ורדאר (<span dir="ltr">Heatmap & Radar</span>)
        </button>
        <button
          id="tour-tab-clustering"
          onClick={() => handleTabChange("clustering")}
          className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "clustering" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft"}`}
        >
          מיפוי כיתתי (<span dir="ltr">Q-Matrix</span>)
        </button>
        <button
          id="tour-tab-alerts"
          onClick={() => handleTabChange("alerts")}
          className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "alerts" ? "bg-red-50 text-red-700 font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft"}`}
        >
          <span>רדאר סמוי</span>
          {allAlerts.filter((a) => a.unread).length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-red-500/30 animate-pulse">
              {allAlerts.filter((a) => a.unread).length}
            </span>
          )}
        </button>
        <button
          id="tour-tab-reports"
          onClick={() => handleTabChange("diagnostic_reports")}
          className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "diagnostic_reports" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft"}`}
        >
          דו"חות אבחון אישיים
        </button>
        <button
          onClick={() => handleTabChange("approvals")}
          className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "approvals" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft"}`}
        >
          <span>אישור משימות <span dir="ltr">AI</span></span>
          {pendingRouteStudents.length > 0 && (
            <span className="bg-ws-accent text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
              {pendingRouteStudents.length}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange("class_management")}
          className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "class_management" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft"}`}
        >
          ניהול כיתה ותלמידים
        </button>

        <div className="text-[10px] font-bold text-slate-400 mb-2 mt-6 px-2 uppercase tracking-widest">
          תקשורת וצ'אט
        </div>
        <button
          id="tour-tab-chat"
          onClick={() => handleTabChange("chat_students")}
          className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "chat_students" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft"}`}
        >
          <span>צ'אט עם תלמידים</span>
          {unreadStudentsCount > 0 && (
            <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md animate-pulse">
              {unreadStudentsCount}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange("chat_admin")}
          className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "chat_admin" ? "bg-ws-accentSoft text-ws-accent font-bold shadow-sm" : "hover:bg-ws-bg text-ws-soft"}`}
        >
          <span>צ'אט הנהלה</span>
          {unreadAdminCount > 0 && (
            <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md animate-bounce">
              {unreadAdminCount}
            </span>
          )}
        </button>
      </nav>

      <div className="p-4 border-t border-ws-surface2 mt-auto bg-ws-bg/50">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-md text-sm shrink-0">
            {(user?.displayName as string)?.[0] || "T"}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="font-bold text-sm text-ws-ink truncate">{(user?.displayName as string) || "מורה"}</div>
            <div className="text-[10px] text-ws-soft truncate">{(user?.email as string) || ""}</div>
          </div>
        </div>
        <LogoutButton className="w-full justify-center bg-red-50 dark:bg-red-950/30 hover:bg-red-100 border border-red-200 dark:border-red-900/30 rounded-xl py-2.5 font-bold text-sm text-red-600 dark:text-red-400 shadow-sm transition-all" />
      </div>
    </aside>
  );
}
