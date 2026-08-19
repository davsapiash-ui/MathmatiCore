import { Outlet, NavLink } from "react-router-dom";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Settings, Shield, Users, Layers, GraduationCap, Bell, UserCircle, LifeBuoy } from "lucide-react";
import { useAuthStore } from "@/application/useAuthStore";
import { useChatStore } from "@/application/useChatStore";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Logo } from "@/presentation/components/ui/Logo";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";
import { useAdminTour } from "./admin/useAdminTour";

export function AdminLayout() {
  useAdminTour();
  const { user } = useAuthStore();
  const { messages } = useChatStore();
  const unreadCount = messages.filter(m => m.receiverId === "admin" && !m.read).length;

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-slate-50 w-full font-sans text-slate-900 selection:bg-indigo-100 flex flex-col md:flex-row overflow-x-hidden" dir="rtl">
        
        {/* Mobile Header (Shown on screens < md) */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Shield className="w-4 h-4" />
            </div>
            <Logo textClassName="font-bold text-lg text-slate-900" />
          </div>
          <div className="flex items-center gap-2">
            <LogoutButton className="px-3 py-1.5 text-xs rounded-xl" />
          </div>
        </header>

        {/* Mobile Navigation Tabs */}
        <nav className="md:hidden flex overflow-x-auto p-2 bg-white border-b border-slate-200 gap-1 custom-scrollbar z-20">
          <NavLink to="/admin" end className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            סקירה כללית
          </NavLink>
          <NavLink to="/admin/schools" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            מוסדות ומורים
          </NavLink>
          <NavLink to="/admin/curriculum" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            פדגוגיה
          </NavLink>
          <NavLink to="/admin/support" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            מוקד תמיכה
          </NavLink>
          <NavLink to="/admin/security" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            אבטחה
          </NavLink>
          <NavLink to="/admin/chat" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            צ'אט
          </NavLink>
          <NavLink to="/admin/teacher-view" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            תצוגת מורה
          </NavLink>
          <NavLink to="/admin/settings" className={({isActive}) => `px-3 py-2 text-xs font-bold whitespace-nowrap rounded-xl transition-all ${isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            הגדרות (UDL)
          </NavLink>
        </nav>

        {/* Desktop Sidebar (Hidden on mobile) */}
        <Sidebar variant="sidebar" collapsible="none" className="hidden md:flex m-4 rounded-2xl border border-slate-200 bg-white shadow-sm w-64 lg:w-72 flex-shrink-0 z-20 h-[calc(100vh-2rem)] flex-col overflow-hidden sticky top-4">
          <SidebarHeader className="p-6 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm">
                <Shield className="w-5 h-5 flex-shrink-0 text-white" />
              </div>
              <Logo textClassName="text-slate-900 font-bold text-xl tracking-tight" />
            </div>
            <p className="text-[11px] text-slate-500 mt-2 tracking-widest uppercase font-bold">פורטל מנהל מערכת</p>
          </SidebarHeader>

          <SidebarContent className="p-4 bg-white">
            <SidebarGroup>
              <SidebarMenu className="gap-1.5">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-overview" to="/admin" end className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 text-slate-700 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <Settings className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">סקירה כללית</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-schools" to="/admin/schools" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 text-slate-700 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <GraduationCap className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">מוסדות ומורים</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-curriculum" to="/admin/curriculum" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 text-slate-700 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <Layers className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">הגדרות פדגוגיה</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink id="tour-admin-support" to="/admin/support" className={({isActive}) => isActive ? "bg-indigo-600 text-white font-bold rounded-xl shadow-sm p-3.5 flex items-center" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors rounded-xl p-3.5 flex items-center"}>
                      <LifeBuoy className="w-5 h-5 ml-3 opacity-90" /> 
                      <span className="text-sm lg:text-base tracking-wide">מוקד תמיכה וקריאות</span>
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
          {/* Top Bar Header matching Teacher Topbar for UI consistency */}
          <header className="hidden md:flex items-center justify-between p-4 px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-2xl mb-4 shadow-sm z-10 sticky top-0 transition-all">
            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 flex items-center justify-center text-white font-bold shadow-md">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-display font-black text-xl md:text-2xl text-slate-900 dark:text-white tracking-tight">
                  פורטל מנהל מערכת
                </h1>
                <p className="text-xs text-slate-500 font-medium">ניהול מוסדות, מורים, פדגוגיה ואבטחה</p>
              </div>
            </div>

            {/* User Details & Actions */}
            <div className="flex items-center gap-3">
              {/* Notification Bell */}
              <div className="relative group">
                <UdlButton variant="ghost" size="icon" aria-label="התראות מערכת" className="relative text-slate-600 dark:text-slate-300 hover:text-slate-900 rounded-full transition-transform hover:scale-105 active:scale-95 cursor-pointer">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-white dark:border-slate-900 rounded-full animate-pulse" />
                  )}
                </UdlButton>
                <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-52 p-2 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
                  <span>🔔 התראות מערכת והודעות שלא נקראו ({unreadCount})</span>
                </div>
              </div>

              {/* User Profile Badge */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-md rounded-full py-1.5 px-3.5 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                  <UserCircle className="w-5 h-5" />
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100">{(user?.displayName as string) || "מנהל מערכת"}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-semibold text-slate-500">{user?.email || "admin@edu-haifa.org.il"}</span>
                    <span className="bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                      מנהל מערכת
                    </span>
                  </div>
                </div>
              </div>

              {/* Logout Button */}
              <LogoutButton className="bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 rounded-full px-3.5 py-2 text-xs font-bold transition-all border border-rose-200/60 dark:border-rose-800/40 shadow-sm" />
            </div>
          </header>

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
