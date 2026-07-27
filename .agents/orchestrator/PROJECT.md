# Project: MathmatiCore PRD v4 Missing Components Development

## Architecture
- **Root Directory**: `c:\Users\david\Projects\MathmatiCore`
- **Application Directory**: `react-ts-version`
- **Frontend Framework**: React 18, TypeScript, Tailwind CSS, Zustand for local and transient state management.
- **Backend Services**: Firebase Realtime Database & Firestore for state synchronization, Socratic Engine & Q-Matrix for closed-loop pedagogical guidance.
- **Pedagogical Model**: Strict CRA Bridge (Concrete-Representational-Abstract) & 4-pillar Q-Matrix with Zero-Generation Policy.
- **Data Flow**:
  1. Student interaction in CRA Workspace -> Zustand transient state (`useWorkspaceStore.ts`) -> Firebase (`telemetry_events`, `sessions`, `classrooms`). Zero `localStorage`/`sessionStorage`.
  2. Math Exercise Validation Engine checks concrete block state (hundreds, tens, ones) vs expected mathematical target state -> updates Keyboard State (`LOCKED`, `UNLOCKED`, `Socratic Only`).
  3. Q-Matrix triggers closed-choice Socratic questioning when `hesitation_timer_expire` or error thresholds hit.
  4. Teacher Dashboard (`TeacherDashboard.tsx`) listens to Firestore/Realtime state -> renders Heatmap Grid (struggling students in low-arousal orange), Live Feed (mini-radar graphic), Drill-Down view (Physical Override & pedagogical dialogue recommendations).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Initial Architecture | Map existing react-ts-version state, types, and gaps | none | DONE (Conv: 349176fd-8bad-49f8-92a6-42b68dc7186c) |
| 2 | Socratic Q-Matrix (R3) | Hardcoded typed TS/JSON config file for closed Socratic triggers/options | M1 | DONE (Conv: f533d723-ed61-4ce7-bcc8-a3b5784fb877) |
| 3 | Math Exercise Validation Engine (R4) | Exercise model & validation logic for Strict CRA Bridge + automated unit tests | M1 | DONE (Conv: f533d723-ed61-4ce7-bcc8-a3b5784fb877) |
| 4 | Firebase Integration & Schema + Transient Sync (R2) | Firestore/Realtime schema for teachers, classrooms, sessions, telemetry_events + Zustand sync (Zero localStorage) | M2, M3 | DONE (Conv: 163b347f-84b0-4a07-8221-28eae00851ed) |
| 5 | Teacher Dashboard UI/UX (R1) | Heatmap Grid (low-arousal orange), Live Feed, Drill-Down view with Physical Override & recommendations | M2, M3, M4 | DONE (Conv: 163b347f-84b0-4a07-8221-28eae00851ed) |
| 6 | Integration, Verification & Forensic Audit | Verification (`tsc --noEmit`, automated engine tests, zero storage check) + Forensic Auditor | M2, M3, M4, M5 | DONE (Reviewer: 2a2dc8f4-859c-4ca6-a04d-0536f3c1d05a, Auditor: 484faf25-1c78-417f-81b2-5bf9e0718c7d) |

## Interface Contracts
### Math Exercise Validation Engine ↔ Keyboard State
- Data Model:
  ```typescript
  interface Exercise {
    id: string;
    type: 'addition' | 'subtraction';
    minuend_or_addend1: number;
    subtrahend_or_addend2: number;
    requires_regrouping: boolean;
    target_concrete_state: {
      hundreds: number;
      tens: number;
      ones: number;
    };
  }
  type KeyboardState = 'LOCKED' | 'UNLOCKED' | 'Socratic Only';
  ```

### Socratic Q-Matrix Schema
- Schema:
  ```typescript
  interface QMatrixItem {
    q_id: string;
    trigger_condition: string;
    pedagogical_goal: string;
    question_text: string;
    options: Array<{ id: string; text: string; is_correct: boolean }>;
    visual_cue?: string;
  }
  ```

### Firebase Schema
- Paths & Collections:
  - `teachers`: teacher profiles
  - `classrooms`: classroom metadata and anonymous student mapping
  - `sessions`: student 8-session sequence state
  - `telemetry_events`: vector replay and interaction telemetry
