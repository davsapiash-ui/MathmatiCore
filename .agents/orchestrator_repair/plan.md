# Plan — Audit & Repair MathmatiCore LMS

This plan details the steps required to address the systemic mismatches in the MathmatiCore LMS project, specifically R1 (Holistic UI & Mechanics) and R2 (State & Radar Synchronization).

## Steps

### Step 1: Initialize Workspace & Assessment
- [x] Create briefing and progress files.
- [ ] Create `plan.md` (this file).
- [ ] Create `PROJECT.md` (project scope, architecture, and milestones).
- [ ] Set up the heartbeat cron.
- [ ] Spawn `teamwork_preview_explorer` to investigate the codebase and identify the exact files/components managing Dienes blocks, drag-and-drop, workspace state, radar tracking, task instructions, and existing tests.

### Step 2: Audit & Repair UI Components & Instructions (R1)
- [x] Analyze the explorer's report.
- [ ] Spawn `teamwork_preview_worker` to:
  - Enforce manual grouping/ungrouping (via drag and drop) in `DienesBlock`, `PlaceValueBoard`, or relevant components.
  - Disable/remove any auto-regrouping mechanisms, double-click regrouping, or auto-association.
  - Review and edit task instructions to guide users to manually drag blocks for regrouping/ungrouping, removing references to double-clicking or auto-regrouping.
  - Suppress the 'thousands' (אלפים) column and palette items during Sessions 1 and 2 in `PlaceValueBoard.tsx` and `BlockPalette.tsx`.
  - Verify that no numbers in `SESSION1_TASKS` or `SESSION2_TASKS` exceed 1000.
  - Respect and preserve the manual hook fix for `lastDriftAlertTime = useRef(0)` in `useWorkspaceRadar.ts`.
- [ ] Spawn `teamwork_preview_reviewer` to review code changes.

### Step 3: State & Radar Synchronization (R2)
- [ ] Spawn `teamwork_preview_worker` to:
  - Update `useWorkspaceStore` / `useWorkspaceRadar` or equivalent to handle passive drifting alerts with a sliding window of 3 seconds (3 rapid deletions/undos trigger exactly 1 `PASSIVE_DRIFTING` alert).
  - Implement a 15-second cooldown during which no subsequent `PASSIVE_DRIFTING` alerts can be triggered.
  - Reset the sliding window after triggering an alert, and reset completely on task change.
  - Ensure the alerts are properly written to Firebase under student state.
  - Ensure the Teacher Dashboard filters radar alerts to only show alerts of students belonging to the logged-in teacher (cross-teacher leakage prevention).
- [ ] Spawn `teamwork_preview_reviewer` to review store and radar changes.

### Step 4: Verification, Testing & CI/CD Deployment
- [ ] Spawn `teamwork_preview_challenger` to write and execute programmatic verification tests for:
  - 5 rapid deletions yielding exactly 1 `PASSIVE_DRIFTING` alert and a 15-second cooldown.
  - Verification of no auto-regrouping behavior.
  - Review of instructions.
- [ ] Spawn `teamwork_preview_auditor` to run integrity checks on the implementation.
- [ ] Use `auto_deploy` (or worker) to commit, push to GitHub, and verify Firebase CI/CD deployment.
