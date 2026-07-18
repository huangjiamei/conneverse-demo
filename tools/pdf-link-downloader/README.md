# PDF Link Downloader

Extract every link from a PDF and download what each one points to.

It collects **both**:

- **Embedded hyperlinks** — clickable link annotations in the PDF.
- **URLs in the text** — plain `http(s)://` URLs written out in the visible text.

Links are merged and de-duplicated, then **everything** is downloaded (any file type).

## Setup (one time)

```bash
cd tools/pdf-link-downloader
python3 -m pip install -r requirements.txt
```

## Usage

```bash
# Download into <pdf-name>_links/ next to the PDF
python3 download_pdf_links.py report.pdf

# Choose the output folder
python3 download_pdf_links.py report.pdf -o ./downloads

# Just list the links, don't download
python3 download_pdf_links.py report.pdf --list-only

# More parallel downloads
python3 download_pdf_links.py report.pdf --workers 10
```

## Notes

- Files are saved as `001_name.ext`, `002_…` so nothing overwrites anything else.
- If a URL has no filename/extension, one is guessed from the server's content type.
- Failed downloads are reported but don't stop the rest; exit code is non-zero if any failed.
- Only `http`/`https` links are downloaded (e.g. `mailto:` links are ignored).
