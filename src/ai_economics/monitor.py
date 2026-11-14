"""Conservative, low-resource public source monitor.

Do not use full HTML byte hashes as price-change evidence. Detect only
normalized price-bearing text, and NEVER overwrite reviewed catalog values.
Sources that block automation or lack a reliable format are explicitly manual.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import urllib.error
import urllib.request

MAX_BYTES = 2_000_000
USER_AGENT = "AI-Economics-Research/0.3 (public research; https://github.com/upstatedatasystems-llc/ai-economics)"
MONEY = re.compile(r"(?:US\s*\$|\$|USD\s*)\s*\d[\d,.]*(?:\s*(?:/|per)\s*(?:million|1m|month|hour|token|input|output))?", re.I)
PRICE_TERMS = re.compile(r"token|model|input|output|pricing|plan|standard|batch|million|hour|flash|sonnet|plus|pro|p5|h100|cache", re.I)
WS = re.compile(r"\s+")
SKIP = {"script", "style", "svg", "noscript", "nav", "footer"}
BLOCKS = {"p", "li", "tr", "h1", "h2", "h3", "h4", "td"}


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class PriceEvidenceParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.block = []
        self.chunks = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        if self.skip == 0 and tag in BLOCKS:
            self.block.append([tag, []])

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip:
            self.skip -= 1
        if self.skip == 0 and self.block:
            for index in range(len(self.block) - 1, -1, -1):
                if self.block[index][0] == tag:
                    block = self.block.pop(index)
                    value = WS.sub(" ", " ".join(block[1])).strip()
                    if value:
                        self.chunks.append(value)
                    break

    def handle_data(self, data):
        if self.skip:
            return
        if self.block:
            for item in self.block:
                item[1].append(data)


def meaningful_evidence(body: bytes, content_type: str) -> list[str]:
    """Return conservative, de-duplicated price-related text lines.

    Never claim these are validated rates; a changed result is only a
    *candidate* requiring source review.
    """
    if "html" not in content_type.lower():
        return []
    parser = PriceEvidenceParser()
    parser.feed(body.decode("utf-8", errors="replace"))
    evidence = set()
    for raw in parser.chunks:
        value = WS.sub(" ", raw).strip()
        if len(value) > 340:
            continue  # Prevent dynamic whole-page containers.
        if MONEY.search(value) and PRICE_TERMS.search(value):
            evidence.add(value.lower())
    return sorted(evidence)


def db_open(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    # v2 tables intentionally do not interpret old raw-byte digest records
    # as trusted evidence. Existing v1 data is retained for audit.
    conn.execute("""CREATE TABLE IF NOT EXISTS monitor_v2(
        id TEXT PRIMARY KEY, digest TEXT, acknowledged_digest TEXT,
        status TEXT, checked_at TEXT, last_success_at TEXT,
        error TEXT, evidence_count INTEGER DEFAULT 0, mode TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS monitor_history_v2(
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, checked_at TEXT,
        status TEXT, digest TEXT, error TEXT, evidence_count INTEGER)""")
    return conn


def request_content(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read(MAX_BYTES + 1)
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
    if len(body) > MAX_BYTES:
        raise ValueError("source exceeds 2 MB cap; require structured feed or manual review")
    return body, content_type


def collect(catalog: dict, db_path: Path, *, force=False, fetcher=None, clock=None) -> dict:
    """Sequential collection with due-date scheduling; never write numeric prices.

    fetcher injection allows deterministic offline tests. Returns structured
    statuses with accurate distinction between manual, blocked and candidates.
    """
    fetcher = fetcher or request_content
    clock = clock or utcnow
    stamp = clock()
    timestamp = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    observations = []
    with db_open(db_path) as conn:
        for source in catalog["sources"]:
            sid = source["id"]
            mode = source.get("monitor_mode", "manual")
            old = conn.execute("""SELECT digest, acknowledged_digest, status, checked_at,
                                        last_success_at, evidence_count
                                  FROM monitor_v2 WHERE id=?""", (sid,)).fetchone()
            old_digest, ack, prev_status, checked, last_ok, previous_n = (
                old if old else (None, None, None, None, None, 0))
            if mode == "manual":
                observations.append({"id": sid, "status": "manual_review", "checked_at": stamp,
                                     "mode": mode, "error": None, "evidence_count": 0})
                # Historical failures are not carried forward for manual sources.
                conn.execute("""INSERT INTO monitor_v2
                    (id, digest, acknowledged_digest, status, checked_at, last_success_at, error, evidence_count, mode)
                    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                    status='manual_review', mode='manual', error=NULL, checked_at=excluded.checked_at""",
                    (sid, None, None, "manual_review", stamp, None, None, 0, "manual"))
                continue
            due_days = max(1, int(source.get("frequency_days", 1)))
            if checked and not force:
                last = datetime.fromisoformat(checked.replace("Z", "+00:00"))
                if timestamp - last < timedelta(days=due_days):
                    observations.append({"id": sid, "status": "not_due",
                                         "last_status": prev_status, "checked_at": checked,
                                         "mode": mode, "error": None,
                                         "evidence_count": previous_n})
                    continue
            digest = old_digest
            status = "unverifiable"
            error = None
            count = 0
            success = last_ok
            try:
                body, content_type = fetcher(source["url"])
                evidence = meaningful_evidence(body, content_type)
                count = len(evidence)
                if not evidence:
                    status = "unverifiable"
                    error = "No stable, price-bearing HTML evidence; keep catalog reviewed manually"
                else:
                    encoded = json.dumps(evidence, ensure_ascii=False, separators=(",", ":"))
                    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
                    success = stamp
                    if old_digest is None:
                        status = "baseline_observed"
                    elif digest != old_digest or (
                        ack is not None and digest != ack):
                        status = "candidate_change"
                    elif prev_status == "candidate_change" and ack != digest:
                        status = "candidate_change"
                    else:
                        status = "unchanged"
            except urllib.error.HTTPError as exc:
                status = "blocked" if exc.code in (401, 403, 429) else "fetch_error"
                error = "HTTP " + str(exc.code) + " (" + ("blocked/rate-limited" if status == "blocked" else "upstream failure") + ")"
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
                status = "fetch_error"
                error = (str(exc) or type(exc).__name__)[:200]
            conn.execute("""INSERT INTO monitor_v2
                (id,digest,acknowledged_digest,status,checked_at,last_success_at,error,evidence_count,mode)
                VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                digest=excluded.digest, status=excluded.status, checked_at=excluded.checked_at,
                last_success_at=excluded.last_success_at,
                error=excluded.error, evidence_count=excluded.evidence_count,
                mode=excluded.mode""",
                (sid, digest, ack, status, stamp, success, error, count, mode))
            conn.execute("""INSERT INTO monitor_history_v2
                (id,checked_at,status,digest,error,evidence_count) VALUES (?,?,?,?,?,?)""",
                (sid, stamp, status, digest, error, count))
            observations.append({"id": sid, "status": status, "mode": mode, "checked_at": stamp,
                                 "error": error, "evidence_count": count})
    return {"checked_at": stamp, "sources": observations,
            "summary": {status: sum(x["status"] == status for x in observations)
                        for status in sorted({x["status"] for x in observations})}}


def health(catalog: dict, db_path: Path) -> dict:
    if not db_path.exists():
        return {"last_collection": None, "sources": [
            {"id": s["id"], "status": "manual_review" if s.get("monitor_mode") == "manual" else "not_checked",
             "mode": s.get("monitor_mode", "manual")}
            for s in catalog["sources"]], "schema_version": 2}
    with db_open(db_path) as db:
        stored = {r[0]: r for r in db.execute("""SELECT id,status,checked_at,
                                            last_success_at,error,evidence_count,mode FROM monitor_v2""")}
    result = []
    for source in catalog["sources"]:
        r = stored.get(source["id"])
        result.append({"id": source["id"],
                       "status": r[1] if r else ("manual_review" if source.get("monitor_mode") == "manual" else "not_checked"),
                       "checked_at": r[2] if r else None,
                       "last_success_at": r[3] if r else None,
                       "error": r[4] if r else None,
                       "evidence_count": r[5] if r else 0,
                       "mode": source.get("monitor_mode", "manual")})
    checks = [s["checked_at"] for s in result if s.get("checked_at")]
    return {"schema_version": 2, "last_collection": max(checks) if checks else None,
            "sources": result, "summary": {status: sum(x["status"] == status for x in result)
                                          for status in sorted({x["status"] for x in result})}}


def acknowledge(catalog: dict, db_path: Path, sid: str):
    """Approve only a monitored digest after operator reviewed catalog values.

    This does not update catalog numbers.
    """
    source = next((s for s in catalog["sources"] if s["id"] == sid), None)
    if source is None or source.get("monitor_mode") != "price_watch":
        raise ValueError("Source is not eligible for automated digest acknowledgment")
    with db_open(db_path) as conn:
        row = conn.execute("SELECT digest FROM monitor_v2 WHERE id=?", (sid,)).fetchone()
        if row is None or row[0] is None:
            raise ValueError("No verified extractable evidence available for acknowledgment")
        conn.execute("UPDATE monitor_v2 SET acknowledged_digest=?, status='acknowledged', error=NULL WHERE id=?",
                     (row[0], sid))
