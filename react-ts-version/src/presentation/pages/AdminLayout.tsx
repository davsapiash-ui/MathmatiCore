import { Outlet, NavLink } from "react-router-dom";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Settings, Shield, Users, Layers, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/application/useAuthStore";
import { Logo } from "@/presentation/components/ui/Logo";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";

export function AdminLayout() {
  const { user } = useAuthStore();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950 w-full font-sans text-slate-800 dark:text-slate-100 selection:bg-indigo-500/30" dir="rtl">
        <Sidebar variant="sidebar" collapsible="none" className="border-l border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)] w-64 flex-shrink-0 z-20">
          <SidebarHeader className="p-6 border-b border-slate-200/50 dark:border-slate-800/50">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Shield className="text-white w-4 h-4 flex-shrink-0" />
              </div>
              <Logo textClassName="bg-gradient-to-l from-indigo-600 to-cyan-500 bg-clip-text text-transparent font-black tracking-tight drop-shadow-sm hover:opacity-80 transition-opacity" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 tracking-widest uppercase font-semibold">ממשק ניהול מרכזי</p>
          </SidebarHeader>

          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarMenu className="gap-2">
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin" end className={({isActive}) => isActive ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-lg shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 transition-all rounded-lg"}>
                      <Settings className="w-5 h-5 ml-3 opacity-70" /> 
                      <span className="text-base tracking-wide">סקירה כללית</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/schools" className={({isActive}) => isActive ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-lg shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 transition-all rounded-lg"}>
                      <GraduationCap className="w-5 h-5 ml-3 opacity-70" /> 
                      <span className="text-base tracking-wide">מוסדות ומורים</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/curriculum" className={({isActive}) => isActive ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-lg shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 transition-all rounded-lg"}>
                      <Layers className="w-5 h-5 ml-3 opacity-70" /> 
                      <span className="text-base tracking-wide">הגדרות פדגוגיה</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/security" className={({isActive}) => isActive ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-lg shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 transition-all rounded-lg"}>
                      <Shield className="w-5 h-5 ml-3 opacity-70" /> 
                      <span className="text-base tracking-wide">אבטחה והרשאות</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/chat" className={({isActive}) => isActive ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-lg shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 transition-all rounded-lg"}>
                      <Users className="w-5 h-5 ml-3 opacity-70" /> 
                      <span className="text-base tracking-wide">צ'אט הודעות</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/settings" className={({isActive}) => isActive ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-lg shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 transition-all rounded-lg"}>
                      <Settings className="w-5 h-5 ml-3 opacity-70" /> 
                      <span className="text-base tracking-wide">מערכת ונגישות (UDL)</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 mt-auto bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-4 p-2 rounded-xl bg-white dark:bg-slate-950 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-inner">
                {user?.displayName?.[0] || "A"}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="font-bold text-sm truncate">{user?.displayName || "System Admin"}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 tracking-wider uppercase font-semibold">Root Access</div>
              </div>
            </div>
            <LogoutButton className="w-full justify-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all" />
          </div>
        </Sidebar>

        <main className="flex-1 overflow-y-auto relative">
          {/* Subtle background glow effect */}
          <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent pointer-events-none -z-10"></div>
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-cyan-500/5 via-transparent to-transparent pointer-events-none -z-10 rounded-full blur-3xl"></div>
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
