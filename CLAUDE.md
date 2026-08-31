# MathmatiCore — Claude Code Context & Instructions

## Product Spec (PRD)
The **only** authoritative requirements document is
`מסמכי אפיון/07- 2.MathematiCore_PRD_v07 הסופי.md`. Every other PRD/spec/plan/audit
file previously in this repo (multiple conflicting PRD versions from v2.0
through v7.1, plus a fabricated "100% compliance" audit that cited files
that don't exist in the codebase) was deleted because the repo had
accumulated fixes made against different, contradictory spec revisions —
that drift was a real source of regressions. Do not create new PRD/spec/plan
documents at the repo root; if requirements need to change, edit the one
canonical file above.

## Project Overview
MathmatiCore is a hybrid mathematics learning platform for 3rd-grade students (including ASD support and special education).
- **Frontend Path**: `react-ts-version` (React 19, Vite, TypeScript, Tailwind CSS, Framer Motion, KaTeX)
- **Backend / Cloud Functions**: `functions` (Firebase Cloud Functions, TypeScript, Gemini SDK)
- **Architecture**: Zero-PII Policy (Anonymous Student IDs 1-12), Offline FIFO Queue, 50KB Payload limit per telemetry chunk.

## Key Developer Commands
All frontend commands should be executed inside the `react-ts-version` directory:
- **Start Dev Server**: `npm run dev`
- **Run Vitest Tests**: `npm test`
- **Run TypeScript & Vite Build**: `npm run build`
- **Run Code Linter**: `npm run lint`
- **Verify Component**: `npm run verify-component`

## Architecture & Guidelines for Claude Code
1. **Zero-PII Policy**: Never store or stream PII. Use student anonymous IDs (`1`-`12`) only.
2. **Offline-First & Telemetry**: Telemetry chunks must be kept under 50KB and buffered in an offline FIFO queue when network drops.
3. **8-Session Progression**:
   - Session 1: Sandbox
   - Session 2: Diagnostic (gated lock requires teacher approval before Session 3)
   - Sessions 3-7: Adaptive VRA lessons
   - Session 8: Master Researcher (SRL Reflection board)
4. **State Management**:
   - `useWorkspaceStore` (`src/application/useWorkspaceStore.ts`) — Student workspace, session state & keyboard locks.
   - `useStore` (`src/application/useStore.ts`) — Main app store.
   - `useAdminStore` (`src/application/useAdminStore.ts`) — Class, teacher, and school management.
5. **Quality Standard**:
   - Before ending a task, ensure `npm test` and `npm run build` pass cleanly.
