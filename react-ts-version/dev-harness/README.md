# dev-harness — checking the child's screens locally (DEV ONLY)

Nothing here is imported by `src`, and nothing here is part of `npm run build`
(Vite builds from `index.html` → `src/main.tsx` only). It exists so that anyone
can check a screen the way the 28.9.2026 audit did, without the live site (it
never touches https://mathimaticore.web.app) and without any password or access
code.

What it does:

- Runs the Firebase **emulators** (Auth, Firestore, Realtime Database) for the
  demo project `demo-mathmaticore`, with the repository's **real** security
  rules (`firestore.rules`, `database.rules.json`).
- Serves the real frontend with a Vite config that, in the dev server only,
  points Firebase at the emulators and signs in with an unsigned emulator token
  carrying the identity claims (student 12: `role: student, student_id: 12`).
  The Auth emulator accepts such a token; real Firebase never would.
- Drives headless Chromium through every exercise, takes screenshots, and
  measures on the page whether every toolbar button and every answer box is
  fully on the screen.

Both runs below use the same emulator config, `firebase.harness.json`. The
Firestore rules are copied next to it into `.rules/` (the emulator refuses paths
outside its project dir). The RTDB rules are PUT after start, by `seed.mjs` or
`meeting2-walk.mjs`: the CLI's own upload of them goes through the outbound
proxy in some sandboxes.

## Run: every meeting (`shoot.mjs`)

```bash
cd react-ts-version
FIREBASE_BIN="npx firebase-tools" ./dev-harness/start-emulators.sh &   # needs Java
npx vite --config dev-harness/vite.harness.config.mjs &                # http://127.0.0.1:5173
node dev-harness/seed.mjs 1                                            # RTDB rules + meeting 1 open
CHROMIUM=/path/to/chrome node dev-harness/shoot.mjs dev-harness/shots/run 1366x768,1024x768 1,3,4:remediation_path,7
```

`shoot.mjs` prints one line per exercise (`CUT BUTTONS: …` / `CUT: …` when
something is off screen) and writes `measure.json` next to the screenshots.
`dev-harness/shots/` and `dev-harness/.rules/` are gitignored.

The seed opens the meeting as the teacher would (`active_class_session`) and,
for meetings 3–8, marks student 12 as approved at the teacher gate on the given
path. The harness jumps to an exercise with the store's own `initSession`, the
same call the workspace makes when a meeting starts.

## Run: meeting 2, with and without the support profile (`meeting2-walk.mjs`)

Needs Java, `firebase-tools` and Playwright's Chromium.

```bash
# 1. emulators + frontend (http://localhost:5199)
FIREBASE_BIN=/path/to/firebase react-ts-version/dev-harness/start.sh
# 2. walk meeting 2 as student 12 and take a screenshot of every screen
cd react-ts-version
node dev-harness/meeting2-walk.mjs --profile plain --size 1366x768 --answers wrong --out dev-harness/shots/after
```

`start.sh` starts the same emulators and the frontend with
`vite.harness.config.ts`, whose sign-in builds the emulator token from the
claims in localStorage `harness_claims`; it writes `emulators.log` and
`vite.log` here (gitignored), and `restart-vite.sh` restarts only the frontend.
The walk puts the RTDB rules in place, then opens meeting 2 as the teacher
would. `--profile enhanced` sets
`support_profile_id: 'enhanced_cognitive_support'` on the learner's record, as
the teacher's toggle does. `--answers wrong` answers every task wrongly so the
whole correction round is shown; `--answers right` answers 605, 40, 27, 563,
25, 209, 273. Each run also writes a JSON file with what the screen said, the
answer boxes (left edge, bottom, border colour) and the task-5 picture. If
Chromium is not where Playwright looks, set `CHROMIUM_PATH`.
