# Project: Pedagogical AI Evaluation

## Architecture
- **MathmatiCore App**: React TypeScript frontend with Firebase Realtime Database.
- **Data Telemetry**:
  - `conceptMastery` (Q-Matrix of cognitive mastery values between 0 and 100).
  - `traceData` (hesitation_events, undo_clicks, Socratic interventions).
  - `telemetry_sessions` (rrweb replay records for screen interaction recording).
  - `chat_messages` (direct chat between student and teacher).
  - `radar_alerts` (real-time alerts visible to the teacher).
- **PoC Pedagogical Analyzer**:
  - A script that consumes telemetry (logs, conceptMastery, replay markers, traceData).
  - Simulates Socratic feedback and generates a detailed report for the teacher.
  - An E2E test/verification script that passes mock logs representing a specific cognitive error (e.g. regrouping mismatch/wrong addition carrying) and verifies it is correctly identified by the analyzer.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration | Deep evaluation of telemetry, logs, Q-matrix, and rrweb replay structure in MathmatiCore | None | IN_PROGRESS (1e88d793-9e29-4340-a481-0f2d432742d3) |
| 2 | Gap Mapping | Map cognitive mapping gaps (blind spots) and design analysis criteria | M1 | PLANNED |
| 3 | PoC Implementation | Implement mock data generator and pedagogical AI analyzer script in `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation` | M2 | PLANNED |
| 4 | Verification & Reporting | Run the analyzer on mock logs, verify logic, write the final Markdown report | M3 | PLANNED |

## Code Layout
- Deliverables Directory: `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation`
- Mock Log Generator: `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation\generate_mock_logs.js` (or `.py`)
- Pedagogical Analyzer: `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation\analyze_pedagogical_state.js` (or `.py`)
- Final Evaluation Report: `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation\evaluation_report.md`
