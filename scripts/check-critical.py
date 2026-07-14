#!/usr/bin/env python3
"""Guard against inline-critical-CSS drift.

Every HTML page inlines a copy of the "critical" above-the-fold rules that
also live in the external layer (ds/v1/*.css + styles.css). Those copies are
hand-maintained and have drifted twice already (v0.23 token drift shipped as
a P0; the v0.23 mobile-portrait fix never reached the inline copies). This
script re-parses both sides and compares declaration values.

Model:
  * ERROR  — a (media, selector, property) present in an inline block has a
             DIFFERENT value than the external layer. This is the drift class
             that ships visible bugs (stale token, stale layout rule).
  * WARNING — the pair exists inline but not in the external layer at all
             (either dead inline CSS or an inline-only combination like
             `body.v4-page{background:…}`, which merges body+body.v4-page).
             Warnings don't fail the build unless --strict.

The inline block is expected to be a SUBSET: external declarations with no
inline counterpart are fine (that's what "critical subset" means), so they
are not reported. What must never happen silently is the same declaration
existing on both sides with different values.

Usage:
  python3 scripts/check-critical.py            # errors fail (exit 1)
  python3 scripts/check-critical.py --strict   # warnings fail too
  python3 scripts/check-critical.py --verbose  # list every warning
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

HTML_PAGES = [
    "index.html", "en/index.html",
    "collaborate.html", "en/collaborate.html",
    "about.html", "en/about.html",
    "uses.html", "en/uses.html",
    "404.html",
]

# fonts.css is @font-face only — nothing to compare.
EXTERNAL_CSS = ["ds/v1/tokens.css", "ds/v1/base.css", "ds/v1/components.css", "styles.css"]

HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
NUM_LEADING_ZERO_RE = re.compile(r"(?<![\w.])0\.(\d)")


def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def norm_hex_token(token: str) -> str:
    m = HEX_RE.match(token)
    if not m:
        return token
    h = m.group(1).lower()
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return "#" + h


def norm_value(value: str) -> str:
    v = " ".join(value.split())            # collapse whitespace
    v = v.replace(", ", ",")               # spaces after commas are cosmetic
    v = re.sub(r"\s*/\s*", "/", v)         # aspect-ratio: 3 / 2 ≡ 3/2
    v = re.sub(r"\s*!\s*important", "!important", v)  # none !important ≡ none!important
    v = NUM_LEADING_ZERO_RE.sub(r".\1", v)  # 0.2s → .2s
    v = ",".join(
        " ".join(norm_hex_token(t) for t in part.split(" "))
        for part in v.split(",")
    )
    return v.strip().rstrip(";").strip()


def norm_selector(selector: str) -> str:
    s = " ".join(selector.split())
    # spaces inside pseudo-class parens are cosmetic: :nth-last-child(-n + 2)
    s = re.sub(r"\(\s*([^)]*?)\s*\)", lambda m: "(" + re.sub(r"\s+", "", m.group(1)) + ")", s)
    return ",".join(part.strip() for part in s.split(","))


def norm_media(media: str) -> str:
    return re.sub(r"\s+", "", media)


def parse_declarations(body: str):
    decls = {}
    for chunk in body.split(";"):
        if ":" not in chunk:
            continue
        prop, _, value = chunk.partition(":")
        prop = prop.strip().lower()
        if not prop:
            continue
        decls[prop] = norm_value(value)
    return decls


def parse_css(css: str):
    """→ {media_key: {selector: {prop: value}}}.

    Handles @media nesting and skips other at-rules (@keyframes/@font-face/
    @supports) wholesale — including when they appear INSIDE @media. Every
    find() is guarded against -1 so a stray brace can't hang the script."""
    css = strip_comments(css)
    result = {}

    def add_rule(media, selector, body):
        for sel in norm_selector(selector).split(","):
            bucket = result.setdefault(media, {}).setdefault(sel, {})
            bucket.update(parse_declarations(body))

    def skip_balanced(text, start_brace):
        depth, i = 1, start_brace + 1
        while i < len(text) and depth:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            i += 1
        return i  # == len(text) when unbalanced — caller's loop then ends

    def parse_block(text, media):
        pos = 0
        while pos < len(text):
            brace = text.find("{", pos)
            if brace == -1:
                break
            selector = text[pos:brace].strip()
            if selector.startswith("@media"):
                end = skip_balanced(text, brace)
                parse_block(text[brace + 1:end - 1], norm_media(selector[len("@media"):]))
                pos = end
            elif selector.startswith("@"):
                # @keyframes / @font-face / @supports … — not compared.
                pos = skip_balanced(text, brace)
            else:
                end = text.find("}", brace)
                if end == -1:
                    break
                add_rule(media, selector, text[brace + 1:end])
                pos = end + 1

    parse_block(css, "")
    return result


def extract_inline_styles(html: str) -> str:
    return "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, flags=re.S))


# The notes/article shell keeps its own critical-CSS copy in a JS template
# literal — same drift class, same check.
TEMPLATE_JS = "functions/_lib/article-template.js"


def extract_template_critical() -> str:
    text = (ROOT / TEMPLATE_JS).read_text()
    m = re.search(r"const CRITICAL_CSS = `(.*?)`", text, flags=re.S)
    return m.group(1) if m else ""


def main() -> int:
    strict = "--strict" in sys.argv
    verbose = "--verbose" in sys.argv

    external = {}
    for path in EXTERNAL_CSS:
        parsed = parse_css((ROOT / path).read_text())
        for media, selectors in parsed.items():
            for sel, decls in selectors.items():
                external.setdefault(media, {}).setdefault(sel, {}).update(decls)

    errors, warnings = [], []
    sources = [(page, extract_inline_styles((ROOT / page).read_text())) for page in HTML_PAGES]
    sources.append((TEMPLATE_JS, extract_template_critical()))
    for page, css_text in sources:
        inline = parse_css(css_text)
        for media, selectors in inline.items():
            for sel, decls in selectors.items():
                ext_decls = external.get(media, {}).get(sel)
                for prop, value in decls.items():
                    if ext_decls is None or prop not in ext_decls:
                        warnings.append(f"{page}: [{media or 'base'}] {sel} {{ {prop} }} — нет во внешнем CSS")
                    elif ext_decls[prop] != value:
                        errors.append(
                            f"{page}: [{media or 'base'}] {sel} {{ {prop}: {value} }} ≠ внешний {ext_decls[prop]}"
                        )

    if errors:
        print(f"DRIFT: {len(errors)} расхождений значений critical ↔ внешний CSS")
        for e in errors:
            print("  ERROR", e)
    if warnings and (verbose or strict):
        for w in warnings:
            print("  WARN ", w)
    if not errors:
        print(f"OK    critical CSS в синке с ds/v1 + styles.css ({len(sources)} источников, "
              f"{len(warnings)} inline-only деклараций — см. --verbose)")
    return 1 if errors or (strict and warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
