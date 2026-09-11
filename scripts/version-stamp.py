#!/usr/bin/env python3
"""Stamp the current git short SHA + asset hashes into all HTML files.

Stamping passes (SHA, asset ?v=, image ?v=, the notes shell, site.js BUILD, seed images):
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
    # Not HTML, but they carry the same ?v= references: the DS integration
    # guide (absolute URLs) and the /admin shell (admin-app.js/css).
    "ds/v1/USAGE.md",
    "functions/admin/index.js",
]
ASSETS = [
    ("styles.css", re.compile(r'(/styles\.css\?v=)[0-9a-fA-F]+')),
    ("script.js",  re.compile(r'(/script\.js\?v=)[0-9a-fA-F]+')),
    ("admin-app.js",  re.compile(r'(/admin-app\.js\?v=)[0-9a-zA-Z]+')),
    ("admin-app.css", re.compile(r'(/admin-app\.css\?v=)[0-9a-zA-Z]+')),
    ("ds/v1/fonts.css",  re.compile(r'(/ds/v1/fonts\.css\?v=)[0-9a-fA-F]+')),
    ("ds/v1/tokens.css", re.compile(r'(/ds/v1/tokens\.css\?v=)[0-9a-fA-F]+')),
    ("ds/v1/base.css",   re.compile(r'(/ds/v1/base\.css\?v=)[0-9a-fA-F]+')),
    ("ds/v1/components.css", re.compile(r'(/ds/v1/components\.css\?v=)[0-9a-fA-F]+')),
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

    # Pass 4: the article/notes shell embeds the same cache-busters as JS string
    # constants (functions/_lib/article-template.js). It isn't an HTML file, so
    # stamp it here too — otherwise /notes pages serve stale CSS/JS after a change.
    tmpl = ROOT / "functions/_lib/article-template.js"
    if tmpl.exists() and asset_hashes:
        text = tmpl.read_text(encoding="utf-8")
        n = 0
        # The shell's footer carries the same build link as the static pages.
        text, k = PATTERN_URL.subn(rf"\g<1>{sha}", text); n += k
        text, k = PATTERN_CODE.subn(rf"\g<1>{sha}\g<2>", text); n += k
        if asset_hashes.get("styles.css"):
            text, k = re.subn(r"(STYLES_VER = 'v=)[0-9a-fA-F]+(')", rf"\g<1>{asset_hashes['styles.css']}\g<2>", text)
            n += k
        if asset_hashes.get("script.js"):
            text, k = re.subn(r"(SCRIPT_VER = 'v=)[0-9a-fA-F]+(')", rf"\g<1>{asset_hashes['script.js']}\g<2>", text)
            n += k
        for const, asset in (("FONTS_VER", "ds/v1/fonts.css"),
                             ("TOKENS_VER", "ds/v1/tokens.css"),
                             ("BASE_VER", "ds/v1/base.css"),
                             ("COMPONENTS_VER", "ds/v1/components.css")):
            if asset_hashes.get(asset):
                text, k = re.subn(rf"({const} = 'v=)[0-9a-fA-F]+(')", rf"\g<1>{asset_hashes[asset]}\g<2>", text)
                n += k
        if n:
            tmpl.write_text(text, encoding="utf-8")
            print(f"  STAMPED functions/_lib/article-template.js (assets:{n})")
            total += n
        else:
            print("  NO-OP   functions/_lib/article-template.js")

    # Pass 4b: the `{build}` placeholder in CMS prose resolves from site.js.
    site = ROOT / "functions/_lib/site.js"
    if site.exists():
        text, k = re.subn(r"(BUILD = ')[0-9a-f]{7,40}(')", rf"\g<1>{sha}\g<2>", site.read_text(encoding="utf-8"))
        if k:
            site.write_text(text, encoding="utf-8")
            print(f"  STAMPED functions/_lib/site.js (build:{k})")
            total += k

    # Pass 5: /uses card images now live in content.seed.json (structured cards),
    # not in the static HTML, so stamp their ?v=<hash> here too — otherwise the
    # immutable-cached /images/uses/* can't be busted when their bytes change.
    seed_path = ROOT / "content.seed.json"
    if seed_path.exists() and image_hashes:
        import json as _json
        seed = _json.loads(seed_path.read_text(encoding="utf-8"))
        n = 0

        def stamp_img(val):
            nonlocal n
            m = re.match(r"^(/images/uses/)([^?\s]+\.webp)(\?v=[0-9a-fA-F]+)?$", str(val or ""))
            if not m:
                return val
            h = image_hashes.get(m.group(2))
            if not h:
                return val
            n += 1
            return f"{m.group(1)}{m.group(2)}?v={h}"

        groups = (((seed.get("uses") or {}).get("sections") or {}).get("hardware") or {}).get("groups") or []
        for g in groups:
            for card in g.get("cards") or []:
                if "image" in card:
                    card["image"] = stamp_img(card["image"])
        if n:
            seed_path.write_text(_json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"  STAMPED content.seed.json (uses images:{n})")
            total += n
        else:
            print("  NO-OP   content.seed.json")

    print(f"Done. {total} replacement(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
