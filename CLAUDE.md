# MathmatiCore — Claude Code

The project rules live in one file, shared by every agent tool:

@AGENTS.md

Read `AGENTS.md` at the repo root before doing anything in this repository. It is the
single source of truth for the specification, the deviation register, the pedagogy
gate, the architecture invariants and the quality gate.

Nothing is restated here on purpose. A second copy of the rules would drift from the
first, and this repository has already lost time to exactly that — see Rule 0 in
`AGENTS.md`.

## Claude Code specifics

- `.claude/skills/יועץ-פדגוגי-מתמטי` implements Rule 2 (the pedagogy gate). Invoke it
  before any change to exercise content. The rule binds even when the skill does not
  run — other tools have no equivalent mechanism.
