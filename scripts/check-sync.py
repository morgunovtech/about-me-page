#!/usr/bin/env python3
"""Check structural parity between RU and EN HTML pairs.

Compares element-tree structure (tag + classes + id) — ignores text and
attribute values (so URLs, aria-labels, hreflang etc. can differ freely
between languages without flagging drift).

Skips <script>, <style>, <svg> subtrees (their inner structure varies by
content and isn't part of the public layout contract).

Usage:
    python3 scripts/check-sync.py            # summary only
    python3 scripts/check-sync.py --verbose  # all mismatches

Exit code: 0 if all pairs are in sync, 1 if drift detected.
"""

import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAIRS = [
    ("index.html", "en/index.html"),
    ("collaborate.html", "en/collaborate.html"),
]
SKIP_SUBTREE = {"style", "script", "svg", "noscript"}
# Tags that we ignore entirely (no enter/exit events recorded). These are
# meta-level, not layout-defining: their counts can legitimately differ
# between RU and EN (e.g. RU pages preload cyrillic + latin fonts; EN only
# latin), and a structural-parity check shouldn't flag that.
IGNORE_TAGS = {"link", "meta"}
# Classes that mark dynamic / locale-specific state, not structure.
# Filtered out before fingerprinting so RU/EN can legitimately differ on them
# (e.g. active language tab, current nav item).
IGNORE_CLASSES = {"is-active"}


class FingerprintParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.events = []
        self.depth = 0
        self.skip_depth = None

    def _start(self, tag, attrs):
        if self.skip_depth is not None:
            return
        if tag in SKIP_SUBTREE:
            self.skip_depth = self.depth
            return
        if tag in IGNORE_TAGS:
            return
        a = dict(attrs)
        raw_classes = a.get("class", "").split()
        cls = tuple(sorted(c for c in raw_classes if c not in IGNORE_CLASSES))
        self.events.append(("open", self.depth, tag, cls, a.get("id", "")))

    def _end(self, tag):
        if self.skip_depth is not None and self.depth == self.skip_depth:
            self.skip_depth = None
            return
        if self.skip_depth is not None:
            return
        if tag in SKIP_SUBTREE or tag in IGNORE_TAGS:
            return
        self.events.append(("close", self.depth, tag))

    def handle_starttag(self, tag, attrs):
        self._start(tag, attrs)
        self.depth += 1

    def handle_endtag(self, tag):
        self.depth -= 1
        self._end(tag)

    def handle_startendtag(self, tag, attrs):
        if self.skip_depth is not None or tag in SKIP_SUBTREE or tag in IGNORE_TAGS:
            return
        a = dict(attrs)
        raw_classes = a.get("class", "").split()
        cls = tuple(sorted(c for c in raw_classes if c not in IGNORE_CLASSES))
        self.events.append(("open", self.depth, tag, cls, a.get("id", "")))
        self.events.append(("close", self.depth, tag))


def fingerprint(path):
    p = FingerprintParser()
    p.feed(path.read_text(encoding="utf-8"))
    return p.events


def fmt_event(e):
    if e is None:
        return "(end of file)"
    if e[0] == "open":
        _, depth, tag, cls, eid = e
        bits = [tag]
        if eid:
            bits.append(f"#{eid}")
        if cls:
            bits.append("." + ".".join(cls))
        return f"<{' '.join(bits)}> @depth {depth}"
    return f"</{e[2]}> @depth {e[1]}"


def diff(a, b, limit=20):
    out = []
    n = max(len(a), len(b))
    for i in range(n):
        ea = a[i] if i < len(a) else None
        eb = b[i] if i < len(b) else None
        if ea != eb:
            out.append((i, ea, eb))
            if len(out) >= limit:
                break
    return out


def main():
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    failed = 0
    for ru, en in PAIRS:
        ru_p, en_p = ROOT / ru, ROOT / en
        if not ru_p.exists() or not en_p.exists():
            print(f"SKIP  {ru}  ↔  {en}  (file missing)")
            continue
        a, b = fingerprint(ru_p), fingerprint(en_p)
        ms = diff(a, b)
        if not ms:
            print(f"OK    {ru}  ↔  {en}  ({len(a)} structural events)")
            continue
        failed += 1
        print(f"FAIL  {ru}  ↔  {en}  ({len(ms)}+ mismatches)")
        show = ms if verbose else ms[:5]
        for i, ea, eb in show:
            print(f"   event #{i}")
            print(f"     ru: {fmt_event(ea)}")
            print(f"     en: {fmt_event(eb)}")
        if not verbose and len(ms) > 5:
            print(f"   ... {len(ms) - 5} more (run with --verbose to see all)")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
