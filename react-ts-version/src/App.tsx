import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { authReady, auth } from "@/infrastructure/firebase";
import { readLiveMeetingNumber } from "@/application/useActiveClassSession";
import { Login } from "@/presentation/pages/Login";
import { isWhitelistedTeacherEmail } from "@/infrastructure/services/AuthService";
import { LandingPage } from "@/presentation/pages/LandingPage";
import { StudentWorkspacePage } from "@/features/workspace/StudentWorkspacePage";
import { StudentHub } from "@/presentation/pages/StudentHub";
import { AppShell } from "@/presentation/components/layout/AppShell";
import { useQuietMode } from '@/hooks/useQuietMode';
import { MotionConfig } from 'framer-motion';
import { Toaster } from "sonner";
import { useAuthStore } from "@/application/useAuthStore";
import { SocraticEngine } from "./infrastructure/services/SocraticEngine";
import { useStore } from "@/application/useStore";
import { ensureStaffRoleClaims, type StaffRole } from "@/infrastructure/services/staffRoleClaims";

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
const StudentLoginCardsPage = lazy(() =>
  import("@/presentation/pages/admin/StudentLoginCardsPage").then((m) => ({ default: m.StudentLoginCardsPage }))
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
 * PRD Module 24 §ב: "מנהלי מערכת חסומים מגישה לנתוני טלמטריה פרטניים או
 * למסמכי תלמידים אישיים". The teacher dashboard, the learner reports, the
 * learner's screen and the projector are the teacher's; an admin sign-in has
 * the console only (register, gap יא — the owner picks the role at each
 * sign-in). The admin's "תצוגת מורה" page is gone for the same reason.
 */
const TEACHER_ONLY = ["teacher"];

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
        מתחברים…
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Holds a staff page until its token carries a single staff role (register,
 * gap יא; PRD Module 24 §ב). Only a legacy dual-claim token — or one with no
 * role — is re-stamped, and the page's listeners attach after that, so none
 * of them is refused first and never re-attached. Bounded: after 8 seconds,
 * or on a failure, the page opens with the token it has.
 */
function StaffClaimsGate({ role, children }: { role: StaffRole; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const open = () => { if (!cancelled) setReady(true); };
    const timer = setTimeout(open, 8000);
    authReady
      .then(() => (cancelled ? undefined : ensureStaffRoleClaims(role)))
      .catch((e) => console.warn("[StaffClaimsGate] role sync notice:", e))
      .finally(() => { clearTimeout(timer); open(); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [role]);
  if (!ready) {
    return (
      <div dir="rtl" className="flex h-screen items-center justify-center bg-ws-bg text-ws-soft font-bold">
        מתחברים…
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
  const { user, role, isAuthenticated, logout } = useAuthStore();

  // Enforce idle timeout and 8-hour token expiration for authenticated users
  useIdleTimeout();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const activeRole = (typeof role === "string" ? role : (user.role as string)) || "teacher";

  // Whitelist enforcement for teachers & admins.
  //
  // Login already authorised this session against the authoritative list
  // (Firestore authorizedTeachers — see AuthService.isWhitelistedTeacherEmailAsync)
  // and stamped whitelistVerified on the user. The synchronous
  // isWhitelistedTeacherEmail() is only the hardcoded fallback: it knows the two
  // pilot emails plus dev accounts. Re-checking every session against that
  // fallback alone logged each admin-added teacher straight back out a moment
  // after a successful login, with no message. The server remains the security
  // boundary regardless: Firestore rules and every callable check the custom
  // claims syncUserRoles stamps from the same authorizedTeachers collection.
  if (activeRole === "teacher" || activeRole === "admin") {
    const email = ((user.email as string) || (auth.currentUser?.email as string) || "").toLowerCase().trim();
    if (user.whitelistVerified !== true && !isWhitelistedTeacherEmail(email)) {
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
  const { user, role, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      const activeRole = (typeof role === "string" ? role : (user.role as string)) || "teacher";
      if (activeRole === "teacher" || activeRole === "admin") {
        const email = ((user.email as string) || (auth.currentUser?.email as string) || "").toLowerCase().trim();
        // Same rule as AuthGuard above: trust the login-time verification.
        if (user.whitelistVerified !== true && !isWhitelistedTeacherEmail(email)) {
          logout();
          return;
        }
      }
      if (activeRole === "admin") navigate("/admin", { replace: true });
      else if (activeRole === "teacher") navigate("/dashboard", { replace: true });
      else if (activeRole === "student") {
        // Live by the lobby's own test, not the raw record (Module 14 §ב0).
        readLiveMeetingNumber().then((meeting) => {
          if (meeting !== null) {
            navigate(`/workspace?meeting=${meeting}`, { replace: true });
            return;
          }
          navigate("/hub", { replace: true });
        }).catch(() => {
          navigate("/hub", { replace: true });
        });
      }
    }
  }, [isAuthenticated, user, role, navigate, logout]);

  return <Login />;
}

function App() {
  // מסמך העיצוב §1.3: שקט חזותי הוא תכונה של הלומד ולא של מסך מסוים.
  // הסימון נקבע כאן, ברמת האפליקציה, כדי שיכסה גם את הלובי ואת השכבות
  // הצפות שנפתחות דרך פורטלים — ולא רק את מרחב העבודה.
  const isQuiet = useQuietMode();

  return (
    <MotionConfig reducedMotion={isQuiet ? 'always' : 'user'}>
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
            <AuthGuard allowedRoles={["student", "teacher"]}>
              <StudentHub />
            </AuthGuard>
          } />

          {/* Master PRD v5.0 Route Aliases */}
          <Route path="/student/lobby" element={
            <AuthGuard allowedRoles={["student", "teacher"]}>
              <StudentHub />
            </AuthGuard>
          } />
        </Route>

        {/* Teacher Dashboard: standalone full-screen workstation with single scroll and dedicated sidebar */}
        <Route path="/dashboard" element={
          <AuthGuard allowedRoles={TEACHER_ONLY}>
            <FirebaseGate>
              <StaffClaimsGate role="teacher"><TeacherDashboard /></StaffClaimsGate>
            </FirebaseGate>
          </AuthGuard>
        } />

        <Route path="/teacher/dashboard" element={
          <AuthGuard allowedRoles={TEACHER_ONLY}>
            <FirebaseGate>
              <StaffClaimsGate role="teacher"><TeacherDashboard /></StaffClaimsGate>
            </FirebaseGate>
          </AuthGuard>
        } />

        {/* PRD Section 4.3 Navigation Redundancy for student reports */}
        <Route path="/reports/student/:id" element={
          <AuthGuard allowedRoles={TEACHER_ONLY}>
            <FirebaseGate>
              <StaffClaimsGate role="teacher"><TeacherDashboard /></StaffClaimsGate>
            </FirebaseGate>
          </AuthGuard>
        } />

        {/* Student workspace: standalone fullscreen experience */}
        <Route path="/workspace" element={
          <AuthGuard allowedRoles={["student", "teacher"]}>
            <FirebaseGate>
              <StudentWorkspacePage />
            </FirebaseGate>
          </AuthGuard>
        } />

        {/* Projector Sandbox for Teacher (no recording, clean slate) */}
        <Route path="/projector" element={
          <AuthGuard allowedRoles={TEACHER_ONLY}>
            <ProjectorSandboxPage />
          </AuthGuard>
        } />

        <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />

        {/* Module 25 §ד: printable login cards — outside the admin layout so the page prints clean. */}
        <Route path="/admin/login-cards" element={
          <AuthGuard allowedRoles={["admin"]}>
            <FirebaseGate>
              <StaffClaimsGate role="admin"><StudentLoginCardsPage /></StaffClaimsGate>
            </FirebaseGate>
          </AuthGuard>
        } />

        <Route path="/admin" element={
          <AuthGuard allowedRoles={["admin"]}>
            <FirebaseGate>
              <StaffClaimsGate role="admin"><AdminLayout /></StaffClaimsGate>
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
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    </MotionConfig>
  );
}

export default App;
