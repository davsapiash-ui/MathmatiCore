#!/usr/bin/env python3
"""Apply old->new pairs (the {"doc","where","old","new"} ops files) to the repo's Markdown copies.

Usage: python3 apply_pairs_md.py <ops.json> [<ops.json> ...]

The pairs are written as the Google Doc reads them, without Markdown escapes. The
Markdown copies are Google Docs exports, which escape _ ! + and a full stop after a
digit, so each pair is escaped the same way before it is looked up. A pair is applied
only when it occurs exactly once; the version line of the PRD is left to the caller.
"""
import json
import re
import sys

FILES = {
    "PRD": "מסמכי אפיון/07- 3.MathematiCore_PRD_v07 הסופי.md",
    "מסמך 02": "מסמכי אפיון/מקור פדגוגי/02- אפיון רצף הפעילויות.md",
    "מסמך 03": "מסמכי אפיון/מקור פדגוגי/03- אפיון מפורט לקראת פיתוח.md",
    "מסמך 04": "מסמכי אפיון/מקור פדגוגי/04- ארכיטקטורת מידע ועיצוב ממשק משתמש.md",
}


def esc(s: str) -> str:
    s = re.sub(r"([_!+])", r"\\\1", s)
    return re.sub(r"(\d)\.(?=\s|$)", r"\1\\.", s)


def main() -> int:
    texts = {k: open(v, encoding="utf-8").read() for k, v in FILES.items()}
    failed = 0
    for path in sys.argv[1:]:
        for op in json.load(open(path, encoding="utf-8")):
            t = texts[op["doc"]]
            for old, new in ((esc(op["old"]), esc(op["new"])), (op["old"], op["new"])):
                if t.count(old) == 1:
                    texts[op["doc"]] = t.replace(old, new)
                    break
            else:
                failed += 1
                print("SKIPPED", op["doc"], op["where"])
    for k, v in FILES.items():
        open(v, "w", encoding="utf-8").write(texts[k])
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
