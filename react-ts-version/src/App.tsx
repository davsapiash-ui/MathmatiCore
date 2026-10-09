import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { authReady, auth } from "@/infrastructure/firebase";
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
import { decideRoute, type AppRole } from "@/core/routeAccess";

/**
 * PRD Module 24 §ב: "מנהלי מערכת חסומים מגישה לנתוני טלמטריה פרטניים או
 * למסמכי תלמידים אישיים". The teacher dashboard, the learner reports, the
 * learner's screen and the projector are the teacher's; an admin sign-in has
 * the console only (register, gap יא — the owner picks the role at each
 * sign-in). The admin's "תצוגת מורה" page is gone for the same reason.
 */
const TEACHER_ONLY: readonly AppRole[] = ["teacher"];
// PRD Module 2 §א: the lobby and the workspace are the learner's routes; a
// teacher or an admin who opens one goes back to their own home.
const STUDENT_ONLY: readonly AppRole[] = ["student"];

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
 * Route guard (PRD Module 2 §א): not signed in → /login; staff not on the
 * authorized list → signed out → /login; a signed-in user on another role's
 * route → that user's own home (learner /hub, teacher /dashboard, admin /admin).
 */
function AuthGuard({ allowedRoles, children }: { allowedRoles: readonly AppRole[]; children: React.ReactNode }) {
  const { user, role, isAuthenticated, logout } = useAuthStore();

  // Enforce idle timeout and 8-hour token expiration for authenticated users
  useIdleTimeout();

  const activeRole = user ? ((typeof role === "string" ? role : (user.role as string)) || "teacher") : null;

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
  const email = ((user?.email as string) || (auth.currentUser?.email as string) || "").toLowerCase().trim();
  const staffAuthorized = user?.whitelistVerified === true || isWhitelistedTeacherEmail(email);

  // PRD Module 2 §א: core/routeAccess.ts holds the rule.
  const decision = decideRoute({
    isAuthenticated: Boolean(isAuthenticated && user),
    role: activeRole,
    staffAuthorized,
    allowedRoles,
  });

  if (decision.kind === "redirect") {
    if (decision.logout) logout();
    return <Navigate to={decision.to} replace />;
  }

  return <>{children}</>;
}

/** Screens 1 ('/login') and 2 ('/auth') of PRD Module 1 §א; a signed-in user goes home. */
function RoleRouter({ studentForm = false }: { studentForm?: boolean }) {
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
      // PRD Module 1 §א: a signed-in learner goes to the lobby ("מעביר ללובי
      // התלמיד"), which swaps in place to a live station's opening screen.
      else if (activeRole === "student") navigate("/hub", { replace: true });
    }
  }, [isAuthenticated, user, role, navigate, logout]);

  return <Login studentForm={studentForm} />;
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
        <Route path="/login" element={<RoleRouter key="login" />} />
        {/* PRD Module 1 (Strict): "'Student' routes strictly to Screen 2 ('/auth')". */}
        <Route path="/auth" element={<RoleRouter key="auth" studentForm />} />
        
        {/* App Shell wraps authenticated routes */}
        <Route element={<AppShell />}>
          <Route path="/hub" element={
            <AuthGuard allowedRoles={STUDENT_ONLY}>
              <StudentHub />
            </AuthGuard>
          } />

          {/* Master PRD v5.0 Route Aliases */}
          <Route path="/student/lobby" element={
            <AuthGuard allowedRoles={STUDENT_ONLY}>
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
          <AuthGuard allowedRoles={STUDENT_ONLY}>
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
