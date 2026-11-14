"""Small research monitor and static-site generator, for low-memory OCI hosts."""
import argparse
from datetime import datetime, timezone
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import urllib.request

from .model import estimate, estimate_workload, estimate_macro

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "research" / "catalog.json"
WORKLOADS = ROOT / "research" / "workloads.json"
MACRO = ROOT / "research" / "macro.json"
DB = ROOT / "var" / "source-monitor.sqlite"
SITE = ROOT / "site"
MAX_BYTES = 2_000_000


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_catalog():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    ids = [s["id"] for s in data["sources"]]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate source ID")
    for p in data["providers"]:
        for key in ("input_usd_m", "cached_input_usd_m", "output_usd_m", "subscription_usd_month"):
            if p[key] < 0:
                raise ValueError("negative pricing")
    return data


def load_workloads():
    data = json.loads(WORKLOADS.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise ValueError("unsupported workload schema")
    ids = [w["id"] for w in data["examples"]]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate workload ID")
    for workload in data["examples"]:
        estimate_workload(load_catalog(), "openai", workload)
    return data


def load_macro():
    document = json.loads(MACRO.read_text(encoding="utf-8"))
    if document.get("schema_version") != 1:
        raise ValueError("unsupported macro schema")
    return document


def database():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.execute("CREATE TABLE IF NOT EXISTS source_state (id TEXT PRIMARY KEY, digest TEXT, approved_digest TEXT, status TEXT, checked_at TEXT, error TEXT)")
    conn.execute("CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, source_id TEXT, digest TEXT, status TEXT, checked_at TEXT)")
    return conn


def fetch_digest(url):
    request = urllib.request.Request(url, headers={
        "User-Agent": "AI-Economics/0.1 (research monitor; https://github.com/upstatedatasystems-llc/ai-economics)"
    })
    with urllib.request.urlopen(request, timeout=12) as resp:
        body = resp.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("source exceeds download limit")
    return hashlib.sha256(body).hexdigest()


def collect():
    result = []
    with database() as db:
        for source in load_catalog()["sources"]:
            sid = source["id"]
            old = db.execute("SELECT digest, approved_digest, status FROM source_state WHERE id=?", (sid,)).fetchone()
            digest, approved, previous_status = old if old else (None, None, None)
            try:
                current = fetch_digest(source["url"])
                if digest is None:
                    status = "first_observation"
                elif current != digest or (approved is not None and current != approved):
                    status = "review_required"
                elif previous_status == "review_required":
                    status = "review_required"
                else:
                    status = "unchanged"
                error = None
                digest = current
            except Exception as exc:
                status, error = "fetch_error", str(exc)[:240]
            stamp = now()
            db.execute("INSERT INTO source_state VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET digest=excluded.digest, status=excluded.status, checked_at=excluded.checked_at, error=excluded.error",
                       (sid, digest, approved, status, stamp, error))
            db.execute("INSERT INTO history(source_id,digest,status,checked_at) VALUES (?,?,?,?)",
                       (sid, digest, status, stamp))
            result.append({"id":sid, "status":status, "checked_at":stamp, "error":error})
    return result


def health():
    if not DB.exists():
        return {"last_collection": None, "sources": [], "note": "Not collected yet"}
    with database() as db:
        rows = db.execute("SELECT id,status,checked_at,error FROM source_state ORDER BY id").fetchall()
    return {"last_collection":max((r[2] for r in rows), default=None),
            "sources":[{"id":r[0],"status":r[1],"checked_at":r[2],"error":r[3]} for r in rows]}


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(path)


def build():
    data = load_catalog()
    data["generated_at"] = now()
    data["policy"] = "Reviewed reference prices; monitor detects changes but never auto-approves prices."
    data["sample_results"] = {p["id"]:estimate(data, p["id"]) for p in data["providers"]}
    data["workloads"] = load_workloads()
    data["macro"] = load_macro()
    data["sample_workload_results"] = {w["id"]:estimate_workload(data, "openai", w) for w in data["workloads"]["examples"]}
    data["sample_macro_results"] = {p["id"]: estimate_macro(data, p["id"], data["workloads"]["examples"], data["macro"]["profiles"][p["id"]]) for p in data["providers"]}
    write_json(SITE / "data" / "research.json", data)
    write_json(SITE / "data" / "health.json", health())
    print("Built " + str(SITE / "data" / "research.json"))


def export(target):
    build()
    out = target / "ai-economics"
    if out.resolve() == SITE.resolve():
        raise ValueError("destination must differ from source")
    (out / "data").mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "styles.css", "core.js", "app.js"):
        shutil.copy2(SITE / name, out / name)
    for name in ("research.json", "health.json"):
        shutil.copy2(SITE / "data" / name, out / "data" / name)
    print("Exported " + str(out))


def serve(port):
    if not 1024 <= port <= 65535:
        raise ValueError("invalid port")
    build()
    handler = partial(SimpleHTTPRequestHandler, directory=str(SITE))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print("Open http://127.0.0.1:" + str(port))
        server.serve_forever()


def acknowledge(sid):
    if sid not in {s["id"] for s in load_catalog()["sources"]}:
        raise ValueError("unknown source")
    with database() as db:
        old = db.execute("SELECT digest FROM source_state WHERE id=?", (sid,)).fetchone()
        if not old or not old[0]:
            raise ValueError("no successful observation")
        db.execute("UPDATE source_state SET approved_digest=?, status='acknowledged' WHERE id=?",
                   (old[0], sid))


def main(argv=None):
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    for action in ("collect", "refresh", "build", "health", "test-model"):
        commands.add_parser(action)
    cmd = commands.add_parser("ack-source")
    cmd.add_argument("source_id")
    cmd = commands.add_parser("serve")
    cmd.add_argument("--port", type=int, default=8765)
    cmd = commands.add_parser("export")
    cmd.add_argument("--target", type=Path, default=ROOT / "dist")
    args = parser.parse_args(argv)

    if args.command in ("collect", "refresh"):
        statuses = collect()
        print(json.dumps(statuses, indent=2))
        if args.command == "refresh":
            build()
        return 2 if any(s["status"] == "fetch_error" for s in statuses) else 0
    if args.command == "build":
        build()
    elif args.command == "health":
        print(json.dumps(health(), indent=2))
    elif args.command == "test-model":
        print(json.dumps(estimate(load_catalog(), "openai"), indent=2))
    elif args.command == "ack-source":
        acknowledge(args.source_id)
        build()
    elif args.command == "serve":
        serve(args.port)
    elif args.command == "export":
        export(args.target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
