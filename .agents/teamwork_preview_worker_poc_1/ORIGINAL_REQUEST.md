## 2026-07-10T00:14:10+03:00
You are teamwork_preview_worker.
Your working directory is: c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_poc_1

Your task is to implement the Proof of Concept (PoC) pedagogical evaluation files in `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation`. 

Please perform the following steps:
1. Ensure the output directory `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation` exists.
2. Read the specification file `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_orchestrator_pedagogical_ai_evaluation\SPEC_POC.md` for guidelines.
3. Write `generate_mock_logs.js` to programmatically generate a raw JSON telemetry file representing the double-digit vertical addition (e.g. 28 + 15) error.
4. Write `analyze_pedagogical_state.js` to process the raw telemetry file, detect:
   - "Incorrect regrouping/carrying (הקפצה לא נכונה בחיבור ארוך)" cognitive error.
   - Cognitive struggle (hesitations, long timestamps, high idle time).
   - Passive drifting (rapid undos).
   - Output pedagogical insights and Socratic questions for the teacher.
5. Write `run_poc.js` as an E2E verification script that triggers the generation, runs the analysis, and performs assertions to verify that both the cognitive error and struggle are correctly identified.
6. Write the final evaluation Markdown report `evaluation_report.md` in the target folder `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation`. The report must:
   - Address requirements R1 (evaluation of existing data structure), R2 (identifying gaps/blind spots like ignored mouse moves), and R3 (the 3 technical improvements).
   - Be written in Hebrew (with English subtitles/sections if needed).
   - Wrap the entire file or key parts so it is clear and legible.
7. Run the verification script `run_poc.js` locally and document the output in your handoff report.
8. Save your handoff in `c:\Users\david\Projects\MathmatiCore\ .agents\teamwork_preview_worker_poc_1\handoff.md` and message me back.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your parent is teamwork_preview_orchestrator (conversation ID: 3bf455a9-0f33-4693-9f4e-743cd9f4e164). Use send_message to report your progress and completion.
