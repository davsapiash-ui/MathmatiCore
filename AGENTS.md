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
מסמכי אפיון/07- 3.MathematiCore_PRD_v07 הסופי.md
```

Version 7.4, 8 October 2026 — 29 modules plus 23א, Appendix A and Appendix B. Read it
before implementing anything. When you cite a requirement, cite it from this file, by
module.

The PRD describes the **target** system, not the code as it is today. Since 8 October
2026 it also carries every product-owner decision that used to live in a separate
deviation register; that register was merged into the modules and deleted. There is
no second document, and a requirement in the PRD that the code does not yet meet is
work for the code, not a reason to doubt the PRD.

**Agents never edit this file on their own.** Not to record a decision, not to "update"
a module, not to add an implementation note. Between 30 August and 9 September 2026
agents wrote seven rounds of decisions into it on their own initiative, and on 14
September the owner had the file restored. The owner's copy of the PRD is the Google
Doc of the same name in their Drive; the file here mirrors it. The PRD changes in
exactly two ways:

1. **The owner edits the Google Doc** and asks an agent to sync it. The agent exports the
   Doc and replaces this file with it, as a whole, without "improving" anything.
2. **The owner decides something in chat** and tells the agent, explicitly, to write it
   into the PRD. The agent then edits this file **and** records the same edit as ops in
   `tools/prd-sync/ops/` (see `tools/prd-sync/README.md`), so the owner can apply it to
   the Google Doc paragraph by paragraph without losing the Doc's formatting or their
   own later edits. The pull request gets the label `owner-approved-spec-change`.

Anything else — a decision you think the owner made, a gap you noticed, a mismatch you
would like to resolve — you raise with the owner and stop. You do not write it anywhere.

### Removed for good — never reintroduce

The owner removed each of these on purpose. Do not bring one back — not in the PRD, not
in code, not as a "fix" for a gap you noticed, not because an old document, an old
commit, a code comment or document 01–04 seems to ask for it. If you think one should
return, raise it with the owner and stop.

| Removed | When |
|---|---|
| Typing a digit creates, deletes or changes blocks. Sync is one-way: blocks → digits only. An agent invented it in August 2026 from document 03's phrase "סנכרון דו-כיווני מבוקר"; document 03 keeps its wording (it is written for the academic supervisor), the PRD governs. | 23.9.2026, again 8.10.2026 |
| A return-to-lobby button on activity screens. Moving between the lobby and a station is the teacher's action. | 9.9.2026, confirmed 8.10.2026 |
| A button that enters the session from the lobby. The lobby waits; when the teacher activates the session it swaps in place to the station's opening screen. | 25–26.9.2026, 8.10.2026 |
| AI-written exercises, and the teacher editing exercises in chat or in any form. There is no exercise editor anywhere. | 4.9.2026 |
| Injecting an "אתגר מצוינות" exercise into the compulsory sequence. | 14.9.2026 |
| The "איזו עזרה תרצו לקבל כעת?" window (hint / guiding question / solved example). | 14.9.2026 |
| A "גורם משלב" role. There are three roles only: student, teacher, admin. | 14.9.2026 |
| Redo. There is undo only. | 14.9.2026 |
| A bee, or any bee animation, on any student screen; the stage is "שלב החלוקה למסלולים". | 29.9.2026 |
| Any percentage, score or ranking on a student screen, including the persistence index. | 27.9.2026 |

CI (`protect-spec.yml`) fails a pull request that writes the first two back into the PRD.

### The owner's pedagogical source documents — read-only

```
מסמכי אפיון/מקור פדגוגי/
  01- האפיון הראשוני.md
  02- אפיון רצף הפעילויות.md
  03- אפיון מפורט לקראת פיתוח.md
  04- ארכיטקטורת מידע ועיצוב ממשק משתמש.md
  05- המטריקס מעודכן ומאושר.docx
```

These five are the product owner's pedagogical specification, written for their
academic supervisor. The PRD was derived from them. They are here so an agent can
**read** them — to understand why a requirement exists, or to check an exercise's
numbers (module 26 of the PRD takes its exercise banks from document 03).

**Agents never edit, rename, move, delete, convert or "update" these files, and never
derive a new document from them.** They are not a second specification: where they and
the PRD differ, the PRD governs (Rule 1), and the difference is a pedagogical question
for the owner — not something an agent resolves, in either direction. If reading them
reveals that the code departs from the PRD, raise it with the owner and stop.

A CI check (`.github/workflows/protect-spec.yml`) fails any pull request that touches
these files or the PRD unless the owner has labelled it `owner-approved-spec-change`.

Every other PRD/spec/plan/audit file that used to live here was **deleted on
purpose**: there were conflicting PRD versions from v2.0 through v7.1, plus a
fabricated "100% compliance" audit that cited files which do not exist in the
codebase. Fixes were being made against different, contradictory spec revisions,
and that drift was a real source of regressions.

Therefore:

- **Never create a new PRD, spec, plan, audit, roadmap or status document** — not at
  the repo root, not anywhere. If a requirement must change, the product owner changes
  it in the PRD, by one of the two ways above.
- Never treat a chat message, a commit message, an old branch, or your own memory as
  the spec. The file above is the spec.
- If the spec is silent on something, say so and ask. Do not invent a requirement.

## Rule 2 — When the code and the PRD disagree, the code changes

> כלל הבית: כשהקוד והאפיון לא מסכימים, **הקוד משתנה.** אין מרשם סטיות: כל סטייה שאושרה
> כתובה ב-PRD עצמו כדרישה רגילה.
>
> *House rule: when the code and the spec disagree, the code changes. There is no
> deviation register: every approved deviation is written into the PRD itself as an
> ordinary requirement.*

There used to be a separate register of approved deviations. On 8 October 2026 the
owner had it merged into the PRD and deleted, so that one document describes the
system. Consequences:

- Do not look for a register, and do not create one. If the PRD says X and the code
  does Y, the code is wrong — unless the owner tells you otherwise in this session, in
  which case the PRD changes first (Rule 1, way 2) and then the code.
- "The code has always done it this way", an old commit, a code comment or a deleted
  document are not approvals.
- The PRD is silent on something you need? Say so and ask. Do not invent a requirement
  and do not infer one from the code.

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
