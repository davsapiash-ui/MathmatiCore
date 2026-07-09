# BRIEFING — 2026-07-09T15:53:26+03:00

## Mission
Launch and supervise a new wave of testing/verification (Orchestrator final sweep) to ensure Firebase telemetry, replay viewer, thousands column, and trace logs are flawless.

## 🔒 My Identity
- Archetype: sentinel
- Working directory: c:\Users\david\Projects\MathmatiCore\.agents
- Orchestrator: bab441df-5787-4df9-9a83-c9452775f4c8
- Victory Auditor: TBD

## 🔒 Key Constraints
- No technical decisions — relay only
- Victory Audit is MANDATORY before reporting completion
- Hebrew Chat Alignment: Always wrap your entire text response to the user in a `<div dir="rtl" align="right">` ... `</div>` block.
- FREEZE all work and routing logic on Stage 3 tracks. Focus entirely on making Stage 2 completion 100% proper and perfect.
- Sessions 1-2 numbers must be up to 1000 in everything (no thousands column on PlaceValueBoard in Sessions 1-2, no task numbers > 1000 in SESSION1_TASKS/SESSION2_TASKS).
- Do not overwrite user's manual hook fix in `useWorkspaceRadar.ts` (`lastDriftAlertTime = useRef(0)` at top level).
- Curriculum Scaling Rule: Document that 2nd Grade (Sessions 1-2) goes up to 1,000, and 3rd Grade adaptivity scales up to 10,000 in both the specs and AGENTS.md.
- Ensure the curriculum scaling rule is implemented in Q-Matrix (`src/core/QMatrix.ts`) and task definitions (`src/data/sessionTasks.ts`).
- Conduct exhaustive system-wide audit of UI, State, Logic, Mechanics, Data Flow, Security, Firebase, CI/CD.
- Ensure the 'thousands' column is visible and functional in Sessions 3 and 4, while remaining hidden/restricted in Sessions 1 and 2.
- Prioritize fixing the telemetry/recording pipeline IMMEDIATELY. Replays & Logs on Teacher Dashboard must work perfectly.
- Implement the exact Session Flow: Session 1 (Sandbox <= 1,000), Session 2 (Diagnostic <= 1,000), Teacher Approval Gate (after Session 2, requiring checking AI diagnosis, recordings, logs), Sessions 3-7 (Adaptive <= 10,000, built only after approval), Session 8 (Diagnostic). Document this in AGENTS.md and master spec docs.
- Protect and deploy the user's manual Firebase rules update adding read/write permissions for the `telemetry_chunks` node.
- Verify that the `telemetry_chunks` Firebase rule actually works on the live deployment.
- Verify that there are no remaining bugs in the teacher dashboard replay viewer.
- Verify that Session 3 and 4 tasks perfectly render the "Thousands" column without breaking the board.
- Final cleanup of any lingering trace bugs.
- Protect and deploy the user's manual Firebase rules update adding top-level `.write` permissions for the admin on `radar_alerts` and `chat_messages`.

## User Context
- **Last user request**: Run an exhaustive final sweep verifying telemetry_chunks Firebase rules on live deployment, teacher dashboard replay viewer bugs, Session 3-4 thousands column rendering, and lingering trace bugs.
- **Pending clarifications**: none
- **Delivered results**: none for this run

## Project Status
- **Phase**: in progress

## Victory Audit Status
- **Triggered**: no
- **Verdict**: pending
- **Retry count**: 0

## Artifact Index
- c:\Users\david\Projects\MathmatiCore\ORIGINAL_REQUEST.md — Original request track
- c:\Users\david\Projects\MathmatiCore\.agents\ORIGINAL_REQUEST.md — Agent metadata request track
