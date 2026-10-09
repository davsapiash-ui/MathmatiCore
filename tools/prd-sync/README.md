# prd-sync — keeping the PRD in the repo and the Google Doc the same

The owner's copy of the PRD is a Google Doc; the repo holds a Markdown mirror
(`מסמכי אפיון/07- 3.MathematiCore_PRD_v07 הסופי.md`).

- **Owner edited the Doc:** export it and replace the repo file.
- **A change was decided in chat:** edit the repo file, and give the owner a script of exact sentence replacements (old → new) that only replaces text occurring exactly once; it never inserts, deletes or moves a paragraph, table or code block. Or give the owner the edits to make by hand.

Never write a script that restructures the Doc. The earlier paragraph-diff sync
did, and on 8 October 2026 it moved the Doc's body into its footer; the owner had
to restore it from version history.
