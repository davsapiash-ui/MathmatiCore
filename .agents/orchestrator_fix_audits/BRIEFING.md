# BRIEFING — 2026-07-06T12:19:00+03:00

## Mission
Perform a comprehensive, zero-tolerance audit and fix pass across the entire MathmatiCore platform for security, QA, UX/UI, and architecture.

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: c:\Users\david\Projects\MathmatiCore\.agents\orchestrator_fix_audits
- Original parent: main agent
- Original parent conversation ID: 416ad3d6-deb5-461a-99a4-a1cbe3567fa0

## 🔒 My Workflow
- **Pattern**: Project Pattern
- **Scope document**: c:\Users\david\Projects\MathmatiCore\.agents\orchestrator_fix_audits\PROJECT.md
1. **Decompose**: Decomposed into 6 milestones targeting specific features, UI/UX, Security and backend validation.
2. **Dispatch & Execute** (pick ONE):
   - **Direct (iteration loop)**: We run the Explorer → Worker → Reviewer cycle per milestone directly.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Self-succeed when spawn count ≥ 16.
- **Work items**:
  1. Milestone 1: Socratic Engine & Flow Controls [in-progress]
  2. Milestone 2: UI/UX & Dashboard Integrations [planned]
  3. Milestone 3: Admin Dashboard & Chat Fixes [planned]
  4. Milestone 4: Security & Rules Audit [planned]
  5. Milestone 5: Clean Code & Quality [planned]
  6. Milestone 6: Build & Verification [planned]
- **Current phase**: 1
- **Current focus**: Milestone 1

## 🔒 Key Constraints
- Strictly delegate all work to subagents. Do not write code or run builds directly.
- Ensure production build compiles with zero errors.
- Hebrew alignment for all user-facing text: wrap in `<div dir="rtl" align="right">` ... `</div>`.
- Zero tolerance for hardcoding test results or creating dummy/facade implementations.
- Every Firebase `onValue` listener must return an `off()` cleanup function (from LMS Stability Guard).

## Current Parent
- Conversation ID: 416ad3d6-deb5-461a-99a4-a1cbe3567fa0
- Updated: not yet

## Key Decisions Made
- Expanded milestones to explicitly audit and correct security config, database rules, UX alignment, UDL, and code quality.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_comprehensive | teamwork_preview_explorer | Perform comprehensive audit of 4 areas | completed | 404ac1b7-dfb1-45d8-8d10-7d8f08832a60 |
| worker_comprehensive | teamwork_preview_worker | Implement all security, sync loop, memory leak and UI fixes | in-progress | 36bc46c2-d1d3-48c5-a92f-adf995649b3f |

## Succession Status
- Succession required: no
- Spawn count: 3 / 16
- Pending subagents: 36bc46c2-d1d3-48c5-a92f-adf995649b3f
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 416ad3d6-deb5-461a-99a4-a1cbe3567fa0/task-37
- Safety timer: f99981c8-4422-4902-b78d-a05deeaaea5c/task-203

## Artifact Index
- c:\Users\david\Projects\MathmatiCore\.agents\orchestrator_fix_audits\PROJECT.md — Global index, architecture, milestones, interfaces.
- c:\Users\david\Projects\MathmatiCore\.agents\orchestrator_fix_audits\progress.md — Checkpoint tracking.
- c:\Users\david\Projects\MathmatiCore\.agents\orchestrator_fix_audits\plan.md — Detailed milestone plan.
