# BRIEFING — 2026-07-09T18:08:40Z

## Mission
Implement fixes for the Firebase Realtime Database rules mismatches, logical bugs in student resetting, and silent try/catch blocks, and update the specifications.

## 🔒 My Identity
- Archetype: implementer, qa, specialist
- Roles: implementer, qa, specialist
- Working directory: c:\Users\david\Projects\MathmatiCore\.agents\worker_firebase_rules_audit
- Original parent: d757902b-03e6-45ed-9542-41d4c8dd291c
- Milestone: Firebase Rules and Error Propagation Fixes

## 🔒 Key Constraints
- Use code-only network restrictions (no external HTTP calls).
- Wrap all responses to the user in `<div dir="rtl" align="right">` ... `</div>` (Hebrew chat alignment).
- Follow minimal change principle.
- Run build/test to verify correctness.

## Current Parent
- Conversation ID: d757902b-03e6-45ed-9542-41d4c8dd291c
- Updated: not yet

## Task Summary
- **What to build**: Update Firebase database rules (database.rules.json), fix class reset logic (ClassManagement.tsx), add proper error handling and UI alerts in useChatStore.ts, ReflectionScreen.tsx, and TeacherDashboard.tsx, create AGENTS.md, and update 4 spec files in Hebrew.
- **Success criteria**: 0 compilation/lint errors on npm run build, correct write rules, student reset deletes approvals, catch blocks show alerts, and documentation is updated.
- **Interface contracts**: c:\Users\david\Projects\MathmatiCore\database.rules.json
- **Code layout**: c:\Users\david\Projects\MathmatiCore\react-ts-version\src

## Key Decisions Made
- [TBD]

## Artifact Index
- [TBD]

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: [TBD]
- **Pending issues**: [TBD]

## Quality Status
- **Build/test result**: [TBD]
- **Lint status**: [TBD]
- **Tests added/modified**: [TBD]

## Loaded Skills
- **Source**: c:\Users\david\Projects\MathmatiCore\.agents\skills\spec_updater\SKILL.md
  - **Local copy**: c:\Users\david\Projects\MathmatiCore\.agents\worker_firebase_rules_audit\skills\spec_updater.md
  - **Core methodology**: Prevents software rot by updating spec documents with a timestamp header when there are architectural changes.
- **Source**: c:\Users\david\Projects\MathmatiCore\.agents\skills\firebase-schema-guard\SKILL.md
  - **Local copy**: c:\Users\david\Projects\MathmatiCore\.agents\worker_firebase_rules_audit\skills\firebase_schema_guard.md
  - **Core methodology**: Enforces cross-referencing between Firebase schemas in code and rules in database.rules.json to prevent silent write rejections.
- **Source**: c:\Users\david\Projects\MathmatiCore\.agents\skills\lms_stability_guard\SKILL.md
  - **Local copy**: c:\Users\david\Projects\MathmatiCore\.agents\worker_firebase_rules_audit\skills\lms_stability_guard.md
  - **Core methodology**: Enforces data consistency, type safety, off() cleanups for listeners, and building without errors.
