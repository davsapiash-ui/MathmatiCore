# Original User Request

## 2026-08-18T20:39:20Z

CRITICAL DIRECTIVE: You must perform an uncompromising, strictly honest, adversarial audit and verification of the MathmatiCore project against PRD v5.0 (MathematiCOre_PRD.md). If any feature, edge case, or rule is unhandled, partially implemented, or faked with a local mock, report it plainly with the exact file and line number. Zero sugarcoating.

Working directory: c:\Users\david\Projects\MathmatiCore

## Scope of Audit
1. PRD v5.0 Full Compliance Audit across Modules 1-29 and Appendix A Contracts:
   - Student flow: Sessions 1-8 progression, Q-Matrix Q1-Q7 diagnostics, CRA multi-representation, Socratic hint engine (Zero-Generation template selection), Session 8 SRL reflection persistence formula, server deadline synchronization (serverNow + serverTimeOffset).
   - Teacher flow: SilentRadarMatrix (3x4 grid, throttle 1000ms, 15s presence timeout, RED>GREY>YELLOW>GREEN priority), TeacherApprovalGate (isolated Firestore read, matrix_recommended_path, toggle), SilentAdaptationPanel (task boundary delay via pendingSupportProfileId), TeacherDiagnosticSplitScreen (no audio/video streams).
   - Admin flow: CurriculumCatalogAdmin (Module 26), SupportAdminHub (Module 28), TeacherAdminChat (Module 22 with Layer 1 client masking and Layer 2 server scrubPII), Classroom Wizard (Module 25 with strict cap of 12 students blocking student 13).
2. Live Security Rules & Firestore Emulator Verification:
   - Run the Firestore emulator (`test-rules.js` via `firebase emulators:exec`) and verify all 9 tests pass.
   - Audit `firestore.rules` for self-approval attacks on `teacher_gate_approved`, cross-student read/write rejection, strict `hasOnly` schema validation, and `srl_reflections` match block.
3. Cloud Functions & Backend Logic:
   - `onSessionCompleteTrigger`: Deterministic closed-form mastery calculation (score >= 80 -> green_path, else gap_reduction).
   - `createSessionWithServerDeadline`: Server-authoritative deadline creation.
   - `generatePedagogicalReportPDF`: Read-only report extraction without recalculating math.
   - `hourlyAdminAggregator`: Metrics aggregation to `/store_cache/admin_metrics`.
   - `sendTeacherAdminMessage`: Layer 2 PII scrubbing.
4. Canvas Recorder & Soft Device Lock:
   - CanvasRecorderService: Pure canvas stream, 10s chunk timeslice, visibilitychange pause/resume handling, WebM export to `recordings/{student_id}/{exercise_id}.webm`.
   - Soft device lock: `active_device_id` listener and calm non-punitive superseded screen.

## Acceptance Criteria:
- All 42 Vitest test suites (456 tests) in `react-ts-version/` pass 100% green.
- Firestore emulator unit tests in `test-rules.js` pass 9/9 tests with exit code 0.
- Functions TypeScript compilation (`functions/`) and client build (`react-ts-version/`) build cleanly with 0 errors.
- Confirm zero PII storage (no student names, emails, phones, or national IDs in student documents or telemetry).

Output an exhaustive, transparent report listing verified capabilities, exact test outputs, and any discrepancies found.
