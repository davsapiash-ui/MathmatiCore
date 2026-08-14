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
| 1 | R1 Role Transitions & Route Guards | Fuzz student/teacher/admin state transitions, role spoofing, token expiry, unauthorized route navigation | M1 | ORIGINAL_REQUEST |
| 2 | R2 Arithmetic Engine & VRA Invariants | Stress test cascading carries/borrows, 0 values, 4-digit bounds, hammer decomposition, 10-for-1 regrouping, memory circles, undo/redo invariant preservation | M2 | ORIGINAL_REQUEST |
| 3 | R3 Socratic Engine & Anti-Guessing Chaos | Boundary testing on hesitation (43s/45s/46s), 20-click bursts, timer expiry race conditions, background/foreground tab switching, Dienes responsiveness | M3 | ORIGINAL_REQUEST |
| 4 | R4 RTDB Sync & Network Chaos | Network partitions, 500+ item offline queue FIFO drain, duplicate message suppression, base64 payload stress, teacher gate approvals under packet loss | M4 | ORIGINAL_REQUEST |
| 5 | R5 SRL Metrics & Analytics Edge Cases | Persistence Index divide-by-zero, extreme click volumes (>1000), negative inputs, out-of-order reflection steps, PDF generation stability | M5 | ORIGINAL_REQUEST |
| 6 | E2E & Vitest Regression Suite | Verify 140+ existing Vitest test cases and run full adversarial regression suites with 0 failures | M_ALL | ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Survey & Architecture Mapping | Survey code across R1-R5 to locate exact files, hooks, stores, and test files | none | IN_PROGRESS |
| M1 | Security & State Transition Remediation | Implement and verify R1 adversarial test harness and fix any route/role security gaps | M0 | PLANNED |
| M2 | Arithmetic Engine & VRA Invariants Remediation | Implement and verify R2 stress harness and fix any place-value or undo/redo mathematical bugs | M0 | PLANNED |
| M3 | Socratic Engine & Anti-Guessing Remediation | Implement and verify R3 chaos harness and fix hesitation/lockout timer bypasses | M0 | PLANNED |
| M4 | RTDB & Offline Queue Chaos Remediation | Implement and verify R4 network chaos harness and fix queue overflow or duplicate issues | M0 | PLANNED |
| M5 | SRL Metrics & Analytics Remediation | Implement and verify R5 math fuzz harness and fix edge cases in calculation and PDF export | M0 | PLANNED |
| M6 | Final Verification, Adversarial Hardening & Audit | Full regression run (140+ Vitest tests), adversarial challenger stress testing, forensic integrity audit | M1-M5 | PLANNED |

## Code Layout
- Frontend Application: `react-ts-version/src/`
  - Components: `react-ts-version/src/components/`
  - Context / State: `react-ts-version/src/context/` or `src/store/`
  - Hooks: `react-ts-version/src/hooks/`
  - Services / Firebase: `react-ts-version/src/services/` or `src/firebase/`
  - Types: `react-ts-version/src/types/`
  - Utils: `react-ts-version/src/utils/`
- Test Suites: `react-ts-version/src/**/__tests__/` or `react-ts-version/src/**/*.test.ts*`
- Agent Workspace: `.agents/`
