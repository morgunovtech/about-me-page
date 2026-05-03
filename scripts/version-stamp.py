#!/usr/bin/env python3
"""Stamp the current git short SHA into the footer of all HTML files.

The footer carries a "build <a><code>SHA</code></a>" link pointing at the
GitHub commit that matches the deployed version. Run this before pushing
to keep the SHA in sync with HEAD.

Usage:
    python3 scripts/version-stamp.py

Optional: install as a pre-push hook so it runs automatically:
    cp scripts/version-stamp.py .git/hooks/pre-push
    chmod +x .git/hooks/pre-push
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = [
    "index.html",
    "en/index.html",
    "collaborate.html",
    "en/collaborate.html",
    "404.html",
]
# Two patterns — order of attributes on <a> can vary, so we don't bind them
# together in one match. The build link is the only place that uses either
# of these patterns on the site.
PATTERN_URL = re.compile(
    r"(/morgunovtech/about-me-page/commit/)[0-9a-f]{7,40}"
)
PATTERN_CODE = re.compile(
    r"(<code>)[0-9a-f]{7,40}(</code>)"
)


def main() -> int:
    sha = subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"], text=True
    ).strip()
    if not re.fullmatch(r"[0-9a-f]{7,40}", sha):
        print(f"Refusing to stamp non-hex SHA: {sha!r}", file=sys.stderr)
        return 1
    print(f"Current HEAD short SHA: {sha}")

    total = 0
    for rel in HTML_FILES:
        path = ROOT / rel
        if not path.exists():
            print(f"  SKIP    {rel}")
            continue
        text = path.read_text(encoding="utf-8")
        new_text, n_url = PATTERN_URL.subn(rf"\g<1>{sha}", text)
        new_text, n_code = PATTERN_CODE.subn(rf"\g<1>{sha}\g<2>", new_text)
        if n_url == 0 and n_code == 0:
            print(f"  NO-OP   {rel}")
            continue
        path.write_text(new_text, encoding="utf-8")
        print(f"  STAMPED {rel} (url:{n_url}, code:{n_code})")
        total += n_url + n_code

    print(f"Done. {total} replacement(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
