# prd-sync — keeping the PRD in the repo and the Google Doc the same

The product owner's copy of the PRD is a Google Doc. The repo holds a Markdown mirror:
`מסמכי אפיון/07- 3.MathematiCore_PRD_v07 הסופי.md`.

## Direction 1 — the owner edited the Google Doc

Export the Doc as Markdown, put back the two title lines the export drops, and replace
the repo file as a whole. No tooling needed.

## Direction 2 — a change was written into the repo file first

Every such change is recorded as a list of ops, one JSON file per change, in `ops/`:

```json
{"op": "replace",      "old":    "<one existing line of the Markdown PRD, verbatim>", "new": "<text>", "source": "..."}
{"op": "insert_after", "anchor": "<one existing line of the Markdown PRD, verbatim>", "new": "<text>", "source": "..."}
```

`new` may hold several paragraphs separated by blank lines; `###` headings and `**bold**`
are carried over. `old`/`anchor` must match exactly one line of the file.

- `apply_ops.py <prd.md> <ops.json>…` applies them to the Markdown file (that is how
  the repo file was produced).
- `build_gs.py "<version line>" <ops.json>… > drive_apply.gs` bundles the same ops
  into a Google Apps Script. The owner opens the Doc, Extensions → Apps Script, pastes
  the file, runs `previewPrdOps` (reports only) and then `applyPrdOps`.

The script edits the Doc paragraph by paragraph: it finds each anchor paragraph by its
full text, replaces only that paragraph's text or inserts new paragraphs after it with
the same paragraph formatting, and skips (and logs) any anchor it cannot find. It never
touches anything else in the Doc, so later edits the owner made in the Doc survive, and
re-running it is harmless.

`drive_apply.gs` in this folder is the bundle for the latest change.
