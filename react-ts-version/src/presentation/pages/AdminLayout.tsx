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
      <div className="flex min-h-screen bg-ws-bg w-full font-sans text-ws-ink selection:bg-indigo-500/30 overflow-hidden" dir="rtl">
        <Sidebar variant="sidebar" collapsible="none" className="m-4 rounded-[2rem] border border-ws-surface2 bg-white/40 dark:bg-slate-900/40 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] w-72 flex-shrink-0 z-20 h-[calc(100vh-2rem)] flex flex-col overflow-hidden transition-all duration-500">
          <SidebarHeader className="p-8 border-b border-ws-surface2/50 bg-white/30 dark:bg-black/20">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Shield className="text-white w-4 h-4 flex-shrink-0" />
              </div>
              <Logo textClassName="bg-gradient-to-l from-indigo-600 to-cyan-500 bg-clip-text text-transparent font-black tracking-tight drop-shadow-sm hover:opacity-80 transition-opacity" />
            </div>
            <p className="text-xs text-ws-soft mt-2 tracking-widest uppercase font-semibold">פורטל מנהל מערכת</p>
          </SidebarHeader>

          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarMenu className="gap-2">
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink id="tour-admin-overview" to="/admin" end className={({isActive}) => isActive ? "bg-ws-surface2 text-ws-ink font-bold rounded-2xl shadow-sm border border-ws-surface2" : "hover:bg-ws-surface/50 text-ws-soft transition-all duration-300 rounded-2xl"}>
                      <Settings className="w-5 h-5 ml-3 opacity-80" /> 
                      <span className="text-base tracking-wide">סקירה כללית</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink id="tour-admin-schools" to="/admin/schools" className={({isActive}) => isActive ? "bg-ws-surface2 text-ws-ink font-bold rounded-2xl shadow-sm border border-ws-surface2" : "hover:bg-ws-surface/50 text-ws-soft transition-all duration-300 rounded-2xl"}>
                      <GraduationCap className="w-5 h-5 ml-3 opacity-80" /> 
                      <span className="text-base tracking-wide">מוסדות ומורים</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink id="tour-admin-curriculum" to="/admin/curriculum" className={({isActive}) => isActive ? "bg-ws-surface2 text-ws-ink font-bold rounded-2xl shadow-sm border border-ws-surface2" : "hover:bg-ws-surface/50 text-ws-soft transition-all duration-300 rounded-2xl"}>
                      <Layers className="w-5 h-5 ml-3 opacity-80" /> 
                      <span className="text-base tracking-wide">הגדרות פדגוגיה</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink id="tour-admin-security" to="/admin/security" className={({isActive}) => isActive ? "bg-ws-surface2 text-ws-ink font-bold rounded-2xl shadow-sm border border-ws-surface2" : "hover:bg-ws-surface/50 text-ws-soft transition-all duration-300 rounded-2xl"}>
                      <Shield className="w-5 h-5 ml-3 opacity-80" /> 
                      <span className="text-base tracking-wide">אבטחה והרשאות</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink id="tour-admin-chat" to="/admin/chat" className={({isActive}) => isActive ? "bg-ws-surface2 text-ws-ink font-bold rounded-2xl shadow-sm border border-ws-surface2" : "hover:bg-ws-surface/50 text-ws-soft transition-all duration-300 rounded-2xl"}>
                      <Users className="w-5 h-5 ml-3 opacity-80" /> 
                      <span className="text-base tracking-wide">צ'אט הודעות</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/teacher-view" className={({isActive}) => isActive ? "bg-ws-surface2 text-ws-ink font-bold rounded-2xl shadow-sm border border-ws-surface2" : "hover:bg-ws-surface/50 text-ws-soft transition-all duration-300 rounded-2xl"}>
                      <Layers className="w-5 h-5 ml-3 opacity-80" /> 
                      <span className="text-base tracking-wide">תצוגת מורה</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink id="tour-admin-settings" to="/admin/settings" className={({isActive}) => isActive ? "bg-ws-surface2 text-ws-ink font-bold rounded-2xl shadow-sm border border-ws-surface2" : "hover:bg-ws-surface/50 text-ws-soft transition-all duration-300 rounded-2xl"}>
                      <Settings className="w-5 h-5 ml-3 opacity-80" /> 
                      <span className="text-base tracking-wide">מערכת ונגישות (UDL)</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <div className="p-6 border-t border-white/20 dark:border-white/5 mt-auto bg-white/20 dark:bg-black/10">
            <div className="flex items-center gap-4 mb-4 p-3 rounded-2xl bg-white/50 dark:bg-slate-900/50 shadow-inner border border-white/40 dark:border-white/5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
                {(user?.displayName as string)?.[0] || "A"}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="font-bold text-base truncate">{(user?.displayName as string) || "System Admin"}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 tracking-wider uppercase font-semibold">Root Access</div>
              </div>
            </div>
            <LogoutButton className="w-full justify-center rounded-2xl border-0 shadow-md bg-white dark:bg-slate-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400 transition-all duration-300" />
          </div>
        </Sidebar>

        <main className="flex-1 overflow-hidden relative p-4 pl-0 flex flex-col">
          {/* Ghost Mode Indicator */}
          <div className="bg-amber-500/10 border border-amber-500/50 text-amber-700 dark:text-amber-400 rounded-2xl px-4 py-2.5 mb-4 flex items-center justify-center gap-3 text-sm font-bold shadow-sm backdrop-blur-md z-10 shrink-0 mx-4">
            <span className="text-xl">👻</span>
            <span>מצב רפאים (Ghost Mode) פעיל: הפעולות שלך אינן נרשמות ואינן נראות למשתמשים אחרים.</span>
          </div>

          {/* Ambient Glows */}
          <div className="fixed top-0 left-1/4 w-[800px] h-[800px] bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-full blur-[100px] pointer-events-none -z-10 mix-blend-screen dark:mix-blend-lighten animate-in fade-in duration-1000"></div>
          <div className="fixed bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-tl from-cyan-500/10 via-blue-500/5 to-transparent rounded-full blur-[80px] pointer-events-none -z-10 mix-blend-screen dark:mix-blend-lighten animate-in fade-in duration-1000 delay-300"></div>
          
          <div className="h-full rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/40 dark:bg-slate-900/20 backdrop-blur-3xl shadow-xl overflow-y-auto relative z-0">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
