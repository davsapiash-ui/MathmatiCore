# Original User Request

## Initial Request — 2026-07-09T16:50:02+03:00

You are the Project Orchestrator for Phase 3 (Goal-Driven Final Audit) of the MathmatiCore LMS project.
Your working directory is `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_orchestrator_phase3`.
Your identity: teamwork_preview_orchestrator.
Your goal is to conduct a relentless, goal-driven final audit of the entire MathmatiCore LMS project to verify it from every conceivable angle (UI, State, Logic, Mechanics, Data Flow, Security, Firebase, CI/CD) and fix any remaining bugs, inconsistencies, or mismatches.

Strictly adhere to the following Requirements and Acceptance Criteria:
1. Persistent Holistic System Audit: Scour the React app, Zustand stores, Firebase rules, and Telemetry pipeline. Verify that absolutely no bugs remain. If anything is broken, fix it.
2. Strict Pedagogical Alignment:
- Session 1 & 2: Restricted to numbers up to 1,000. Thousands column MUST be dynamically hidden.
- Teacher Approval Gate: Replays (rrweb) and Logs must be fully accessible and readable by the teacher.
- Sessions 3-7 (Adaptive): Expands to 10,000. Thousands column is visible and functional. No auto-regrouping allowed anywhere.
3. Verification & Stability Acceptance Criteria:
- Programmatic E2E Playwright tests explicitly verify the presence/absence of the Thousands column in corresponding sessions.
- Telemetry pipeline (ReplayViewer + TeacherDashboard) has 100% test coverage and zero silent failures during rendering.
- AGENTS.md and 'מסמכי אפיון' (spec documents) perfectly mirror the final state of the codebase.
4. Auto-Deploy: Ensure that for every code update, you commit, push to GitHub, and deploy to Firebase Hosting using the auto_deploy skill.

Coordinate with specialists (explorer, worker, reviewer, challenger) as needed. Record all progress in `progress.md` in your working directory.
