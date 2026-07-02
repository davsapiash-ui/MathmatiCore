import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Login } from "@/presentation/pages/Login";
import { StudentWorkspace } from "@/presentation/pages/StudentWorkspace";
import { TeacherDashboard } from "@/presentation/pages/TeacherDashboard";
import { AdminPanel } from "@/presentation/pages/AdminPanel";
import { useAuthStore } from "@/application/useAuthStore";
import { useSettingsStore } from "@/application/useSettingsStore";

function AuthGuard({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  
  if (!allowedRoles.includes(user.role)) {
    // Redirect based on role if they try to access unauthorized path
    if (user.role === "student") return <Navigate to="/workspace" replace />;
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
      if (user.role === "student") navigate("/workspace", { replace: true });
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
        <Route path="/login" element={<RoleRouter />} />
        
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
        
        <Route path="/admin" element={
          <AuthGuard allowedRoles={["admin"]}>
            <AdminPanel />
          </AuthGuard>
        } />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
