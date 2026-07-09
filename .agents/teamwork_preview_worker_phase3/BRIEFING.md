# BRIEFING — 2026-07-09T17:14:01+03:00

## Mission
Implement Phase 3 final audit updates and bug fixes for the MathmatiCore LMS project, ensuring Playwright tests pass and codebase is fully integrated.

## 🔒 My Identity
- Archetype: Implementer / QA / Specialist
- Roles: implementer, qa, specialist
- Working directory: c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_phase3
- Original parent: ce57264e-9f02-4f85-8bbd-98c37f29e3a1
- Milestone: Phase 3 Final Audit

## 🔒 Key Constraints
- Hebrew Chat Alignment: Wrap entire text responses in `<div dir="rtl" align="right">` ... `</div>`
- Do not cheat (no dummy implementations, no hardcoded test results)
- Always run build and E2E tests before finalizing
- Follow AGENTS.md instructions (especially UDL, Firebase single source of truth, spec documentation, scaling rules)
- Send message back to parent agent upon completion

## Current Parent
- Conversation ID: ce57264e-9f02-4f85-8bbd-98c37f29e3a1
- Updated: not yet

## Task Summary
- **What to build**: Fix stale forceReload, persistent radar logs, replay flickering, vertical addition thousands-column hiding, projector sandbox range selector, 8-session support, socratic task scaling, and failing Playwright tests.
- **Success criteria**: All Playwright tests pass, including a new thousands-column E2E test; TypeScript builds without errors; changes successfully pushed to Git.
- **Interface contracts**: `react-ts-version/src/infrastructure/services/FirebaseSyncService.ts`, `react-ts-version/src/features/workspace/useWorkspaceRadar.ts`, `react-ts-version/src/presentation/pages/TeacherDashboard.tsx`, etc.
- **Code layout**: Source in `react-ts-version/src`, tests in `react-ts-version/tests` (and root `tests` if applicable).

## Key Decisions Made
- Will check codebase structure and existing files first before changing them.

## Artifact Index
- None yet.

## Change Tracker
- **Files modified**: None yet.
- **Build status**: TBD
- **Pending issues**: None.

## Quality Status
- **Build/test result**: TBD
- **Lint status**: TBD
- **Tests added/modified**: None.

## Loaded Skills
- **auto_deploy** — c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_phase3\skills\auto_deploy\SKILL.md — Build, commit, push automatically.
- **lms_stability_guard** — c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_phase3\skills\lms_stability_guard\SKILL.md — Data consistency, type safety, UI UDL variables, test verification.
- **spec_updater** — c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_phase3\skills\spec_updater\SKILL.md — Update specs in `מסמכי אפיון/` and `AGENTS.md` on architectural or logic change.
