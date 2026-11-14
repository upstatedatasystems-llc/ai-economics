def acknowledge(sid):
    monitor.acknowledge(load_catalog(), DB, sid)


def diagnostics(output: Path):
    """Safe-by-default user-provided diagnostics; never include local prompts or keys."""
    output.parent.mkdir(parents=True, exist_ok=True)
    checks = {}
    for name, filename in (("index", "index.html"), ("styles", "styles.css"),
                           ("logic", "app.js"), ("engine", "core.js"),
                           ("research", "data/research.json")):
        checks[name] = (SITE / filename).exists()
    try:
        test = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"],
            cwd=ROOT, capture_output=True, text=True, timeout=30,
            env={**__import__("os").environ, "PYTHONPATH": str(ROOT / "src")},
            check=False)
        tests = (test.stdout + "\n" + test.stderr)[-12000:]
        tests_result = test.returncode
    except Exception as exc:
        tests, tests_result = "Tests did not run: " + type(exc).__name__, -1
    info = {
        "diagnostics_schema": 1, "created_at": now(),
        "python": sys.version.split()[0],
        "platform": platform.system() + "/" + platform.machine(),
        "git_commit": None, "asset_check": checks,
        "unittest_exit_code": tests_result,
        "source_summary": health().get("summary", {}),
        "privacy_note": "No keys, IP addresses, environment variables, freeform prompt text or private app data."
    }
    try:
        git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                             text=True, timeout=5, check=False)
        if git.returncode == 0:
            info["git_commit"] = git.stdout.strip()
    except Exception:
        pass
    docs = {
        "diagnostics/manifest.json": json.dumps(info, indent=2),
        "diagnostics/source-health.json": json.dumps(health(), indent=2),
        "diagnostics/tests.log": tests,
        "diagnostics/last-collection.json": (
            (ROOT / "var" / "last-collection.json").read_text(encoding="utf-8")
            if (ROOT / "var" / "last-collection.json").exists() else "{}")
    }
    with tarfile.open(output, "w:gz") as tar:
        for name, content in docs.items():
            body = content.encode("utf-8")
            entry = tarfile.TarInfo(name)
            entry.size = len(body)
            entry.mtime = 0
            tar.addfile(entry, io.BytesIO(body))
    print("Created diagnostics: " + str(output))


def main(argv=None):
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    for action in ("build", "health", "test-model"):
        commands.add_parser(action)
    for action in ("collect", "refresh"):
        commands.add_parser(action).add_argument("--force", action="store_true", help="Ignore per-source due dates")
    diag = commands.add_parser("diagnostics", help="Create privacy-conscious diagnostics archive")
    diag.add_argument("--output", type=Path, default=ROOT / "var" / "ai-economics-diagnostics.tar.gz")
    cmd = commands.add_parser("ack-source")
    cmd.add_argument("source_id")
    cmd = commands.add_parser("serve")
    cmd.add_argument("--port", type=int, default=8765)
    cmd = commands.add_parser("export")
    cmd.add_argument("--target", type=Path, default=ROOT / "dist")
    args = parser.parse_args(argv)

    if args.command in ("collect", "refresh"):
        statuses = collect(force=args.force)
        print(json.dumps(statuses, indent=2))
        if args.command == "refresh":
            build()
        return 2 if any(s["status"] == "fetch_error" for s in statuses["sources"]) else 0
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
    elif args.command == "diagnostics":
        diagnostics(args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
