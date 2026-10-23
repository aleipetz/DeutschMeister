#!/usr/bin/env python3
"""Builds the web app's vocabulary bundle and stamps its service-worker cache version.

Outputs:
  Web/vocab-bundle.json  same format as the iOS bundle (Tools/build_bundle.py)
  Web/sw.js              VERSION = hash of every precached file, so each change ships as a
                         new offline cache and installed copies update themselves

Re-run after any change under Content/data/ or Web/ (validate content first:
python3 Tools/validate_content.py). With --check, fails instead of writing if either output
is stale (used by CI).

Usage:
    python3 Tools/build_web.py [--check]
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from build import load_entries, load_themes

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "Web"
BUNDLE = WEB / "vocab-bundle.json"
SW = WEB / "sw.js"


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def bundle_text():
    entries = load_entries()
    themes = load_themes()
    # One entry per line keeps git diffs reviewable without bloating the file.
    lines = ['{"schemaVersion":1,']
    lines.append('"themes":[' + ",".join(dumps(t) for t in themes) + "],")
    lines.append('"entries":[')
    lines.append(",\n".join(dumps(e) for e in entries))
    lines.append("]}")
    text = "\n".join(lines) + "\n"
    assert len(json.loads(text)["entries"]) == len(entries)
    return text, len(entries)


def precached_files(sw_text):
    block = re.search(r"const ASSETS = \[(.*?)\];", sw_text, re.S).group(1)
    names = re.findall(r"'([^']+)'", block)
    return [WEB / ("index.html" if n == "./" else n) for n in names]


def stamped_sw(sw_text, bundle):
    digest = hashlib.sha256()
    for path in precached_files(sw_text):
        data = bundle.encode() if path == BUNDLE else path.read_bytes()
        digest.update(path.name.encode() + b"\0" + data)
    # sw.js itself changes only through VERSION, so hash it with the version blanked.
    digest.update(re.sub(r"const VERSION = '[^']*';", "", sw_text).encode())
    return re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{digest.hexdigest()[:12]}';", sw_text, count=1)


def main():
    check = "--check" in sys.argv
    bundle, count = bundle_text()
    sw_old = SW.read_text(encoding="utf-8")
    sw_new = stamped_sw(sw_old, bundle)

    if check:
        stale = [p.relative_to(ROOT) for p, new in ((BUNDLE, bundle), (SW, sw_new))
                 if not p.exists() or p.read_text(encoding="utf-8") != new]
        if stale:
            print("Out of date: " + ", ".join(map(str, stale)) + ". Run python3 Tools/build_web.py and commit.")
            sys.exit(1)
        print("Web build is up to date.")
        return

    BUNDLE.write_text(bundle, encoding="utf-8")
    SW.write_text(sw_new, encoding="utf-8")
    version = re.search(r"const VERSION = '([^']*)'", sw_new).group(1)
    print(f"Wrote {BUNDLE.relative_to(ROOT)} ({count} entries, {BUNDLE.stat().st_size / 1024:.0f} KB)")
    print(f"Stamped {SW.relative_to(ROOT)} VERSION = {version}")


if __name__ == "__main__":
    main()
