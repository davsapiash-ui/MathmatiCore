# Project: MathmatiCore LMS Audit & Repair

## Architecture
MathmatiCore is an LMS application built with React, TypeScript, Tailwind CSS, Zustand for state management, and Firebase for real-time synchronization.
- **UI Components**: Located in `react-ts-version/src/components` (e.g., `DienesBlock`, `PlaceValueBoard`, `LmsCanvas`).
- **State Management**: Zustand stores in `react-ts-version/src/application` (e.g., `useStore.ts`, `useWorkspaceStore.ts`, `useWorkspaceRadar.ts`).
- **Firebase integration**: Sync service in `react-ts-version/src/application/FirebaseSyncService.ts` or similar.
- **Pedagogical Rules**: "No auto-regrouping", manual grouping by dragging blocks, Socratic feedback.
- **Liveness & Radar Tracking**: Tracks student hesitation and deletion patterns (Silent Radar) and syncs to Teacher Dashboard.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Assessment | Explore codebase to find file locations and logic mappings | None | DONE |
| M2 | UI & Mechanics Repair (R1) | Enforce manual regrouping, update instructions, hide thousands in Sessions 1&2, verify tasks numbers <= 1000 | M1 | DONE |
| M3 | State & Radar Synchronization (R2) | Implement 3s sliding window/15s cooldown for PASSIVE_DRIFTING, prevent teacher dashboard leakage, preserve radar hooks fix, fix telemetry/replays | M2 | DONE |
| M4 | Verification & CI/CD Deployment | Run test suite, simulate trace verification, audit integrity, deploy to Firebase | M3 | DONE |

## Interface Contracts
### Workspace state ↔ Firebase Sync
- Zustand store state synced to Firebase Realtime Database.
- No local storage persistence for student state.

### Student workspace ↔ Silent Radar & Teacher Dashboard
- Deletion/undo events in workspace store/radar must trigger `PASSIVE_DRIFTING` alerts.
- Alerts must be filtered by `teacherId` in the dashboard to prevent leakage.
