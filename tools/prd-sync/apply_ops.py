#!/usr/bin/env python3
"""Apply PRD edit operations (ops JSON) to the local Markdown PRD.

Usage: python3 apply_ops.py <prd.md> <ops.json> [<ops.json> ...]

Each op is {"op": "replace"|"insert_after", "old"|"anchor": <exact line>, "new": <text>}.
The same ops files feed build_gs.py, which produces the Apps Script that applies
them to the Google Doc without touching anything else in it.
"""
import json
import sys


def main() -> int:
    prd_path, *ops_paths = sys.argv[1:]
    lines = open(prd_path, encoding="utf-8").read().split("\n")
    missing: list[str] = []
    applied = 0
    for path in ops_paths:
        for op in json.load(open(path, encoding="utf-8")):
            key = "old" if op["op"] == "replace" else "anchor"
            target = op[key]
            hits = [i for i, l in enumerate(lines) if l == target]
            if len(hits) != 1:
                missing.append(f"{path}: {op.get('source','?')}: {len(hits)} matches for {target[:70]!r}")
                continue
            i = hits[0]
            new_lines = op["new"].split("\n")
            if op["op"] == "replace":
                lines[i:i + 1] = new_lines
            else:
                lines[i + 1:i + 1] = [""] + new_lines
            applied += 1
    open(prd_path, "w", encoding="utf-8").write("\n".join(lines))
    print(f"applied {applied} ops")
    for m in missing:
        print("SKIPPED", m)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
