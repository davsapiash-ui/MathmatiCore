# On-screen evidence, 28.9.2026 (DEV ONLY — not part of the build)

Screenshots and measurements behind PR #125 (branch `claude/meeting1-station1-layout`),
taken with `dev-harness/` against the Firebase emulators (demo project, the real
security rules, no live site, no password). "before" = the branch head before this
work (a60b78a); "after" = this branch.

- `*-before-*.png` / `*-after-*.png`: one pair per report row (row number first; `e1.1`
  and `e3.2` are the report's Hebrew rows ע1.1 and ע3.2).
- `walk-before-1366-1024.log`: every exercise measured on the old code (toolbar buttons
  and answer boxes on/off screen); the 1024 lines for meetings 3r–8 were printed to
  the console in the same run and match the `3.18-*-before` screenshots.
- `walk-1024x768-after.log`: every exercise of meetings 1–8 (both tracks in 3, 4, 7) at
  1024x768 on the final code: every button and box on screen.
- `walk-after-1024-1366-1280-1536-first-pass.log`: the same walk at four sizes, run
  before the review fixes (which only changed widths below 1280 px and made them
  narrower).
- `verify-2026-09-28.log`: the scenario checks of `dev-harness/verify-2026-09-28.mjs`
  at 1024x768, 1280x720, 1366x768 and 1536x864 on the final code.
