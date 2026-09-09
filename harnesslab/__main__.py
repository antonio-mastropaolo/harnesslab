"""``python -m harnesslab`` / the ``harnesslab`` console script.

Flags are parsed *before* the backend is imported, because
``harnesslab.backend.paths`` resolves the lab root at import time from the environment.
"""
from __future__ import annotations

import argparse
import os
import sys

__version__ = "0.3.0"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="harnesslab",
        description="harnesslab -- the web platform for agentlab: run coding-agent cells, watch the "
                    "ledger live, compare harnesses, and train the sentinel.",
    )
    p.add_argument("--host", default=os.environ.get("HARNESSLAB_HOST", "127.0.0.1"),
                   help="interface to bind (default 127.0.0.1; use 0.0.0.0 in a container)")
    p.add_argument("--port", type=int, default=int(os.environ.get("HARNESSLAB_PORT", "8765")),
                   help="port to bind (default 8765)")
    p.add_argument("--lab", default=None, metavar="DIR",
                   help="lab root holding harnesses/, tasks/ and data/runs/. Defaults to the "
                        "checkout when running from one, else ~/.harnesslab (seeded on first run).")
    p.add_argument("--no-browser", action="store_true",
                   help="do not open a browser window on startup")
    p.add_argument("--log-level", default="warning", choices=["critical", "error", "warning", "info", "debug"])
    p.add_argument("--export", metavar="FILE.html", default=None,
                   help="write one self-contained HTML file with the data embedded, and exit. "
                        "Opens from disk with no server; live actions are absent by construction.")
    p.add_argument("--export-results", metavar="A,B", default=None,
                   help="comma-separated results directories to embed (default: all of them)")
    p.add_argument("--export-field", metavar="FILE.html", default=None,
                   help="write one self-contained Field (the projector cold-open) with its corpus "
                        "embedded, and exit. Opens from disk with no server.")
    p.add_argument("--export-runs", type=int, default=None, metavar="N",
                   help="how many per-run detail payloads to embed for the Trajectories page "
                        "(default 40; 0 embeds none and keeps the file small)")
    p.add_argument("--paths", action="store_true", help="print the resolved paths as JSON and exit")
    p.add_argument("--version", action="version", version=f"harnesslab {__version__}")
    return p


def main(argv: list[str] | None = None) -> int:
    # The project was called holdstill until 2026-09-03. Honour the old environment variables so
    # existing scripts and shells keep working; the new names win when both are set.
    for new, olds in (("HARNESSLAB_LAB", ("SINGLETREE_LAB", "ARGUS_LAB", "HOLDSTILL_LAB")),
                      ("HARNESSLAB_PORT", ("SINGLETREE_PORT", "ARGUS_PORT", "HOLDSTILL_PORT")),
                      ("HARNESSLAB_HOST", ("SINGLETREE_HOST", "ARGUS_HOST", "HOLDSTILL_HOST")),
                      ("HARNESSLAB_NO_BROWSER", ("SINGLETREE_NO_BROWSER", "ARGUS_NO_BROWSER", "HOLDSTILL_NO_BROWSER"))):
        for old in olds:
            if old in os.environ and new not in os.environ:
                os.environ[new] = os.environ[old]

    # One name, one command. `harnesslab run ...` forwards to the runner so nobody has to type
    # `python -m harnesslab.core.runner`; `harnesslab serve` is the explicit form of the default.
    # A bare invocation still serves, because the handout and the lab deck both say
    # `python3 -m harnesslab --no-browser` and those must keep working.
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "run":
        from harnesslab.core import runner  # noqa: E402
        sys.argv = ["harnesslab run"] + argv[1:]
        return runner.main() or 0
    if argv and argv[0] == "serve":
        argv = argv[1:]

    args = build_parser().parse_args(argv)
    if args.lab:
        os.environ["HARNESSLAB_LAB"] = os.path.abspath(os.path.expanduser(args.lab))

    from harnesslab.backend import paths  # noqa: E402  (after HARNESSLAB_LAB is set)

    if args.paths:
        import json
        print(json.dumps(paths.describe(), indent=2))
        return 0

    if args.export_field:
        from harnesslab.backend.field import export_field   # noqa: E402
        picked = [x.strip() for x in args.export_results.split(",")] if args.export_results else ["prerecorded_mock"]
        info = export_field(picked[0], args.export_field)
        print(f"wrote {info['path']}  ({info['bytes'] / 1e6:.1f} MB, {info['runs']} runs, "
              f"{info['harnesses']} harnesses, {info['tasks']} tasks, results: {info['results']})")
        print("  open it directly in a browser; no server needed.")
        return 0

    if args.export:
        from harnesslab.backend.static_export import build  # noqa: E402
        picked = [x.strip() for x in args.export_results.split(",")] if args.export_results else None
        from harnesslab.backend.static_export import DEFAULT_RUNS
        info = build(args.export, picked, DEFAULT_RUNS if args.export_runs is None else args.export_runs)
        print(f"wrote {info['path']}  ({info['bytes']/1_000_000:.1f} MB, "
              f"{info['endpoints']} endpoints, {info['runs_embedded']} run details, "
              f"results: {', '.join(info['results'])})")
        if info["failed"]:
            print(f"  {len(info['failed'])} endpoint(s) not captured:", file=sys.stderr)
            for u, why in info["failed"][:8]:
                print(f"    {u} -> {why}", file=sys.stderr)
        print("  open it directly in a browser; no server needed.")
        return 0

    from harnesslab.backend.app import app  # noqa: E402

    url = f"http://{'127.0.0.1' if args.host in ('0.0.0.0', '::') else args.host}:{args.port}"
    key = "set" if os.environ.get("OPENROUTER_API_KEY") else "NOT set"
    print(f"harnesslab {__version__} -> {url}   (lab root: {paths.LAB_ROOT}; OpenRouter key: {key})")
    if not paths.describe()["dist_built"]:
        print("  note: the UI is not built; the API is still served. "
              "Build it with: cd harnesslab/frontend && npm install && npm run build", file=sys.stderr)

    if not args.no_browser and os.environ.get("HARNESSLAB_NO_BROWSER") != "1":
        try:
            import threading
            import webbrowser
            threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        except Exception:  # pragma: no cover - headless hosts
            pass

    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
