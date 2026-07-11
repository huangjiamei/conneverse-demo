#!/usr/bin/env python3
"""
download_pdf_links.py — extract every link from a PDF and download what each one points to.

It collects two kinds of links:
  1. Embedded hyperlinks  — clickable URI annotations stored in the PDF.
  2. URLs in the text      — plain http(s):// URLs written out in the visible text.

Both are merged and de-duplicated, then every link is downloaded into an output
folder (everything is downloaded, regardless of file type).

Usage:
    python3 download_pdf_links.py INPUT.pdf [-o OUTPUT_DIR] [--list-only] [--workers N]

Examples:
    python3 download_pdf_links.py report.pdf
    python3 download_pdf_links.py report.pdf -o ./downloads
    python3 download_pdf_links.py report.pdf --list-only      # just show the links

Setup (one time):
    python3 -m pip install -r requirements.txt
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import mimetypes
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit(
        "Missing dependency 'PyMuPDF'.\n"
        "Install it with:  python3 -m pip install -r requirements.txt\n"
        "             or:  python3 -m pip install PyMuPDF"
    )

# Matches http/https URLs in free text. Trailing punctuation is trimmed afterward.
URL_RE = re.compile(r'https?://[^\s<>"\')\]}]+', re.IGNORECASE)

# A browser-ish UA — some servers reject the default urllib agent.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def trim_url(url: str) -> str:
    """Strip trailing punctuation that commonly gets glued onto URLs in text."""
    return url.rstrip(".,;:!?”’\"')]}>")


def extract_links(pdf_path: str) -> list[dict]:
    """Return a de-duplicated, ordered list of links found in the PDF.

    Each item: {"url": str, "source": "annotation"|"text", "page": int}
    """
    doc = fitz.open(pdf_path)
    seen: set[str] = set()
    links: list[dict] = []

    for page_index in range(doc.page_count):
        page = doc[page_index]

        # 1. Embedded hyperlink annotations.
        for link in page.get_links():
            uri = link.get("uri")
            if uri:
                uri = trim_url(uri.strip())
                if uri and uri not in seen:
                    seen.add(uri)
                    links.append({"url": uri, "source": "annotation", "page": page_index + 1})

        # 2. Bare URLs written out in the text.
        text = page.get_text("text")
        for match in URL_RE.findall(text):
            uri = trim_url(match.strip())
            if uri and uri not in seen:
                seen.add(uri)
                links.append({"url": uri, "source": "text", "page": page_index + 1})

    doc.close()
    return links


def safe_filename(url: str, content_type: str | None, index: int) -> str:
    """Derive a reasonable, filesystem-safe filename for a URL."""
    path = unquote(urlparse(url).path)
    name = os.path.basename(path.rstrip("/"))
    from_path = bool(name)

    # No usable name in the path (e.g. https://host/ or query-only) -> use the host.
    if not name:
        name = urlparse(url).netloc.replace(":", "_") or "download"

    # Strip anything weird; keep it tame for any filesystem.
    name = re.sub(r'[^A-Za-z0-9._-]+', "_", name).strip("._") or "download"

    # Ensure an extension. A path basename's own extension is trusted; a
    # host-derived name's dots are part of the domain, so always add one there.
    has_path_ext = from_path and "." in name
    if not has_path_ext:
        ext = mimetypes.guess_extension((content_type or "").split(";")[0].strip() or "") or ""
        if ext and not name.endswith(ext):
            name += ext

    # Prefix with an index so nothing collides.
    return f"{index:03d}_{name}"


def download_one(link: dict, index: int, out_dir: str) -> tuple[dict, str]:
    """Download a single link. Returns (link, status_message)."""
    url = link["url"]
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type")
            data = resp.read()
    except HTTPError as e:
        return link, f"HTTP {e.code} {e.reason}"
    except URLError as e:
        return link, f"failed: {e.reason}"
    except Exception as e:  # noqa: BLE001 - report anything else cleanly
        return link, f"failed: {e}"

    filename = safe_filename(url, content_type, index)
    dest = os.path.join(out_dir, filename)
    with open(dest, "wb") as f:
        f.write(data)
    kb = len(data) / 1024
    return link, f"saved -> {filename} ({kb:.0f} KB)"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract links from a PDF and download what they point to."
    )
    parser.add_argument("pdf", help="path to the input PDF")
    parser.add_argument(
        "-o", "--output", default=None,
        help="output directory (default: <pdf-name>_links next to the PDF)",
    )
    parser.add_argument(
        "--list-only", action="store_true",
        help="only print the links found; do not download",
    )
    parser.add_argument(
        "--workers", type=int, default=5,
        help="number of concurrent downloads (default: 5)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.pdf):
        sys.exit(f"No such file: {args.pdf}")

    links = extract_links(args.pdf)
    if not links:
        print("No links found in the PDF.")
        return 0

    print(f"Found {len(links)} unique link(s):\n")
    for i, link in enumerate(links, 1):
        print(f"  {i:3d}. [p{link['page']}, {link['source']}] {link['url']}")

    if args.list_only:
        return 0

    out_dir = args.output or (os.path.splitext(args.pdf)[0] + "_links")
    os.makedirs(out_dir, exist_ok=True)
    print(f"\nDownloading into: {out_dir}\n")

    ok = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(download_one, link, i, out_dir): i
            for i, link in enumerate(links, 1)
        }
        for fut in as_completed(futures):
            link, status = fut.result()
            mark = "OK " if status.startswith("saved") else "ERR"
            if mark == "OK ":
                ok += 1
            else:
                failed += 1
            print(f"  [{mark}] {link['url']}\n        {status}")

    print(f"\nDone. {ok} downloaded, {failed} failed. Files in: {out_dir}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
