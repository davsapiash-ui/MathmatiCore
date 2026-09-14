# MathmatiCore — Agent Rules

**This file is the single source of agent rules for this repository.** Antigravity,
Claude Code, Cursor and every other agent tool read it from the repo root. Do not
copy these rules into another file — a second copy will drift, and drift is what
this project has already been burned by (see Rule 1).

---

## Rule 0 — Push when you finish

More than one agent works on this project, on different machines. Antigravity works
on the local clone; other sessions work on their own copy. **GitHub is the only place
they can see each other.**

So: when you finish a piece of work, commit it and push it. Work left only on the
local disk is invisible to everyone else, and the next agent will build on a version
that no longer matches — which is how two agents start undoing each other.

If you are not confident the work is ready for `main`, push it to a branch. Pushing to
a branch is always safe and always better than not pushing.

Before you start work, `git pull` first, so you begin from what everyone else already
has.

## Rule 1 — There is exactly one specification

The **only** authoritative requirements document is:

```
מסמכי אפיון/07- 2.MathematiCore_PRD_v07 הסופי.md
```

1,383 lines, 30 modules (Module 1: login → Module 30). Read it before implementing
anything. When you cite a requirement, cite it from this file, by module.

Every other PRD/spec/plan/audit file that used to live here was **deleted on
purpose**: there were conflicting PRD versions from v2.0 through v7.1, plus a
fabricated "100% compliance" audit that cited files which do not exist in the
codebase. Fixes were being made against different, contradictory spec revisions,
and that drift was a real source of regressions.

Therefore:

- **Never create a new PRD, spec, plan, audit, roadmap or status document** — not at
  the repo root, not anywhere. If a requirement must change, edit the canonical file.
- Never treat a chat message, a commit message, an old branch, or your own memory as
  the spec. The file above is the spec.
- If the spec is silent on something, say so and ask. Do not invent a requirement.

## Rule 2 — Deviations are registered, not improvised

```
מסמכי אפיון/סטיות_מהאפיון.md
```

This register is **not** a specification. It records only where the code
intentionally departs from the spec, who approved it, and when.

> כלל הבית: כשהקוד והאפיון לא מסכימים, **הקוד משתנה** — אלא אם הסטייה רשומה כאן עם אישור.
>
> *House rule: when the code and the spec disagree, the code changes — unless the
> deviation is registered here with an approval.*

Before "fixing" a mismatch, check the register. If the deviation is approved, leave
it alone. If it is not, the code changes. Only the product owner adds a new approved
deviation — you may propose one, never record one as approved yourself.

## Rule 3 — Exercises go through the pedagogy gate

Before **any** change to exercise content, and before quoting an exercise from the
spec, the mathematical and pedagogical correctness must be checked. This applies to:

- `react-ts-version/src/data/sessionTasks.ts`
- `react-ts-version/src/data/sessionBranchTasks.ts`
- `react-ts-version/src/core/QMatrix.ts`
- the curriculum catalog

> כלל הבית (הוראת בעל המוצר, 3.9.2026): **לא משנה מה כתוב באפיון — אם יש טעות
> בכתיבת התרגיל, עוצרים ומתריעים לפני שממשיכים.** לא מעתיקים טעות בשקט, ולא
> "מתקנים" אותה בשקט. מציגים למשתמש, והוא מחליט.
>
> *If an exercise is written incorrectly — even if the error is in the spec itself —
> stop and raise it before continuing. Never copy an error silently, and never
> "correct" one silently. Show the product owner; they decide.*

Claude Code runs this as the `יועץ-פדגוגי-מתמטי` skill in `.claude/skills/`. Other
tools have no such mechanism, so **the rule above is binding regardless of tooling**:
stop, state the problem, wait for a decision.

---

## Project

A hybrid mathematics learning platform for 3rd-grade students, including ASD support
and special education. Live at `mathimaticore` (Firebase Hosting).

| | |
|---|---|
| Frontend | `react-ts-version` — React 19, Vite, TypeScript, Tailwind, Framer Motion, KaTeX |
| Backend | `functions` — Firebase Cloud Functions, TypeScript, Gemini SDK |
| Data | Firestore + Realtime Database (see Module 4) |

## Commands

Frontend commands run **inside `react-ts-version`**:

```bash
npm run dev               # dev server
npm test                  # Vitest
npm run build             # tsc -b && vite build
npm run lint              # ESLint
npm run verify-component  # component check
```

Functions commands run inside `functions`: `npm test`, `npm run build`.

## Architecture invariants

These are not style preferences. Breaking one is a defect.

1. **Zero-PII.** Never store, log or transmit personal information. Students are
   anonymous IDs `1`–`12` only. Client-side filtering plus a server-side anonymizer
   (Module 3).
2. **Offline-first telemetry.** Chunks stay under **50KB** and buffer in an offline
   FIFO queue when the network drops. A failed chunk is never discarded (Module 17).
3. **8-session progression** (Module 14):
   - Session 1 — Sandbox
   - Session 2 — Diagnostic; a hard gate requires teacher approval before Session 3
   - Sessions 3–7 — Adaptive VRA lessons
   - Session 8 — Master Researcher, SRL reflection board
4. **State management** (`react-ts-version/src/application/`):
   - `useWorkspaceStore.ts` — student workspace, session state, keyboard locks
   - `useStore.ts` — main app store
   - `useAdminStore.ts` — schools, classes, teachers
5. **No audio or video capture, ever.** Screen and DOM capture only. No camera, no
   microphone, no speech input anywhere in the system (Modules 21, 22).
6. **Narration (TTS) is student-side only.** Client-side Web Speech API in Hebrew,
   triggered strictly by an explicit student click. Autoplay narration is forbidden.
   The teacher and admin interfaces have no narration at all (Module 24 / UDL).

## Quality gate

Before you call a task done: `npm test` and `npm run build` must pass cleanly in
`react-ts-version`, and in `functions` if you touched it. The deploy workflow runs
all four and refuses to deploy otherwise.

Deployment happens on merge to `main` — `.github/workflows/firebase-hosting-merge.yml`
deploys hosting, Cloud Functions, Firestore rules, Storage rules and RTDB rules.

## Supporting material (context, not requirements)

- `מסמכי משרד החינוך/תוכנית לימודים חדשה/` — Israeli Ministry of Education curriculum,
  grades 1–3
- `מסמכי משרד החינוך/התאמות חנ''מ/` — special-education adaptations
- `DESIGN_SYSTEM_RULES.md`, `BUTTON_DESIGN_RULES.md` — UI conventions

These inform decisions. They do not override Rule 1.

---

## A note on rules-file precedence

Antigravity reads `AGENTS.md` and `GEMINI.md`, and **`GEMINI.md` wins on conflict**.
No `GEMINI.md` exists in this repo, deliberately: a second rules file would silently
override this one and recreate the exact drift Rule 1 exists to prevent. If you need
a tool-specific note, keep it short and make it point here rather than restate.
