# dev-harness — checking the child's screens locally (dev only)

Nothing here is imported by `src/` or included in `npm run build`. It runs the
real frontend against the Firebase Emulator Suite: a demo project
(`demo-mathmaticore`), the repository's own `database.rules.json` and
`firestore.rules`, and no real credentials. It never touches
https://mathimaticore.web.app and uses no password or passcode: the identity
(student 12) is an unsigned emulator token, set in the emulator itself.

Needs Java, `firebase-tools` and Playwright's Chromium.

```bash
# 1. emulators + frontend (http://localhost:5199)
FIREBASE_BIN=/path/to/firebase react-ts-version/dev-harness/start.sh
# 2. walk meeting 2 as student 12 and take a screenshot of every screen
cd react-ts-version
node dev-harness/meeting2-walk.mjs --profile plain --size 1366x768 --answers wrong --out dev-harness/shots/after
```

`--profile enhanced` sets `support_profile_id: 'enhanced_cognitive_support'` on
the learner's record, as the teacher's toggle does. `--answers wrong` answers
every task wrongly so the whole correction round is shown; `--answers right`
answers 605, 40, 27, 563, 25, 209, 273. Each run also writes a JSON file with
what the screen said, the answer boxes (left edge, bottom, border colour) and
the task-5 picture. If Chromium is not where Playwright looks, set
`CHROMIUM_PATH`.
