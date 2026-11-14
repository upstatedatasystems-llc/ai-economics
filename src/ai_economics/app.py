"""AI Economics: immutable research catalog, safe source monitoring and static preview.

Designed for minimal-resource Oracle Cloud VMs. No resident API server or GPUs.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile

from .model import estimate, estimate_macro, estimate_workload
from . import monitor

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "research" / "catalog.json"
WORKLOADS = ROOT / "research" / "workloads.json"
MACRO = ROOT / "research" / "macro.json"
DB = ROOT / "var" / "source-monitor.sqlite"
SITE = ROOT / "site"


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
                raise ValueError("negative pricing value")
        if p["cached_input_usd_m"] > p["input_usd_m"]:
            raise ValueError("cached input price exceeds uncached price")
    return data


def load_workloads():
    data = json.loads(WORKLOADS.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise ValueError("unsupported workload schema")
    ids = [w["id"] for w in data["examples"]]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate workload ID")
    c = load_catalog()
    for workload in data["examples"]:
        estimate_workload(c, "openai", workload)
    return data


def load_macro():
    data = json.loads(MACRO.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise ValueError("unsupported macro schema")
    return data


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def collect(*, force: bool = False):
    result = monitor.collect(load_catalog(), DB, force=force)
    write_json(ROOT / "var" / "last-collection.json", result)
    return result


def health():
    return monitor.health(load_catalog(), DB)


def build():
    research = load_catalog()
    research["generated_at"] = now()
    research["data_policy"] = (
        "Numerical facts are reviewed in git. Automated monitoring detects potential "
        "price evidence changes but never rewrites published figures."
    )
    research["workloads"] = load_workloads()
    research["macro"] = load_macro()
    research["sample_results"] = {
        p["id"]: estimate(research, p["id"])
        for p in research["providers"]
    }
    research["sample_workload_results"] = {
        w["id"]: estimate_workload(research, "openai", w)
        for w in research["workloads"]["examples"]
    }
    research["sample_macro_results"] = {
        p["id"]: estimate_macro(
            research, p["id"], research["workloads"]["examples"],
            research["macro"]["profiles"][p["id"]]
        )
        for p in research["providers"]
    }
    write_json(SITE / "data" / "research.json", research)
    write_json(SITE / "data" / "health.json", health())
    print("Built " + str(SITE / "data" / "research.json"))


def export(target: Path):
    build()
    destination = target / "ai-economics"
    if destination.resolve() == SITE.resolve():
        raise ValueError("destination must differ from site")
    (destination / "data").mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "styles.css", "core.js", "app.js", "favicon.svg"):
        shutil.copy2(SITE / name, destination / name)
    for name in ("research.json", "health.json"):
        shutil.copy2(SITE / "data" / name, destination / "data" / name)
    print("Exported " + str(destination))


def serve(port: int):
    if port < 1024 or port > 65535:
        raise ValueError("port must be 1024..65535")
    build()
    handler = partial(SimpleHTTPRequestHandler, directory=str(SITE))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print("Local preview: http://127.0.0.1:" + str(port), flush=True)
        server.serve_forever()


def acknowledge(sid: str):
    monitor.acknowledge(load_catalog(), DB, sid)


def diagnostics(output: Path):
    """Safe diagnostic tarball: no secret files, private prompts or raw HTML."""
    output.parent.mkdir(parents=True, exist_ok=True)
    assets = {name: (SITE / name).exists() for name in (
        "index.html", "styles.css", "core.js", "app.js", "favicon.svg",
        "data/research.json", "data/health.json")}
    try:
        tests = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"],
            cwd=ROOT, capture_output=True, text=True, timeout=35, check=False,
            env={**os.environ, "PYTHONPATH": str(ROOT / "src")},
        )
        result = tests.returncode
        test_log = (tests.stdout + "\n" + tests.stderr)[-16000:]
    except (OSError, subprocess.TimeoutExpired) as exc:
        result, test_log = -1, "Test runner error: " + type(exc).__name__
    info = {
        "schema_version": 1, "created_at": now(),
        "python_version": sys.version.split()[0],
        "platform": platform.system() + "/" + platform.machine(),
        "test_exit_code": result, "asset_presence": assets,
        "monitor_summary": health().get("summary", {}),
        "repo_commit": None,
        "privacy": "No SSH keys, IP addresses, pasted prompt data, tokens or other projects."
    }
    try:
        git = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
            text=True, timeout=5, check=False)
        if git.returncode == 0:
            info["repo_commit"] = git.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    files = {
        "diagnostics/manifest.json": json.dumps(info, indent=2),
        "diagnostics/health.json": json.dumps(health(), indent=2),
        "diagnostics/tests.log": test_log,
        "diagnostics/collection.json": (
            (ROOT / "var" / "last-collection.json").read_text(encoding="utf-8")
            if (ROOT / "var" / "last-collection.json").exists()
            else "{}")
    }
    with tarfile.open(output, "w:gz") as tar:
        for name, value in files.items():
            body = value.encode("utf-8")
            record = tarfile.TarInfo(name)
            record.size, record.mtime = len(body), 0
            tar.addfile(record, io.BytesIO(body))
    print("Diagnostics saved: " + str(output))


def main(argv=None):
    parser = argparse.ArgumentParser(prog="ai-economics")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("build", "health", "test-model"):
        commands.add_parser(name)
    for name in ("collect", "refresh"):
        commands.add_parser(name).add_argument(
            "--force", action="store_true", help="Ignore source-specific collection intervals")
    server = commands.add_parser("serve")
    server.add_argument("--port", type=int, default=8765)
    publish = commands.add_parser("export")
    publish.add_argument("--target", type=Path, default=ROOT / "dist")
    approve = commands.add_parser("ack-source")
    approve.add_argument("source_id")
    diag = commands.add_parser("diagnostics")
    diag.add_argument("--output", type=Path, default=ROOT / "var" / "ai-economics-diagnostics.tar.gz")
    args = parser.parse_args(argv)
    if args.command in ("collect", "refresh"):
        data = collect(force=args.force)
        print(json.dumps(data, indent=2))
        if args.command == "refresh":
            build()
        return 2 if any(s["status"] == "fetch_error" for s in data["sources"]) else 0
    if args.command == "build":
        build()
    elif args.command == "health":
        print(json.dumps(health(), indent=2))
    elif args.command == "test-model":
        print(json.dumps(estimate(load_catalog(), "openai"), indent=2))
    elif args.command == "serve":
        serve(args.port)
    elif args.command == "export":
        export(args.target)
    elif args.command == "ack-source":
        acknowledge(args.source_id)
        build()
    elif args.command == "diagnostics":
        diagnostics(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
