# BRIEFING — 2026-07-09T16:50:00+03:00

## Mission
Phase 3 Goal-Driven Final Audit: Conduct a relentless, goal-driven, and holistic system audit of MathmatiCore LMS.

## 🔒 My Identity
- Archetype: sentinel
- Working directory: c:\Users\david\Projects\MathmatiCore\.agents
- Orchestrator: ce57264e-9f02-4f85-8bbd-98c37f29e3a1
- Victory Auditor: TBD

## 🔒 Key Constraints
- No technical decisions — relay only
- Victory Audit is MANDATORY before reporting completion
- Hebrew Chat Alignment: Always wrap your entire text response to the user in a `<div dir="rtl" align="right">` ... `</div>` block.
- Sessions 1-2 numbers must be up to 1000 in everything (Thousands column must ALWAYS be visible, but task numbers/exercise values must not exceed 1000 in SESSION1_TASKS/SESSION2_TASKS).
- Do not overwrite user's manual hook fix in `useWorkspaceRadar.ts` (`lastDriftAlertTime = useRef(0)` at top level).
- Curriculum Scaling Rule: Document that 2nd Grade (Sessions 1-2) goes up to 1,000, and 3rd Grade adaptivity scales up to 10,000 in both the specs and AGENTS.md.
- Ensure the curriculum scaling rule is implemented in Q-Matrix (`src/core/QMatrix.ts`) and task definitions (`src/data/sessionTasks.ts`).
- Conduct exhaustive system-wide audit of UI, State, Logic, Mechanics, Data Flow, Security, Firebase, CI/CD.
- Ensure the 'thousands' column is visible and functional in all sessions.
- Sandbox task logic: Fix Sandbox task logic in `useWorkspaceStore.ts` so it doesn't just check `s.hasDeletedBlock`, but handles the "5 blocks" dragging validation gracefully.
- Prioritize fixing the telemetry/recording pipeline IMMEDIATELY. Replays & Logs on Teacher Dashboard must work perfectly.
- Implement the exact Session Flow: Session 1 (Sandbox <= 1,000), Session 2 (Diagnostic <= 1,000), Teacher Approval Gate (after Session 2, requiring checking AI diagnosis, recordings, logs), Sessions 3-7 (Adaptive <= 10,000, built only after approval), Session 8 (Diagnostic). Document this in AGENTS.md and master spec docs.
- Protect and deploy the user's manual Firebase rules update adding read/write permissions for the `telemetry_chunks` node.

## User Context
- **Last user request**: Phase 3 Goal-Driven Final Audit: Relentless holistic audit of MathmatiCore LMS. Verify system from UI, State, Logic, Mechanics, Data Flow, Security, Firebase, CI/CD. Confirm Thousands column presence/absence in Playwright tests, telemetry pipeline test coverage, and docs match codebase.
- **Pending clarifications**: none
- **Delivered results**: none for Phase 3

## Project Status
- **Phase**: in progress

## Victory Audit Status
- **Triggered**: no
- **Verdict**: pending
- **Retry count**: 0

## Artifact Index
- c:\Users\david\Projects\MathmatiCore\ORIGINAL_REQUEST.md — Original request track
- c:\Users\david\Projects\MathmatiCore\.agents\ORIGINAL_REQUEST.md — Agent metadata request track
- Cron 1 (Progress Reporting): task-31
- Cron 2 (Liveness Check): task-33

