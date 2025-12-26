#!/usr/bin/env python3
"""
Bulk runner that feeds job URLs into the local Resume Intelligence backend and downloads
the generated PDFs/JSON artifacts. This avoids the browser extension by scraping the job
page directly from each URL.

Requirements:
- Python 3.9+
- pip install requests beautifulsoup4 (optional: readability-lxml for better extraction)

Example:
  python bulk_tailor.py --urls-file ../../job_urls.txt --backend http://localhost:3001 --output ./bulk_outputs
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

try:
    # Optional: improves description extraction when present.
    from readability import Document  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Document = None


DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
}
DEFAULT_POLL_SECONDS = 8


def read_urls(file_path: Path) -> List[str]:
    urls: List[str] = []
    for line in file_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        urls.append(stripped)
    return urls


def clean_text(text: str) -> str:
    return " ".join(text.split())


def first_text(soup: BeautifulSoup, selectors: List[str]) -> str:
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            text = clean_text(node.get_text(" ", strip=True))
            if text:
                return text
    return ""


def extract_description(html: str, soup: BeautifulSoup) -> str:
    description = first_text(
        soup,
        [
            "[data-qa='job-description']",
            "[data-test-description]",
            ".job-description",
            "article",
            "main",
        ],
    )
    if description:
        return description

    if Document:
        try:
            doc = Document(html)
            summary_html = doc.summary()
            summary_soup = BeautifulSoup(summary_html, "html.parser")
            candidate = clean_text(summary_soup.get_text(" ", strip=True))
            if candidate:
                return candidate
        except Exception:
            pass

    body = soup.body or soup
    return clean_text(body.get_text(" ", strip=True))


def slugify(*parts: str) -> str:
    raw = "-".join([p for p in parts if p]).lower()
    safe = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return safe or "job"


def build_job_payload(url: str, html: str) -> Dict[str, object]:
    soup = BeautifulSoup(html, "html.parser")
    title = first_text(
        soup,
        ["h1", "h2", "[data-test-title]", "[data-qa='job-title']", "title"],
    )
    if not title and soup.title and soup.title.string:
        title = clean_text(soup.title.string)

    company = first_text(
        soup, ["[data-test-company]", "[data-qa='company-name']", ".job-company", ".company"]
    )
    location = first_text(
        soup, ["[data-test-location]", "[data-qa='job-location']", ".job-location", ".location"]
    )
    description = extract_description(html, soup)
    if not description:
        raise ValueError("No job description text found on the page.")

    parsed = urlparse(url)
    platform = parsed.hostname or ""

    return {
        "job": {
            "title": title or "",
            "company": company or "",
            "location": location or "",
            "description_text": description,
            "job_url": url,
            "source_platform": platform,
        },
        "meta": {
            "url": url,
            "platform": platform,
            "extraction_method": "python_script",
            "user_tags": [],
            "notes": "",
        },
    }


def fetch_html(session: requests.Session, url: str) -> str:
    resp = session.get(url, headers=DEFAULT_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def start_run(
    session: requests.Session, backend: str, payload: Dict[str, object], resume_id: Optional[str]
) -> str:
    body: Dict[str, object] = {"job_payload": payload}
    if resume_id:
        body["resume_id"] = resume_id
    resp = session.post(urljoin(backend, "/analyze"), json=body, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if "run_id" not in data:
        raise RuntimeError(f"Backend did not return a run_id: {data}")
    return str(data["run_id"])


def poll_status(
    session: requests.Session, backend: str, run_id: str, poll_seconds: int, verbose: bool = True
) -> Dict[str, object]:
    status_url = urljoin(backend, f"/status/{run_id}")
    last_stage = None
    last_state = None
    while True:
        resp = session.get(status_url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        stage = (data.get("stage") or "").upper()
        state = (data.get("status") or "").lower()
        message = data.get("message") or ""

        if verbose and (stage != last_stage or state != last_state):
            print(f"    Status: stage={stage or '?'} state={state or '?'} msg={message}")
            last_stage, last_state = stage, state

        if stage == "DONE" or state == "success":
            return data
        if stage == "ERROR" or state == "error":
            raise RuntimeError(f"Run {run_id} failed: {message}")

        time.sleep(poll_seconds)


def download_artifacts(
    session: requests.Session, backend: str, files: Dict[str, str], dest_dir: Path
) -> List[Path]:
    saved: List[Path] = []
    if not files:
        return saved

    interesting_keys = {
        "pdf",
        "json",
        "final_resume",
        "meta",
        "job_text",
        "selection_plan",
    }

    for key, relative in sorted(files.items()):
        if not (key in interesting_keys or key.startswith("pdf_") or key.startswith("json_") or key.startswith("final_resume_")):
            continue

        dest_name = f"{key}{Path(relative).suffix or ''}"
        dest_path = dest_dir / dest_name
        full_url = urljoin(backend.rstrip("/") + "/", relative.lstrip("/"))
        try:
            with session.get(full_url, stream=True, timeout=30) as resp:
                resp.raise_for_status()
                with open(dest_path, "wb") as fh:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            fh.write(chunk)
            saved.append(dest_path)
        except Exception as error:
            print(f"[warn] Failed to download {key} from {full_url}: {error}", file=sys.stderr)
    return saved


def main() -> int:
    parser = argparse.ArgumentParser(description="Bulk tailor resumes for a list of job URLs.")
    parser.add_argument("--urls-file", required=True, help="Path to a text file with one job URL per line.")
    parser.add_argument(
        "--backend",
        default="http://localhost:3001",
        help="Base URL for the running backend (default: http://localhost:3001).",
    )
    parser.add_argument(
        "--resume-id",
        default=None,
        help="Resume id to use (defaults to backend default).",
    )
    parser.add_argument(
        "--output",
        default="./bulk_outputs",
        help="Folder to write downloaded PDFs/JSON (created if missing).",
    )
    parser.add_argument(
        "--poll-seconds",
        type=int,
        default=DEFAULT_POLL_SECONDS,
        help=f"Seconds between status polls (default: {DEFAULT_POLL_SECONDS}).",
    )
    args = parser.parse_args()

    urls_file = Path(args.urls_file).expanduser().resolve()
    if not urls_file.exists():
        print(f"URLs file not found: {urls_file}", file=sys.stderr)
        return 1

    urls = read_urls(urls_file)
    if not urls:
        print("No URLs found in the provided file.", file=sys.stderr)
        return 1

    output_dir = Path(args.output).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    backend = args.backend.rstrip("/")
    resume_id = args.resume_id

    for idx, url in enumerate(urls, start=1):
        print(f"\n[{idx}/{len(urls)}] Processing {url}")
        try:
            html = fetch_html(session, url)
            print(f"  Downloaded HTML ({len(html)} bytes)")
            job_payload = build_job_payload(url, html)
            job = job_payload.get("job", {}) if isinstance(job_payload, dict) else {}
            title = job.get("title") or "(no title)"
            company = job.get("company") or "(no company)"
            desc_len = len(job.get("description_text") or "")
            print(f"  Parsed job → title: {title} | company: {company} | desc chars: {desc_len}")

            run_id = start_run(session, backend, job_payload, resume_id)
            print(f"  Started run: {run_id} (backend={backend}, resume_id={resume_id or 'default'})")

            status = poll_status(session, backend, run_id, args.poll_seconds, verbose=True)
            print(f"  Completed run: {run_id} stage={status.get('stage')} state={status.get('status')}")
            files = status.get("files", {})
            title = job_payload["job"].get("title", "") if isinstance(job_payload, dict) else ""
            company = job_payload["job"].get("company", "") if isinstance(job_payload, dict) else ""
            slug = slugify(company, title, f"run-{run_id[:8]}")
            run_dir = output_dir / f"{idx:03d}_{slug}"
            run_dir.mkdir(parents=True, exist_ok=True)

            (run_dir / "job_payload.json").write_text(json.dumps(job_payload, indent=2), encoding="utf-8")
            (run_dir / "status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")

            saved = download_artifacts(session, backend, files, run_dir)
            saved_names = ", ".join(path.name for path in saved) if saved else "nothing"
            print(f"  Done. Saved: {saved_names}")
        except Exception as error:
            print(f"[error] Failed to process {url}: {error}", file=sys.stderr)

    print("\nAll URLs processed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
