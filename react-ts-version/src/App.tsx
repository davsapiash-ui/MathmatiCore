import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { authReady, auth } from "@/infrastructure/firebase";
import { Login } from "@/presentation/pages/Login";
import { LandingPage } from "@/presentation/pages/LandingPage";
import { StudentWorkspacePage } from "@/features/workspace/StudentWorkspacePage";
import { StudentHub } from "@/presentation/pages/StudentHub";
import { TeacherDashboard } from "@/presentation/pages/TeacherDashboard";
import { ProjectorSandboxPage } from "@/presentation/pages/ProjectorSandboxPage";
import { AppShell } from "@/presentation/components/layout/AppShell";

import { AdminLayout } from "@/presentation/pages/AdminLayout";
import { AdminOverview } from "@/presentation/pages/admin/AdminOverview";
import { AdminSchoolsView } from "@/presentation/pages/admin/AdminSchoolsView";
import { AdminCurriculumView } from "@/presentation/pages/admin/AdminCurriculumView";
import { AdminSecurityView } from "@/presentation/pages/admin/AdminSecurityView";
import { AdminSettingsView } from "@/presentation/pages/admin/AdminSettingsView";
import { AdminChatView } from "@/presentation/pages/admin/AdminChatView";
import { useAuthStore } from "@/application/useAuthStore";
import { SocraticEngine } from "./infrastructure/services/SocraticEngine";

import { useStore } from "@/application/useStore";

// Expose SocraticEngine and Auth for E2E proof testing
if (import.meta.env.MODE === 'development' || import.meta.env.MODE === 'test') {
  (window as any).SocraticEngine = SocraticEngine;
  import('@/infrastructure/firebase').then(mod => {
    (window as any).__FIREBASE_AUTH__ = mod.auth;
  });
  (window as any).firebaseAuth = auth;
  (window as any).useStore = useStore;
}
import { useSettingsStore } from "@/application/useSettingsStore";
import { useIdleTimeout } from "@/application/useIdleTimeout";

/**
 * Mount-gate on the Firebase session: children (and ALL their onValue listeners /
 * writes) mount only after sign-in completes. Listeners attached pre-auth are
 * cancelled with permission-denied and never retry — this is the single systemic
 * fix for that startup race, resilient to any future subscriptions added inside.
 */
function FirebaseGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    authReady.then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!ready) {
    return (
      <div dir="rtl" className="flex h-screen items-center justify-center bg-ws-bg text-ws-soft font-bold">
        מתחבר…
      </div>
    );
  }
  return <>{children}</>;
}

function AuthGuard({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  
  // Enforce idle timeout for authenticated users
  useIdleTimeout();
  
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  
  const userRoles = Array.isArray(user.role) ? user.role : [user.role as string];
  const hasAccess = userRoles.some((role: string) => allowedRoles.includes(role));

  if (!hasAccess) {
    // Redirect based on role if they try to access unauthorized path
    if (userRoles.includes("admin")) {
      return <Navigate to="/admin" replace />;
    }
    if (userRoles.includes("teacher")) {
      return <Navigate to="/dashboard" replace />;
    }
    if (userRoles.includes("student")) {
      return <Navigate to="/hub" replace />;
    }
  }

  return <>{children}</>;
}

function RoleRouter() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      const userRoles = Array.isArray(user.role) ? user.role : [user.role as string];
      if (userRoles.includes("admin")) navigate("/admin", { replace: true });
      else if (userRoles.includes("teacher")) navigate("/dashboard", { replace: true });
      else if (userRoles.includes("student")) navigate("/hub", { replace: true });
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

          <Route path="/dashboard" element={
            <AuthGuard allowedRoles={["teacher", "admin"]}>
              <FirebaseGate>
              <TeacherDashboard />
              </FirebaseGate>
            </AuthGuard>
          } />

          {/* PRD Section 4.3 Navigation Redundancy for student reports */}
          <Route path="/reports/student/:id" element={
            <AuthGuard allowedRoles={["teacher", "admin"]}>
              <FirebaseGate>
              <TeacherDashboard />
              </FirebaseGate>
            </AuthGuard>
          } />

          <Route path="/dashboard/student/:id/view" element={
            <AuthGuard allowedRoles={["teacher", "admin"]}>
              <FirebaseGate>
              <TeacherDashboard />
              </FirebaseGate>
            </AuthGuard>
          } />
        </Route>

        {/* Student workspace: standalone fullscreen experience (100vh, single chrome, per spec) */}
        <Route path="/workspace" element={
          <AuthGuard allowedRoles={["student", "admin"]}>
            <FirebaseGate>
              <StudentWorkspacePage />
            </FirebaseGate>
          </AuthGuard>
        } />

        {/* Projector Sandbox for Teacher (no recording, clean slate) */}
        <Route path="/projector" element={
          <AuthGuard allowedRoles={["teacher", "admin"]}>
            <ProjectorSandboxPage />
          </AuthGuard>
        } />

        <Route path="/admin" element={
          <AuthGuard allowedRoles={["admin"]}>
            <FirebaseGate>
              <AdminLayout />
            </FirebaseGate>
          </AuthGuard>
        }>
          <Route index element={<AdminOverview />} />
          <Route path="schools" element={<AdminSchoolsView />} />
          <Route path="curriculum" element={<AdminCurriculumView />} />
          <Route path="security" element={<AdminSecurityView />} />
          <Route path="settings" element={<AdminSettingsView />} />
          <Route path="chat" element={<AdminChatView />} />
          <Route path="teacher-view" element={<TeacherDashboard hideSidebar={true} />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
