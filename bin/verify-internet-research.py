#!/usr/bin/env python3
"""verify-internet-research.py — validate URL + date + quote citations in research subagent reports.

For every cited URL in the report:
  1. Fetch the page (15s timeout, on-disk cache)
  2. Extract publication date from meta-tags / <time datetime> / JSON-LD / URL pattern
  3. Reject if no date, dated before --cutoff, or mismatches the agent's claimed date
For every quoted "..." attributed to a URL:
  1. Fetch the page text
  2. Check the quote is a normalized substring of the page text (case + whitespace tolerant)
  3. PARTIAL if first 40 chars match but rest diverges (paraphrase drift)

Usage:
    verify-internet-research.py REPORT_FILE [--cutoff YYYY-MM-DD] [--cache-dir PATH]
                                            [--insecure] [--timeout SEC] [--json]
    verify-internet-research.py - < report.md         # stdin

Exit codes:
    0 — all citations PASS
    1 — one or more failed
    2 — usage error
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 verify-research/1.0"

URL_RE = re.compile(r"https?://[^\s\)\]>'\"]+")
NUMBERED_LINE_RE = re.compile(r"^\s*(?:\d+|[-*])[\.\)]?\s+(.+?)\s*$", re.MULTILINE)
DATE_IN_PAREN_RE = re.compile(r"\((\d{4}-\d{2}-\d{2})")
# Match YYYY-MM-DD with no surrounding digits — works inside ISO datetimes like
# `2026-02-24T13:13:39.700Z` where `\b` would fail because T is a word char.
ISO_DATE_RE = re.compile(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)")
QUOTE_RE = re.compile(r'["“]([^"”\n]{8,500})["”]')


class PageParser(HTMLParser):
    """Extract text content + meta dates + JSON-LD dates."""

    def __init__(self):
        super().__init__()
        self._text: list[str] = []
        self._skip = 0
        self._in_jsonld = False
        self._jsonld_buf: list[str] = []
        self.meta: dict[str, str] = {}
        self.times: list[str] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag in ("script", "style", "noscript"):
            if tag == "script" and (d.get("type", "").lower() == "application/ld+json"):
                self._in_jsonld = True
                self._jsonld_buf = []
            self._skip += 1
        if tag == "meta":
            name = (d.get("name") or d.get("property") or "").lower()
            content = d.get("content") or ""
            if name and content and name not in self.meta:
                self.meta[name] = content
        if tag == "time" and d.get("datetime"):
            self.times.append(d["datetime"])

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            if tag == "script" and self._in_jsonld:
                self._in_jsonld = False
                try:
                    self._extract_jsonld(json.loads("".join(self._jsonld_buf)))
                except json.JSONDecodeError:
                    pass
            self._skip = max(0, self._skip - 1)

    def handle_data(self, data):
        if self._in_jsonld:
            self._jsonld_buf.append(data)
        elif self._skip == 0:
            self._text.append(data)

    def _extract_jsonld(self, data):
        if isinstance(data, dict):
            for k, v in data.items():
                if k.lower() in ("datepublished", "datecreated", "datemodified"):
                    if isinstance(v, str):
                        self.times.append(v)
                if isinstance(v, (dict, list)):
                    self._extract_jsonld(v)
        elif isinstance(data, list):
            for item in data:
                self._extract_jsonld(item)

    def text(self) -> str:
        return " ".join(self._text)


def normalize(s: str) -> str:
    if not s:
        return ""
    s = s.replace("‘", "'").replace("’", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def normalize_punct_loose(s: str) -> str:
    """Strip all quote marks, backticks, ellipses — used as a fallback to detect
    cases where the agent transcribed a quote with wrong quote-mark style
    (e.g. single quotes around a word that the page has in double quotes)."""
    s = normalize(s)
    s = s.replace("'", "").replace('"', "").replace("`", "")
    s = s.replace("...", " ").replace("…", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def url_date(url: str) -> str | None:
    """Date encoded in URL path (/2026/03/30/...)."""
    m = re.search(r"/(\d{4})/(\d{1,2})/(\d{1,2})/", url)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
    return None


def fetch(url: str, cache_dir: Path, timeout: int, insecure: bool) -> tuple[bool, str, str]:
    """Returns (ok, body, error). Caches successful fetches by URL hash."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", url)[-200:]
    cache_path = cache_dir / safe
    if cache_path.exists():
        try:
            return True, cache_path.read_text(errors="replace"), ""
        except OSError:
            pass

    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    ctx = ssl.create_default_context()
    if insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            body = resp.read().decode("utf-8", errors="replace")
        try:
            cache_path.write_text(body)
        except OSError:
            pass
        return True, body, ""
    except urllib.error.HTTPError as e:
        return False, "", f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return False, "", f"URL error: {e.reason}"
    except (TimeoutError, ssl.SSLError) as e:
        return False, "", f"timeout/SSL: {e}"
    except Exception as e:  # pragma: no cover
        return False, "", f"error: {e}"


def extract_date(html: str, fallback_url: str | None = None) -> str | None:
    p = PageParser()
    try:
        p.feed(html)
    except Exception:
        pass
    for key in ("article:published_time", "article:modified_time",
                "datepublished", "date", "dc.date", "pubdate", "og:published_time"):
        v = p.meta.get(key)
        if v:
            m = ISO_DATE_RE.search(v)
            if m:
                return m.group(1)
    for t in p.times:
        m = ISO_DATE_RE.search(t)
        if m:
            return m.group(1)
    if fallback_url:
        return url_date(fallback_url)
    return None


def extract_text(html: str) -> str:
    p = PageParser()
    try:
        p.feed(html)
    except Exception:
        pass
    return p.text()


def parse_findings(report: str) -> list[dict]:
    out = []
    for m in NUMBERED_LINE_RE.finditer(report):
        line = m.group(1)
        url_m = URL_RE.search(line)
        if not url_m:
            continue
        url = url_m.group(0).rstrip(",.;)\"'`>")
        date_m = DATE_IN_PAREN_RE.search(line)
        out.append({
            "kind": "finding",
            "url": url,
            "claimed_date": date_m.group(1) if date_m else None,
            "raw": line[:300],
        })
    return out


def parse_quotes(report: str) -> list[dict]:
    out = []
    for m in QUOTE_RE.finditer(report):
        end = m.end()
        window = report[end:end + 600]
        url_m = URL_RE.search(window)
        if not url_m:
            continue
        url = url_m.group(0).rstrip(",.;)\"'`>")
        out.append({
            "kind": "quote",
            "quote": m.group(1),
            "url": url,
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().split("\n")[0])
    ap.add_argument("report", help="path to report (or '-' for stdin)")
    ap.add_argument("--cutoff", default="2025-10-01",
                    help="reject sources dated before this (ISO date)")
    ap.add_argument("--cache-dir", default=str(Path.home() / ".claude" / "verify-cache"))
    ap.add_argument("--insecure", action="store_true")
    ap.add_argument("--timeout", type=int, default=15)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    text = sys.stdin.read() if args.report == "-" else Path(args.report).read_text()
    cache = Path(args.cache_dir)

    findings = parse_findings(text)
    quotes = parse_quotes(text)
    urls = sorted({c["url"] for c in findings + quotes})

    if not args.json:
        print(f"Report: {args.report}")
        print(f"Citations: {len(findings)} findings, {len(quotes)} quotes, {len(urls)} unique URLs")
        print(f"Cutoff: {args.cutoff}\n")

    pages: dict[str, tuple[bool, str, str]] = {}
    for url in urls:
        if not args.json:
            print(f"  fetching {url[:80]}...", flush=True)
        pages[url] = fetch(url, cache, args.timeout, args.insecure)

    finding_results = []
    for c in findings:
        ok, body, err = pages[c["url"]]
        if not ok:
            verdict, notes = "URL_DEAD", err
        else:
            page_date = extract_date(body, c["url"])
            if not page_date:
                verdict, notes = "NO_DATE", "page has no meta/time/JSON-LD/URL date — agent shouldn't cite"
            elif page_date < args.cutoff:
                verdict, notes = "TOO_OLD", f"page date {page_date} < cutoff {args.cutoff}"
            elif c["claimed_date"] and c["claimed_date"] != page_date:
                verdict, notes = "DATE_MISMATCH", f"agent: {c['claimed_date']}, page: {page_date}"
            else:
                verdict = "PASS"
                notes = f"date={page_date}" + (" (from URL)" if not extract_date(body) else "")
        finding_results.append({**c, "verdict": verdict, "notes": notes})

    quote_results = []
    for q in quotes:
        ok, body, err = pages[q["url"]]
        if not ok:
            verdict, notes = "URL_DEAD", err
        else:
            page_text = normalize(extract_text(body))
            quote_n = normalize(q["quote"])
            if quote_n in page_text:
                verdict, notes = "PASS", "verbatim"
            else:
                # Try with quote-marks/ellipses stripped — catches transcription errors
                # like agent quoting 'word' when page has "word"
                page_loose = normalize_punct_loose(extract_text(body))
                quote_loose = normalize_punct_loose(q["quote"])
                if quote_loose and quote_loose in page_loose:
                    verdict = "QUOTE_STYLE"
                    notes = "substance matches; agent altered quote marks or used ellipsis"
                elif quote_n[:40] and quote_n[:40] in page_text:
                    verdict, notes = "PARTIAL", "first 40 chars match; rest diverges (paraphrase drift)"
                elif quote_loose[:40] and quote_loose[:40] in page_loose:
                    verdict, notes = "PARTIAL", "first 40 chars (loose) match; rest diverges"
                else:
                    verdict, notes = "NOT_FOUND", "quote not on page (likely paraphrase or fabrication)"
        quote_results.append({**q, "verdict": verdict, "notes": notes})

    # PASS and QUOTE_STYLE count as soft-pass (substance correct).
    # Everything else is a real fail.
    failed = sum(1 for r in finding_results + quote_results
                 if r["verdict"] not in ("PASS", "QUOTE_STYLE"))

    if args.json:
        print(json.dumps({
            "cutoff": args.cutoff,
            "findings": finding_results,
            "quotes": quote_results,
            "summary": {
                "findings_total": len(finding_results),
                "findings_pass": sum(1 for r in finding_results if r["verdict"] == "PASS"),
                "quotes_total": len(quote_results),
                "quotes_pass": sum(1 for r in quote_results if r["verdict"] == "PASS"),
                "failed": failed,
            },
        }, indent=2))
    else:
        print(f"\n{'#':>3} {'Verdict':<14} {'URL':<60} Notes")
        print("-" * 130)
        for i, r in enumerate(finding_results, 1):
            url_short = r["url"] if len(r["url"]) <= 58 else r["url"][:55] + "..."
            print(f"{i:>3} {r['verdict']:<14} {url_short:<60} {r['notes']}")
        if quote_results:
            print(f"\nQuote audit:")
            print(f"{'#':>3} {'Verdict':<14} {'URL':<48} {'Quote':<40} Notes")
            print("-" * 140)
            for i, r in enumerate(quote_results, 1):
                url_short = r["url"] if len(r["url"]) <= 46 else r["url"][:43] + "..."
                qstart = r["quote"][:38].replace("\n", " ")
                print(f"{i:>3} {r['verdict']:<14} {url_short:<48} {qstart:<40} {r['notes']}")
        print()
        # Soft-pass = PASS or QUOTE_STYLE (substance correct, presentation issue)
        f_pass = sum(1 for r in finding_results if r["verdict"] == "PASS")
        q_pass = sum(1 for r in quote_results if r["verdict"] == "PASS")
        q_soft = sum(1 for r in quote_results if r["verdict"] == "QUOTE_STYLE")
        from collections import Counter
        f_breakdown = Counter(r["verdict"] for r in finding_results)
        q_breakdown = Counter(r["verdict"] for r in quote_results)
        print(f"Findings: {f_pass}/{len(finding_results)} verbatim PASS — " +
              ", ".join(f"{n} {k}" for k, n in f_breakdown.items() if k != "PASS"))
        q_summary = f"Quotes:   {q_pass}/{len(quote_results)} verbatim PASS"
        if q_soft:
            q_summary += f" + {q_soft} QUOTE_STYLE (substance OK)"
        other = ", ".join(f"{n} {k}" for k, n in q_breakdown.items() if k not in ("PASS", "QUOTE_STYLE"))
        if other:
            q_summary += f" — {other}"
        print(q_summary)
        if failed:
            print(f"\n⚠ {failed} citation(s) need agent rework or removal.")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
