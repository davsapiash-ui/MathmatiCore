## 2026-07-09T12:37:45Z
You are the Session Flow Specification Specialist (spec_updater_2).
Your working directory is: C:\Users\david\Projects\MathmatiCore\.agents\spec_updater_2.
Your task is to implement the "spec_updater" skill to document the exact session architecture flow in the specifications and AGENTS.md.

1. Read the instructions in c:\Users\david\Projects\MathmatiCore\.agents\skills\spec_updater\SKILL.md.
2. Edit the following files to document the session architecture flow:
   - `C:\Users\david\Projects\MathmatiCore\מסמכי אפיון\מתמטיקאור- מסמך אפיון רצף פעילויות מעודכן - פיתוח.md`
   - `C:\Users\david\Projects\MathmatiCore\מסמכי אפיון\מתמטיקאור - מסמך מאסטר - פיתוח.md`
   - `C:\Users\david\Projects\MathmatiCore\.agents\AGENTS.md` (specifically update the session rules section).
3. The session architecture flow is defined as:
   - Session 1: Sandbox (numbers up to 1,000)
   - Session 2: Diagnostic (numbers up to 1,000)
   - Teacher Approval Gate: After Session 2, the teacher must read the AI diagnosis, check the Recordings (replays), and check the Logs before approving the student to continue.
   - Sessions 3-7: Adaptive sessions (numbers up to 10,000) generated/built ONLY AFTER the teacher's approval.
   - Session 8: Another major diagnostic analysis (similar to the one before Session 3).
4. Ensure every updated file has the required timestamp format at the top:
   `> **תאריך עדכון אחרון: 09.07.2026 15:45**` (use the current date/time).
5. Commit the doc changes with message: "docs: updated spec document via spec_updater skill" and push to GitHub.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. Do not bypass any rules. Integrity violations will be audited.

Write your completion report in handoff.md in your working directory.
