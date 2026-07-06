# Project: MathmatiCore LMS QA & Fixes

## Architecture
- **Root Directory**: `c:\Users\david\Projects\MathmatiCore`
- **Application Directory**: `react-ts-version`
- **Frontend Framework**: React 18, TypeScript, Tailwind CSS, Zustand for local and synchronized state management.
- **Backend Services**: Firebase Realtime Database for state synchronization, Socratic Engine for diagnostics.
- **Pedagogical Model**: Q-Matrix with 8 tasks mapping student cognitive errors to adaptive curriculum routing.
- **Data Flow**:
  1. Student interaction in Workspace page -> Zustand stores (`useStore.ts`, `useAuthStore.ts`) -> Realtime Database (`classrooms/.../students/.../workspaceState`).
  2. Socratic Engine listening to workspace states -> runs heuristic diagnostic rules -> writes diagnoses to `ai_pending_approvals/{teacherId}`.
  3. Teacher Dashboard views approvals -> approves/rejects -> writes to student routing state.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Diagnosis | Map existing files, types, and logic gaps | none | PLANNED |
| 2 | Socratic Engine (R1) | Complete tasks 2, 5, 8 and write results to Firebase | M1 | PLANNED |
| 3 | Teacher Dashboard (R2) | Show clinical diagnoses and action plans in approvals card | M2 | PLANNED |
| 4 | useSilentRadar (R3) | Connect Silent Radar to Workspace telemetry and Firebase | M1 | PLANNED |
| 5 | Admin Chat & Logs (R4, R5) | Wire Image Upload to base64, display Audit Logs page | M1 | PLANNED |
| 6 | Dead Code (R6) | Remove unused files and imports, verify build & lint | M2, M3, M4, M5 | PLANNED |
| 7 | Security, QA & UX | Final verification, Firebase rules audit, responsiveness | M6 | PLANNED |
| 8 | E2E & CI/CD Verification | Push to GitHub, monitor Firebase deployment | M7 | PLANNED |

## Interface Contracts
### Socratic Engine ↔ Firebase Realtime Database
- Target Path: `ai_pending_approvals/{teacherId}/{approvalId}`
- Schema:
  ```typescript
  interface PendingAIApproval {
    studentId: string;
    studentName: string;
    suggestedRoute: string; // e.g. 'green_path', 'yellow_path'
    clinicalDiagnosisHe: string;
    actionPlanHe: string;
    isYellowPath: boolean;
  }
  ```

### useSilentRadar ↔ Firebase Realtime Database
- Telemetry path: `classrooms/{classId}/students/{studentId}/traceData` or `workspaceState/traceData`
- Fields updated: `hesitation_events` (incremented), `undo_clicks` (incremented).
