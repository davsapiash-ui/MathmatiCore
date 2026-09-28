# dev-harness — checking the child's screens locally (DEV ONLY)

Nothing here is imported by `src`, and nothing here is part of `npm run build`
(Vite builds from `index.html` → `src/main.tsx` only). It exists so that anyone
can check a screen the way the 28.9.2026 audit did, without the live site and
without any password or access code.

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

## Run

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
