#!/usr/bin/env python3
"""Stamp the current git short SHA + asset hashes into all HTML files.

Three stamping passes:
  1. **Build SHA** in the footer:
       …/morgunovtech/about-me-page/commit/<SHA>
       <code>SHA</code>
     Run before pushing so the deployed footer matches HEAD.

  2. **Cache busters** on /styles.css and /script.js:
       href="/styles.css?v=<HASH>"
       src="/script.js?v=<HASH>"
     The hash is the first 8 hex chars of sha1(file). Re-stamps on every
     run so a change to either asset auto-invalidates browser caches —
     no more "did I bump ?v= in 5 HTML files?" mistakes.

  3. **Image cache busters** on /images/uses/*.webp:
       src="/images/uses/<name>.webp?v=<HASH>"
     Same per-file sha1[:8] scheme. Necessary because /images/* ships
     with `Cache-Control: max-age=31536000, immutable` from _headers —
     swapping image *contents* requires a URL change for browsers/edge
     to refetch. Without this pass, every image swap previously needed
     manual `?v=N` bumps across both uses.html and en/uses.html.

Usage:
    python3 scripts/version-stamp.py

Optional: install as a pre-push hook so it runs automatically:
    cp scripts/version-stamp.py .git/hooks/pre-push
    chmod +x .git/hooks/pre-push
"""

import hashlib
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
    "uses.html",
    "en/uses.html",
    "about.html",
    "en/about.html",
    "404.html",
]
ASSETS = [
    ("styles.css", re.compile(r'(/styles\.css\?v=)[0-9a-fA-F]+')),
    ("script.js",  re.compile(r'(/script\.js\?v=)[0-9a-fA-F]+')),
]
IMAGE_GLOBS = ["images/uses/*.webp"]
# Matches any /images/uses/<name>.webp?v=<hash> reference. The filename
# is captured separately so we can look up its content-hash per-file.
IMAGE_PATTERN = re.compile(
    r'(/images/uses/)([^"?\s]+\.webp)\?v=[0-9a-fA-F]+'
)
PATTERN_URL = re.compile(
    r"(/morgunovtech/about-me-page/commit/)[0-9a-f]{7,40}"
)
PATTERN_CODE = re.compile(
    r"(<code>)[0-9a-f]{7,40}(</code>)"
)


def short_hash(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8]


def main() -> int:
    sha = subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"], text=True
    ).strip()
    if not re.fullmatch(r"[0-9a-f]{7,40}", sha):
        print(f"Refusing to stamp non-hex SHA: {sha!r}", file=sys.stderr)
        return 1
    print(f"HEAD short SHA:   {sha}")

    asset_hashes = {}
    for name, _ in ASSETS:
        p = ROOT / name
        if not p.exists():
            print(f"  SKIP asset {name} (missing)", file=sys.stderr)
            continue
        h = short_hash(p)
        asset_hashes[name] = h
        print(f"  {name:12s} hash: {h}")

    # Build a {filename: hash} map for all globbed images.
    image_hashes = {}
    for glob in IMAGE_GLOBS:
        for img_path in sorted(ROOT.glob(glob)):
            image_hashes[img_path.name] = short_hash(img_path)
    if image_hashes:
        print(f"  /images/uses/*.webp ({len(image_hashes)} files) hashed")

    def stamp_images(text: str) -> tuple[str, int]:
        """Replace `/images/uses/<name>.webp?v=<old>` with `?v=<sha1[:8]>`."""
        def repl(m: re.Match) -> str:
            prefix, name = m.group(1), m.group(2)
            h = image_hashes.get(name)
            if h is None:
                return m.group(0)  # unknown image: leave untouched
            return f"{prefix}{name}?v={h}"
        return IMAGE_PATTERN.subn(repl, text)

    total = 0
    for rel in HTML_FILES:
        path = ROOT / rel
        if not path.exists():
            print(f"  SKIP    {rel}")
            continue
        text = path.read_text(encoding="utf-8")
        new_text, n_url = PATTERN_URL.subn(rf"\g<1>{sha}", text)
        new_text, n_code = PATTERN_CODE.subn(rf"\g<1>{sha}\g<2>", new_text)
        n_assets = 0
        for name, pat in ASSETS:
            h = asset_hashes.get(name)
            if not h:
                continue
            new_text, n = pat.subn(rf"\g<1>{h}", new_text)
            n_assets += n
        new_text, n_images = stamp_images(new_text)
        if n_url == 0 and n_code == 0 and n_assets == 0 and n_images == 0:
            print(f"  NO-OP   {rel}")
            continue
        path.write_text(new_text, encoding="utf-8")
        print(
            f"  STAMPED {rel} "
            f"(sha-url:{n_url}, sha-code:{n_code}, assets:{n_assets}, images:{n_images})"
        )
        total += n_url + n_code + n_assets + n_images

    print(f"Done. {total} replacement(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
