# Global Context

## System Architecture Overview
- **Frontend**: React + TypeScript + Vite.
- **Backend/Database**: Firebase Realtime Database.
- **State Management**: Zustand stores.
- **Key Modules**:
  1. **Student Hub & Workspace** (`/hub`, `/workspace`): Main interface where students perform math exercises with virtual manipulatives (blocks, number lines, etc.). Includes silent radar tracking for idle times and hesitation events.
  2. **Socratic Engine** (`src/infrastructure/services/SocraticEngine.ts`): Analyzes student performance and errors, generates pedagogical diagnoses and action plans, and queue-routes them.
  3. **Teacher Dashboard** (`/dashboard`): Where teachers approve curriculum changes, view class metrics, see Q-Matrix logs, real-time student activity, and chat.
  4. **Admin Dashboard** (`/admin`): System overview, audit log list, server statistics.
  5. **Admin-Teacher Chat**: Real-time communication between administrators and teachers.

## Data Flow (Firebase -> Store -> UI)
1. **Telemetry & Workspace State**:
   - UI (`StudentWorkspacePage.tsx`) captures interaction events (clicks, drags).
   - `useWorkspaceRadar` and `useSilentRadar` monitor idle times (30s) and send events.
   - Events are synced via Zustand state stores (`useStore.ts`) to Firebase Realtime Database at path `classrooms/{classId}/students/{studentId}/workspaceState` or similar.
2. **Pedagogical Routing**:
   - `SocraticEngine` listens/polls completed student tasks, performs Q-Matrix mapping, writes `clinicalDiagnosisHe` and `actionPlanHe` to `ai_pending_approvals/{teacherId}`.
   - Teacher Dashboard reads from `ai_pending_approvals/{teacherId}` and renders pending approval cards.
3. **Audit Logging**:
   - Operations log actions via `AuditLogger` to the `audit_logs` Firebase path.
   - Admin page reads `audit_logs` in real-time.

## Key Files to Audit and Modify
- `src/infrastructure/services/SocraticEngine.ts` (R1)
- `src/presentation/pages/teacher/TeacherDashboard.tsx` (R2)
- `src/application/useSilentRadar.ts` and `src/presentation/pages/student/StudentWorkspacePage.tsx` (R3)
- Chat views: `src/presentation/components/chat/` or `AdminChatView.tsx` (R4)
- Admin pages: `src/presentation/pages/admin/` (R5)
- Dead code files: `src/features/workspace/mockRrwebEvents.ts` (R6)
