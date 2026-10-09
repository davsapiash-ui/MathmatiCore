#!/usr/bin/env python3
"""Bundle old->new pairs ({"doc","where","old","new"} ops files) into one Apps Script.

Usage: python3 build_pairs_gs.py <PRD version> <header comment> <ops.json> [...] > apply_all.gs

The script replaces text that occurs exactly once and nothing else: it never inserts,
deletes or moves a paragraph (README.md). Safe to run more than once: a pair whose new
text is already in the Doc is skipped.
"""
import json
import pathlib
import sys

IDS = {
    "PRD": "1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY",
    "מסמך 02": "1r74zTVq-C1Xa8WrYwOdUMvlhd3OEVty4o2K207rJhgI",
    "מסמך 03": "1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A",
    "מסמך 04": "1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM",
}

version, header, *paths = sys.argv[1:]
ops = [op for p in paths for op in json.load(open(p, encoding="utf-8"))]
runtime = (pathlib.Path(__file__).parent / "apply_all_9oct_f.gs").read_text(encoding="utf-8")
runtime = runtime[runtime.index("function applyAll()"):]
out = ["// " + line for line in header.split("\n")]
out.append("// Run applyAll. Safe to run more than once.")
out.append("var DOCS = [")
for name, doc_id in IDS.items():
    # An op may name which of several identical paragraphs it replaces
    # ({"nth": 1, "total": 2}); the runtime then counts instead of matching once.
    pairs = [[op["old"], op["new"]] + ([None, op["nth"], op["total"]] if "total" in op else []) for op in ops if op["doc"] == name]
    if not pairs:
        continue
    v = json.dumps(version) if name == "PRD" else "null"
    out.append(f"  {{ name: {json.dumps(name, ensure_ascii=False)}, id: '{doc_id}', version: {v}, edits: [")
    out.append(",\n".join("  " + json.dumps(p, ensure_ascii=False) for p in pairs))
    out.append("] },")
out[-1] = out[-1].rstrip(",")
out.append("];")
sys.stdout.write("\n".join(out) + "\n" + runtime)
