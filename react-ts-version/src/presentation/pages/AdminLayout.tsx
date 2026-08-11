import { Outlet, NavLink } from "react-router-dom";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Settings, Shield, Users, Layers, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/application/useAuthStore";
import { Logo } from "@/presentation/components/ui/Logo";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";
import { useAdminTour } from "./admin/useAdminTour";

export function AdminLayout() {
  useAdminTour();
  const { user } = useAuthStore();

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-ws-bg w-full font-sans text-ws-ink selection:bg-indigo-500/30 flex flex-col md:flex-row overflow-x-hidden" dir="rtl">
        
        {/* Mobile Header (Shown on screens < md) */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center text-white">
              <Shield className="w-4 h-4" />
            </div>
            <Logo textClassName="font-bold text-lg text-slate-900 dark:text-white" />
          </div>
          <div className="flex items-center gap-2">
            <LogoutButton className="px-3 py-1.5 text-xs rounded-xl" />
          </div>
        </header>

        {/* Mobile Navigation Tabs */}
        <nav className="md:hidden flex overflow-x-auto p-2 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 gap-1 custom-scrollbar z-20">
          <NavLink to="/admin" end className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900"}`}>
            סקירה כללית
          </NavLink>
          <NavLink to="/admin/schools" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900"}`}>
            מוסדות ומורים
          </NavLink>
          <NavLink to="/admin/curriculum" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900"}`}>
            פדגוגיה
          </NavLink>
          <NavLink to="/admin/security" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900"}`}>
            אבטחה
          </NavLink>
          <NavLink to="/admin/chat" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900"}`}>
            צ'אט
          </NavLink>
          <NavLink to="/admin/teacher-view" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900"}`}>
            תצוגת מורה
          </NavLink>
          <NavLink to="/admin/settings" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900"}`}>
            הגדרות (UDL)
          </NavLink>
        </nav>

        {/* Desktop Sidebar (Hidden on mobile) */}
        <Sidebar variant="sidebar" collapsible="none" className="hidden md:flex m-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm w-64 lg:w-72 flex-shrink-0 z-20 h-[calc(100vh-2rem)] flex-col overflow-hidden sticky top-4">
          <SidebarHeader className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center text-white font-bold">
                <Shield className="w-5 h-5 flex-shrink-0 text-indigo-400" />
              </div>
              <Logo textClassName="text-slate-900 dark:text-white font-bold text-xl tracking-tight" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 tracking-widest uppercase font-bold">פורטל מנהל מערכת</p>
          </SidebarHeader>

          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarMenu className="gap-1.5">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-overview" to="/admin" end className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <Settings className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">סקירה כללית</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-schools" to="/admin/schools" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <GraduationCap className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">מוסדות ומורים</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-curriculum" to="/admin/curriculum" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <Layers className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">הגדרות פדגוגיה</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-security" to="/admin/security" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <Shield className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">אבטחה והרשאות</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-chat" to="/admin/chat" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <Users className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">צ'אט הודעות</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin/teacher-view" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <Layers className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">תצוגת מורה</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-settings" to="/admin/settings" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <Settings className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">מערכת ונגישות (UDL)</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <div className="p-4 lg:p-6 border-t border-white/20 dark:border-white/5 mt-auto bg-white/20 dark:bg-black/10">
            <div className="flex items-center gap-3 mb-3 p-2.5 rounded-2xl bg-white/50 dark:bg-slate-900/50 shadow-inner border border-white/40 dark:border-white/5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg text-sm shrink-0">
                {(user?.displayName as string)?.[0] || "A"}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="font-bold text-sm truncate">{(user?.displayName as string) || "System Admin"}</div>
                <div className="text-[9px] text-slate-500 dark:text-slate-400 tracking-wider uppercase font-semibold">
                  {user?.role === "admin" ? "Root Access" : "Teacher Mode"}
                </div>
              </div>
            </div>
            <LogoutButton className="w-full justify-center rounded-xl border-0 shadow-md bg-white dark:bg-slate-800 text-xs py-2" />
          </div>
        </Sidebar>

        {/* Main Fluid Content Area */}
        <main className="flex-1 p-3 md:p-6 min-w-0 overflow-y-auto custom-scrollbar">
          {/* Ghost Mode Indicator */}
          <div className="bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-400 rounded-2xl px-4 py-2.5 mb-4 flex items-center justify-center gap-3 text-xs md:text-sm font-bold shadow-sm backdrop-blur-md">
            <span className="text-lg">👻</span>
            <span>מצב רפאים (Ghost Mode) פעיל: הפעולות שלך אינן נרשמות ואינן נראות למשתמשים אחרים.</span>
          </div>

          {/* Ambient Glow Backgrounds */}
          <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
          <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>
          
          <div className="min-h-[calc(100vh-6rem)] rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl shadow-xl p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
