# Project Plan: Firebase Realtime Database Security Rules and Data Flow Audit

## Architecture
- Firebase Realtime Database (`database.rules.json`) controls read/write authorization and data validation.
- React components and Zustand stores (`react-ts-version/src`) perform database operations using Firebase Web SDK.
- There are specifications in `c:\Users\david\Projects\MathmatiCore\מסמכי אפיון` and project instructions in `AGENTS.md`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Mapping | Scan codebase for database write operations and map them to database.rules.json paths. Identify mismatches and try-catch issues. | none | DONE |
| 2 | Implementation | Resolve mismatches by editing database.rules.json or code payloads. Fix try-catch blocks to notify UI. | M1 | DONE |
| 3 | Documentation & Specs | Update specifications in `מסמכי אפיון` and project instructions in `AGENTS.md`. | M2 | DONE |
| 4 | Verification & Audit | Verify build (`npm run build`) and run reviews/audits to ensure clean verdict. | M3 | IN_PROGRESS |

## Interface Contracts
- Node paths and schema validation properties defined in `database.rules.json` must match exactly the JSON payload structures sent from Zustand stores/React components.
- Errors caught in firebase operations must be propagated to UI elements via callbacks or global alerts instead of just being logged.
