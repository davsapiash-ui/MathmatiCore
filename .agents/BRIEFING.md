# BRIEFING — 2026-07-10T00:10:00+03:00

## Mission
Analyze and evaluate the AI's capability to understand a student's cognitive state from existing data (Q-Matrix, screen recordings, alert logs, and student answers) and build a PoC analysis mechanism.

## 🔒 My Identity
- Archetype: sentinel
- Working directory: c:\Users\david\Projects\MathmatiCore\.agents
- Orchestrator: 3bf455a9-0f33-4693-9f4e-743cd9f4e164
- Victory Auditor: [TBD]

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
- Audit Firebase Realtime Database Security Rules vs Codebase Data Flow.
- Ensure no front-end data schemas conflict with Firebase validation rules.
- Silent Failure Elimination in Firebase try/catch blocks.

## User Context
- **Last user request**: Evaluate AI capability to understand cognitive state from Q-Matrix, logs, replays, answers. Map blind spots and build a Proof of Concept script/mechanism with mock logs showing cognitive error detection, and write a summary Markdown report.
- **Pending clarifications**: [none]
- **Delivered results**: [none]

## Project Status
- **Phase**: in progress

## Victory Audit Status
- **Triggered**: no
- **Verdict**: pending
- **Retry count**: 0

## Artifact Index
- c:\Users\david\Projects\MathmatiCore\ORIGINAL_REQUEST.md — Original request track
- c:\Users\david\Projects\MathmatiCore\.agents\ORIGINAL_REQUEST.md — Agent metadata request track
- database.rules.json — Firebase security rules
- Cron 1 (Progress Reporting): task-41
- Cron 2 (Liveness Check): task-45
