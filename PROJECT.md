# Project: MathmatiCore Adversarial Audit & Multi-Agent Simulation

## Architecture
MathmatiCore is an interactive mathematical education platform (React + TypeScript + Firebase Realtime Database) featuring:
- Role & Permission Management (Student, Teacher, Admin, Anonymous, Dev Mode)
- Place-Value Arithmetic & Visual-Relational Arithmetic (VRA) Engine (Dienes blocks, dynamic column locking, hammer decomposition, 10-for-1 regrouping, memory circles)
- Socratic Anti-Guessing Engine & Hesitation Detection (lockout timers, distraction detection, 45s hesitation triggers)
- Realtime Sync & Communication (Firebase RTDB, FIFO offline queues, optimistic updates, chat channels, teacher gates, radar alerts)
- Self-Regulated Learning (SRL) & Persistence Analytics (Persistence Index calculation, telemetry logging, PDF export)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1 Role Transitions & Route Guards | Fuzz student/teacher/admin state transitions, role spoofing, token expiry, unauthorized route navigation, RTDB rule bypasses, multi-store logout | M1 | Survey Findings |
| 2 | R2 Arithmetic Engine & VRA Invariants | Fix 0-value subtraction gate bug, hundreds overcrowding check, cascading carries/borrows, 4-digit bounds, hammer decomposition, undo snapshot nesting | M2 | Survey Findings |
| 3 | R3 Socratic Engine & Anti-Guessing Chaos | Boundary testing on hesitation (43s/45s/46s), 20-click bursts, timer expiry race conditions, background/foreground tab switching, Dienes responsiveness | M3 | Survey Findings |
| 4 | R4 RTDB Sync & Network Chaos | Expand offline FIFO queue capacity to 500+ items, duplicate message suppression, base64 payload stress, teacher gate approval rollback on network failure | M4 | Survey Findings |
| 5 | R5 SRL Metrics & Analytics Edge Cases | Align Persistence Index ratio calculation in TeacherDashboard, handle 0/0/0 divide-by-zero, massive click counts (>1000), 3-step reflection state machine | M5 | Survey Findings |
| 6 | E2E & Vitest Regression Suite | Maintain 100% pass rate on existing 140 Vitest tests + all new comprehensive adversarial stress test suites (244 tests total) | M6 | Survey Findings |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Survey & Architecture Mapping | Survey code across R1-R5 to locate exact files, hooks, stores, and test files | none | DONE |
| M1 | Security & State Transition Remediation | Implement R1 adversarial tests, fix RTDB rules (`database.rules.json`), route guards, Meeting 3 gate bypass in `StudentWorkspacePage.tsx`, unified logout, PII sanitization in telemetry & seeds | M0 | DONE |
| M2 | Arithmetic Engine & VRA Invariants Remediation | Implement R2 adversarial tests, fix 0-value subtraction bug (`boardVal === 0 && target !== 0`), fix hundreds overcrowding check (`hundreds >= 10`), fix `pushSnapshot` nesting | M0 | DONE |
| M3 | Socratic Engine & Anti-Guessing Remediation | Implement R3 adversarial tests for 43s/45s/46s hesitation boundary, 30s lockout persistence, 20-click bursts | M0 | DONE |
| M4 | RTDB & Offline Queue Chaos Remediation | Implement R4 network chaos tests, expand offline queue limit to 500 items in `FirebaseSyncService.ts`, implement teacher gate approval rollback | M0 | DONE |
| M5 | SRL Metrics & Analytics Remediation | Implement R5 math fuzz tests, align Persistence Index formula in `TeacherDashboard.tsx`, test reflection screen debouncing | M0 | DONE |
| M6 | Final Verification, Adversarial Hardening & Audit | Full regression run (458 Vitest tests passed, 42 test files), Module-based test architecture, Forensic Integrity Audit (CLEAN) | M1-M5 | DONE |

## Interface Contracts
- **Auth & Session Management**: Unified logout synchronously resets `useAuthStore`, `useStore`, `useWorkspaceStore`, `useAdminStore`, and `useChatStore`.
- **Database Rules**: Strict rule checks on `$roomId` and root RTDB node. No `|| true` wildcards. Parent `chat_messages` requires email token.
- **Arithmetic Place-Value**: `isBoardEmpty` checks `boardVal === 0 && target !== 0`. `hasOvercrowded` checks `units >= 10 || tens >= 10 || hundreds >= 10`. Value invariant $\Delta V = 0$ rigorously verified.
- **Offline Telemetry Queue**: FIFO queue capacity $\ge 500$ with auto-flush on reconnection.
- **Persistence Metric**: Canonical formula `(U / (U + E + G)) * 100` with 0/0/0 returning 100%.

## Code Layout
- Frontend Application: `react-ts-version/src/`
  - Components: `react-ts-version/src/presentation/` and `src/features/`
  - Context / State: `react-ts-version/src/application/` (stores)
  - Core Logic: `react-ts-version/src/core/`
  - Services / Firebase: `react-ts-version/src/infrastructure/services/`
  - Test Suites: `react-ts-version/src/**/__tests__/` (42 test files, 458 passing tests organized strictly by PRD v6.4 modules)
- Security Rules: `c:\Users\david\Projects\MathmatiCore\database.rules.json`
- Agent Workspace: `.agents/`
