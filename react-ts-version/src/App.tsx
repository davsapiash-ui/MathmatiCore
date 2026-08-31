import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { authReady, auth } from "@/infrastructure/firebase";
import { Login } from "@/presentation/pages/Login";
import { isWhitelistedTeacherEmail } from "@/infrastructure/services/AuthService";
import { LandingPage } from "@/presentation/pages/LandingPage";
import { StudentWorkspacePage } from "@/features/workspace/StudentWorkspacePage";
import { StudentHub } from "@/presentation/pages/StudentHub";
import { AppShell } from "@/presentation/components/layout/AppShell";
import { Toaster } from "sonner";
import { RoleSelectionModal } from "@/presentation/components/RoleSelectionModal";
import { useAuthStore } from "@/application/useAuthStore";
import { SocraticEngine } from "./infrastructure/services/SocraticEngine";
import { useStore } from "@/application/useStore";

// Teacher/Admin surfaces are code-split out of the student bundle: a student
// opening /workspace should never pay for downloading the teacher dashboard,
// charting libraries, and admin panels it never renders.
const TeacherDashboard = lazy(() =>
  import("@/presentation/pages/TeacherDashboard").then((m) => ({ default: m.TeacherDashboard }))
);
const ProjectorSandboxPage = lazy(() =>
  import("@/presentation/pages/ProjectorSandboxPage").then((m) => ({ default: m.ProjectorSandboxPage }))
);
const AdminLayout = lazy(() =>
  import("@/presentation/pages/AdminLayout").then((m) => ({ default: m.AdminLayout }))
);
const AdminOverview = lazy(() =>
  import("@/presentation/pages/admin/AdminOverview").then((m) => ({ default: m.AdminOverview }))
);
const AdminSchoolsView = lazy(() =>
  import("@/presentation/pages/admin/AdminSchoolsView").then((m) => ({ default: m.AdminSchoolsView }))
);
const AdminCurriculumView = lazy(() =>
  import("@/presentation/pages/admin/AdminCurriculumView").then((m) => ({ default: m.AdminCurriculumView }))
);
const AdminSecurityView = lazy(() =>
  import("@/presentation/pages/admin/AdminSecurityView").then((m) => ({ default: m.AdminSecurityView }))
);
const AdminSettingsView = lazy(() =>
  import("@/presentation/pages/admin/AdminSettingsView").then((m) => ({ default: m.AdminSettingsView }))
);
const AdminChatView = lazy(() =>
  import("@/presentation/pages/admin/AdminChatView").then((m) => ({ default: m.AdminChatView }))
);
const AdminSupportHubView = lazy(() =>
  import("@/presentation/pages/admin/AdminSupportHubView").then((m) => ({ default: m.AdminSupportHubView }))
);

// Expose SocraticEngine and Auth for E2E proof testing
if (import.meta.env.MODE === 'development' || import.meta.env.MODE === 'test') {
  (window as any).SocraticEngine = SocraticEngine;
  import('@/infrastructure/firebase').then(mod => {
    (window as any).__FIREBASE_AUTH__ = mod.auth;
  });
  (window as any).firebaseAuth = auth;
  (window as any).useStore = useStore;
}
import { useIdleTimeout } from "@/application/useIdleTimeout";

/**
 * Mount-gate on the Firebase session: children mount only after sign-in completes.
 */
function FirebaseGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        setReady(true);
      }
    }, 1500);

    authReady.then(() => {
      if (!cancelled) {
        setReady(true);
      }
    }).catch(() => {
      if (!cancelled) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
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

/**
 * Direct Route Guard (Master PRD v5.0 Module 2)
 * Performs asynchronous permission checks on route changes.
 * Restricts anonymous student access to teacher/admin routes, immediately redirecting back to student hub.
 */
function AuthGuard({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const { user, role, isAuthenticated, logout, showRoleSelector } = useAuthStore();
  
  // Enforce idle timeout and 8-hour token expiration for authenticated users
  useIdleTimeout();
  
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Dual claims blocking modal
  if (showRoleSelector) {
    return <RoleSelectionModal />;
  }
  
  const activeRole = (typeof role === "string" ? role : (user.role as string)) || "teacher";

  // Whitelist exact match enforcement for teachers & admins
  if (activeRole === "teacher" || activeRole === "admin") {
    const email = ((user.email as string) || (auth.currentUser?.email as string) || "").toLowerCase().trim();
    if (!isWhitelistedTeacherEmail(email)) {
      logout();
      return <Navigate to="/login" replace />;
    }
  }

  const hasAccess = allowedRoles.includes(activeRole);

  if (!hasAccess) {
    if (activeRole === "student") {
      // Immediate bounce back to Student Hub without changing state
      return <Navigate to="/hub" replace />;
    }
    if (activeRole === "teacher") {
      return <Navigate to="/dashboard" replace />;
    }
    if (activeRole === "admin") {
      return <Navigate to="/admin" replace />;
    }
  }

  return <>{children}</>;
}

function RoleRouter() {
  const { user, role, isAuthenticated, logout, showRoleSelector } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user && !showRoleSelector) {
      const activeRole = (typeof role === "string" ? role : (user.role as string)) || "teacher";
      if (activeRole === "teacher" || activeRole === "admin") {
        const email = ((user.email as string) || (auth.currentUser?.email as string) || "").toLowerCase().trim();
        if (!isWhitelistedTeacherEmail(email)) {
          logout();
          return;
        }
      }
      if (activeRole === "admin") navigate("/admin", { replace: true });
      else if (activeRole === "teacher") navigate("/dashboard", { replace: true });
      else if (activeRole === "student") navigate("/hub", { replace: true });
    }
  }, [isAuthenticated, user, role, showRoleSelector, navigate, logout]);

  if (showRoleSelector) {
    return <RoleSelectionModal />;
  }

  return <Login />;
}

function App() {
  return (
    <BrowserRouter>
      {/* Toast host: without it every toast.success/error in the app is a no-op */}
      <Toaster position="top-center" richColors closeButton dir="rtl" />
      <Suspense
        fallback={
          <div dir="rtl" className="flex h-screen items-center justify-center bg-ws-bg text-ws-soft font-bold">
            טוען…
          </div>
        }
      >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<RoleRouter />} />
        
        {/* App Shell wraps authenticated routes */}
        <Route element={<AppShell />}>
          <Route path="/hub" element={
            <AuthGuard allowedRoles={["student", "teacher", "admin"]}>
              <StudentHub />
            </AuthGuard>
          } />

          {/* Master PRD v5.0 Route Aliases */}
          <Route path="/student/lobby" element={
            <AuthGuard allowedRoles={["student", "teacher", "admin"]}>
              <StudentHub />
            </AuthGuard>
          } />
        </Route>

        {/* Teacher Dashboard: standalone full-screen workstation with single scroll and dedicated sidebar */}
        <Route path="/dashboard" element={
          <AuthGuard allowedRoles={["teacher", "admin"]}>
            <FirebaseGate>
              <TeacherDashboard />
            </FirebaseGate>
          </AuthGuard>
        } />

        <Route path="/teacher/dashboard" element={
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

        {/* Student workspace: standalone fullscreen experience */}
        <Route path="/workspace" element={
          <AuthGuard allowedRoles={["student", "teacher", "admin"]}>
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

        <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />

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
          <Route path="support" element={<AdminSupportHubView />} />
          <Route path="security" element={<AdminSecurityView />} />
          <Route path="settings" element={<AdminSettingsView />} />
          <Route path="chat" element={<AdminChatView />} />
          <Route path="teacher-view" element={<TeacherDashboard hideSidebar={true} />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
