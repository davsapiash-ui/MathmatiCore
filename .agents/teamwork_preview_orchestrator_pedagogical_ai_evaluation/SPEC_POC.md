# Specification: Pedagogical AI PoC (Proof of Concept)

## Objective
To demonstrate how an AI pedagogical analyzer can consume student telemetry data (logs, Q-Matrix, traceData) to identify a specific complex cognitive error: **incorrect regrouping/carrying in vertical addition (הקפצה לא נכונה בחיבור ארוך)**, and output a Socratic guide/teacher report.

## Required Files

1. **Mock Log Generator (`generate_mock_logs.js`)**
   - Output Path: `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation\generate_mock_logs.js`
   - Purpose: Programmatically generates a JSON file representing a student's session logs.
   - Scenario: The student is solving `28 + 15`. 
     - Correct answer: 43.
     - Student behavior representing the cognitive error:
       - The student represents 28 (2 tens, 8 units) and 15 (1 ten, 5 units) using base-10 virtual blocks.
       - They combine the units to get 13 units.
       - Instead of regrouping 10 units into 1 ten (which would leave 3 units and add 1 ten to the tens column), the student:
         - Drags all 13 units to the units column.
         - Hesitates for a long time (simulated via timestamp jumps of >30 seconds).
         - Clicks undo multiple times (rapidly, e.g. 3 deletes in 3 seconds, triggering passive drifting).
         - Inputs "3" in the units place of the equation but fails to carry the 1 to the tens column, resulting in an answer of "33" (2 tens + 1 ten = 3 tens, and 3 units) or writes "313".
   - Output: Creates `student_telemetry_raw.json` containing:
     - `conceptMastery` (Q-matrix: decimal_structure=90%, regrouping_fluency=30%, procedural_fluency=50%)
     - `traceData` (undo_clicks=4, hesitation_events=2)
     - `interaction_logs` (list of events like block_drag, block_group, equation_input, delete, hesitation_trigger, etc., with timestamps)

2. **Pedagogical Analyzer (`analyze_pedagogical_state.js`)**
   - Output Path: `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation\analyze_pedagogical_state.js`
   - Purpose: Reads `student_telemetry_raw.json`, runs analysis logic, and prints:
     - Identified Cognitive Error (with confidence level and evidence).
     - Student Cognitive State (e.g. Cognitive Struggle, Passive Drifting).
     - advanced Pedagogical Insights (analysis of why they failed).
     - Recommended Socratic Questions for the teacher (in Hebrew).
   - Analysis Rules:
     - Detect **Incorrect carrying**: Look for `equation_input` events where input is "33" or "313" for `28 + 15`, combined with low `regrouping_fluency` and `block_drag` without grouping.
     - Detect **Cognitive struggle**: High hesitation count, timestamp gaps >30s between consecutive interaction logs.
     - Detect **Passive drifting**: rapid undos/deletes in logs.

3. **E2E verification runner (`run_poc.js`)**
   - Output Path: `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation\run_poc.js`
   - Purpose: Executes `generate_mock_logs.js` to create the mock telemetry file, then executes `analyze_pedagogical_state.js`, captures output, and asserts that the regrouping error and cognitive struggle were successfully identified.

4. **Markdown Report (`evaluation_report.md`)**
   - Output Path: `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation\evaluation_report.md`
   - Hebrew language with English subtitles/sections, explaining the findings (R1, R2, R3).
