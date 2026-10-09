#!/usr/bin/env python3
"""Bundle the ops JSON into the Apps Script so the owner pastes a single file.

Usage: python3 build_gs.py <version line> <ops.json> [<ops.json> ...] > drive_apply.gs
"""
import json
import pathlib
import sys

version_line, *ops_paths = sys.argv[1:]
ops = []
for p in ops_paths:
    ops.extend(json.load(open(p, encoding="utf-8")))
tpl = (pathlib.Path(__file__).parent / "drive_apply.template.gs").read_text(encoding="utf-8")
out = tpl.replace("__OPS_JSON__", json.dumps(json.dumps(ops, ensure_ascii=False), ensure_ascii=False))
out = out.replace("__VERSION_LINE__", json.dumps(version_line, ensure_ascii=False))
sys.stdout.write(out)
