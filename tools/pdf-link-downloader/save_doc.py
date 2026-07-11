#!/usr/bin/env python3
"""save_doc.py DOCID — read the macOS clipboard and save it as the source file for
the given unique DOCID (from docs.json). Detects failed copies via a sentinel left
on the clipboard after the previous save.

Workflow per document:
  1. (browser) navigate to the link, click into content, select-all, copy
  2. python3 save_doc.py <docid>   # dumps clipboard -> DR-Report-sources/<filename>

Exit status: 0 = saved, 2 = copy looked failed (clipboard unchanged / too short).
"""
import json, os, subprocess, sys, hashlib

OUT_DIR = "/Users/yingxiong/Library/Mobile Documents/com~apple~CloudDocs/Cowork OS/Robotics/DR-Report-sources"
SENT = "/tmp/as_sentinel.txt"
DOCS = os.path.join(OUT_DIR, "docs.json")
MIN_LEN = 200  # below this we treat the capture as page-chrome only / failed


def clip():
    return subprocess.run(["pbpaste"], capture_output=True, text=True).stdout


def set_sentinel(tag):
    s = f"__AS_SENTINEL__{tag}__{hashlib.md5(str(tag).encode()).hexdigest()}"
    subprocess.run(["pbcopy"], input=s, text=True)
    with open(SENT, "w") as f:
        f.write(s)


def main():
    did = sys.argv[1]
    with open(DOCS) as f:
        docs = json.load(f)
    entry = next(e for e in docs if e["docid"] == did)

    text = clip()
    prev_sent = open(SENT).read() if os.path.exists(SENT) else ""

    if (prev_sent and text.strip() == prev_sent.strip()) or len(text.strip()) < MIN_LEN:
        print(f"COPY_FAILED docid={did} len={len(text.strip())}")
        set_sentinel(did)
        return 2

    header = (
        f"# {entry['category']} — {entry['docid']}\n\n"
        f"- Cited on report page(s): {sorted(set(entry['cited_at_pages']))}\n"
        f"- Source URL: {entry['url']}\n"
        f"- Captured from AlphaSense reader (full selectable text)\n\n"
        f"---\n\n"
    )
    path = os.path.join(OUT_DIR, entry["filename"])
    with open(path, "w") as f:
        f.write(header + text)

    entry["saved"] = True
    entry["chars"] = len(text.strip())
    with open(DOCS, "w") as f:
        json.dump(docs, f, indent=2)

    set_sentinel(did)
    print(f"SAVED docid={did} chars={entry['chars']} -> {entry['filename']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
