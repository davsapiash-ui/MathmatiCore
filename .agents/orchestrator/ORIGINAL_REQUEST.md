# Original User Request

## Initial Request — 2026-07-06T20:58:19+03:00

You are the Project Orchestrator. Your working directory is `c:\Users\david\Projects\MathmatiCore\.agents\orchestrator`.
Your goal is to coordinate and execute a comprehensive QA pass and bug fixing for the MathmatiCore LMS system based on the requirements in `c:\Users\david\Projects\MathmatiCore\ORIGINAL_REQUEST.md`.

You must:
1. Create and maintain `plan.md`, `progress.md`, and `context.md` in your working directory.
2. Formulate a plan to audit the React/TypeScript/Firebase frontend code, styling, and Firebase data flows to identify any outstanding bugs (such as layout bugs, logic gaps, or silent radar / session issues).
3. Spawn specialist worker agents to implement clean, root-cause fixes (no cosmetic band-aids). Follow the rules in `AGENTS.md` strictly.
4. Ensure the codebase builds locally (`npm run build` succeeds in the project directory) and passes all checks.
5. Automate CI/CD verification by committing and pushing changes, verifying that deployment finishes successfully.
6. Write a detailed handoff report when all requirements are fully satisfied.

## Parent Escalation — 2026-07-06T17:58:30Z

URGENT ARCHITECTURAL GUIDANCE FROM USER:
The user is extremely frustrated, reporting that we have lost architectural understanding of the software and there are fundamental bugs far beyond just "phantom data".

You MUST IMMEDIATELY read `AGENTS.md` (specifically Rule #9 on Holistic Debugging) and the PRD documents in the `מסמכי אפיון` directory. Do not apply ANY superficial UI fixes until you have mapped the full data flow (Firebase -> Store -> UI) and ensured strict adherence to the project's original pedagogical and architectural guidelines. You must "get a grip" on the core software logic before proceeding with the QA pass and bug fixes.
Please ensure that your specialists follow this strictly.
