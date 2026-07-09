# BRIEFING — 2026-07-09T15:16:27+03:00

## Mission
Repair the MathmatiCore LMS project by updating Hebrew instructions, exposing the test callback in radar, strictly filtering radar alerts to avoid cross-teacher leakage, rewriting the regrouping E2E test, and creating the passive drifting E2E test.

## 🔒 My Identity
- Archetype: LMS Repair Specialist
- Roles: implementer, qa, specialist
- Working directory: C:\Users\david\Projects\MathmatiCore\.agents\worker_1
- Original parent: 36bcb53c-cb56-4a86-8451-992943f57a17
- Milestone: MathmatiCore LMS Repair

## 🔒 Key Constraints
- Hebrew Chat Alignment: Wrap all text responses to user in `<div dir="rtl" align="right">` ... `</div>`
- Do not cheat, no dummy implementations.
- No client-side timer UI component or active timer state rendering in `/workspace`.
- Keep screen height limited (100vh) to eliminate scrollbars where possible.
- Update specification documents if architectural/logic/data flow changes occur.
- Silent Radar: reset timer on user events, trigger hesitation event on 30s timeout.
- Passive drifting: sliding window of 3s for 3 consecutive deletions/undos.

## Current Parent
- Conversation ID: 36bcb53c-cb56-4a86-8451-992943f57a17
- Updated: not yet

## Task Summary
- **What to build**: Update task instructions, expose programmatically accessible radar alert callback `window.__onRadarAlert`, filter radar alerts by teacher's students, rewrite `regrouping.spec.ts`, create `passive-drifting.spec.ts`.
- **Success criteria**: All component and E2E tests pass (`npm run verify-component` and `npm run test:e2e`).
- **Interface contracts**: C:\Users\david\Projects\MathmatiCore\AGENTS.md and code files.
- **Code layout**: react-ts-version/src

## Key Decisions Made
- Follow instructions to update target files and implement E2E tests.

## Artifact Index
- None yet.

## Change Tracker
- **Files modified**: None yet.
- **Build status**: Unknown
- **Pending issues**: None

## Quality Status
- **Build/test result**: Unknown
- **Lint status**: Unknown
- **Tests added/modified**: None

## Loaded Skills
- **Source**: c:\Users\david\Projects\MathmatiCore\.agents\skills\auto_deploy\SKILL.md
- **Local copy**: TBD
- **Core methodology**: Automate commits, pushes, and Firebase verification.
