import { Outlet, NavLink } from "react-router-dom";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Settings, Shield, Users, Layers, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/application/useAuthStore";

export function AdminLayout() {
  const { user, logout } = useAuthStore();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 w-full font-sans" dir="rtl">
        <Sidebar variant="sidebar" collapsible="none" className="border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 w-64 flex-shrink-0">
          <SidebarHeader className="p-6 border-b border-slate-200 dark:border-slate-800">
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Shield className="text-blue-600 w-6 h-6" />
              MathmatiCore
            </h1>
            <p className="text-sm text-slate-500 mt-1">ממשק מנהל מערכת</p>
          </SidebarHeader>

          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarMenu className="gap-2">
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin" end className={({isActive}) => isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200" : ""}>
                      <Settings className="w-5 h-5 ml-2" /> 
                      <span className="font-medium text-lg">סקירה כללית</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/schools" className={({isActive}) => isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200" : ""}>
                      <GraduationCap className="w-5 h-5 ml-2" /> 
                      <span className="font-medium text-lg">מוסדות ומורים</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/curriculum" className={({isActive}) => isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200" : ""}>
                      <Layers className="w-5 h-5 ml-2" /> 
                      <span className="font-medium text-lg">הגדרות פדגוגיה</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/security" className={({isActive}) => isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200" : ""}>
                      <Shield className="w-5 h-5 ml-2" /> 
                      <span className="font-medium text-lg">אבטחה והרשאות</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/chat" className={({isActive}) => isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200" : ""}>
                      <Users className="w-5 h-5 ml-2" /> 
                      <span className="font-medium text-lg">צ'אט הודעות</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <NavLink to="/admin/settings" className={({isActive}) => isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200" : ""}>
                      <Settings className="w-5 h-5 ml-2" /> 
                      <span className="font-medium text-lg">מערכת ונגישות (UDL)</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 mt-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold">
                {user?.displayName?.[0] || "A"}
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-slate-800 dark:text-slate-200">{user?.displayName || "Admin"}</div>
                <div className="text-xs text-slate-500">Super Administrator</div>
              </div>
            </div>
            <button 
              onClick={logout}
              className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors dark:bg-red-900/20 dark:hover:bg-red-900/40"
            >
              התנתק
            </button>
          </div>
        </Sidebar>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
