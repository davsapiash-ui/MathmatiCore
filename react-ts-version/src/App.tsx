import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Login } from "@/presentation/pages/Login";
import { LandingPage } from "@/presentation/pages/LandingPage";
import { StudentWorkspace } from "@/presentation/pages/StudentWorkspace";
import { StudentHub } from "@/presentation/pages/StudentHub";
import { TeacherDashboard } from "@/presentation/pages/TeacherDashboard";
import { AppShell } from "@/presentation/components/layout/AppShell";

import { AdminLayout } from "@/presentation/pages/AdminLayout";
import { AdminOverview } from "@/presentation/pages/admin/AdminOverview";
import { AdminSchoolsView } from "@/presentation/pages/admin/AdminSchoolsView";
import { AdminCurriculumView } from "@/presentation/pages/admin/AdminCurriculumView";
import { AdminSecurityView } from "@/presentation/pages/admin/AdminSecurityView";
import { AdminSettingsView } from "@/presentation/pages/admin/AdminSettingsView";
import { AdminChatView } from "@/presentation/pages/admin/AdminChatView";
import { useAuthStore } from "@/application/useAuthStore";
import { useSettingsStore } from "@/application/useSettingsStore";
import { useIdleTimeout } from "@/application/useIdleTimeout";

function AuthGuard({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  
  // Enforce idle timeout for authenticated users
  useIdleTimeout();
  
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  
  if (!allowedRoles.includes(user.role)) {
    // Redirect based on role if they try to access unauthorized path
    if (user.role === "student") return <Navigate to="/hub" replace />;
    if (user.role === "teacher") return <Navigate to="/dashboard" replace />;
    if (user.role === "admin") return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

function RoleRouter() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === "student") navigate("/hub", { replace: true });
      else if (user.role === "teacher") navigate("/dashboard", { replace: true });
      else if (user.role === "admin") navigate("/admin", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  return <Login />;
}

function App() {
  const { isASDMode } = useSettingsStore();

  useEffect(() => {
    if (isASDMode) {
      document.body.classList.add("asd-mode-active");
    } else {
      document.body.classList.remove("asd-mode-active");
    }
  }, [isASDMode]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<RoleRouter />} />
        
        {/* App Shell wraps authenticated routes */}
        <Route element={<AppShell />}>
          <Route path="/hub" element={
            <AuthGuard allowedRoles={["student", "admin"]}>
              <StudentHub />
            </AuthGuard>
          } />
          
          <Route path="/workspace" element={
            <AuthGuard allowedRoles={["student", "admin"]}>
              <StudentWorkspace />
            </AuthGuard>
          } />
          
          <Route path="/dashboard" element={
            <AuthGuard allowedRoles={["teacher", "admin"]}>
              <TeacherDashboard />
            </AuthGuard>
          } />
        </Route>
        
        <Route path="/admin" element={
          <AuthGuard allowedRoles={["admin"]}>
            <AdminLayout />
          </AuthGuard>
        }>
          <Route index element={<AdminOverview />} />
          <Route path="schools" element={<AdminSchoolsView />} />
          <Route path="curriculum" element={<AdminCurriculumView />} />
          <Route path="security" element={<AdminSecurityView />} />
          <Route path="settings" element={<AdminSettingsView />} />
          <Route path="chat" element={<AdminChatView />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
