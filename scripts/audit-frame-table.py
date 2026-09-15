#!/usr/bin/env python3
"""Layout-audit measurement: parse an `idb ui describe-all` JSON dump and
print an on-screen, y-sorted table of element frames (points), so alignment
grids, edge margins, and spacing rhythm are read off real measurements
rather than eyeballed. Usage: ax.py <axtree.json> [screen-width-pt]"""
import json
import sys

W = float(sys.argv[2]) if len(sys.argv) > 2 else 402.0

with open(sys.argv[1]) as f:
    tree = json.load(f)

rows = []
for el in tree:
    fr = el.get("frame") or {}
    x, y, w, h = fr.get("x"), fr.get("y"), fr.get("width"), fr.get("height")
    if x is None or y is None or w is None or h is None:
        continue
    # on-screen filter: any horizontal overlap with the visible viewport
    if x + w <= 0 or x >= W:
        continue
    label = (el.get("AXLabel") or el.get("role_description") or "?").replace("\n", " ")
    if len(label) > 60:
        label = label[:57] + "..."
    rows.append((y, x, w, h, el.get("type", "?"), label))

rows.sort(key=lambda r: (round(r[0]), r[1]))
print(f"{'y':>7} {'x':>7} {'w':>7} {'h':>6}  {'type':<10} label")
print("-" * 100)
for y, x, w, h, t, label in rows:
    vis = "" if x >= 0 and x + w <= W else " (partially off-screen)"
    print(f"{y:>7.1f} {x:>7.1f} {w:>7.1f} {h:>6.1f}  {t:<10} {label}{vis}")