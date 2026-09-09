"""One self-contained HTML file with the data baked in.

A running server is not a deliverable: a participant cannot hand one in, a reviewer cannot open
one six months later, and a supplementary link that needs `pip install` is a link most people
will not follow. This writes the built UI plus a snapshot of every read-only API response into a
single file that opens from disk with no server, no network and no dependencies.

    python -m harnesslab --export me.html
    python -m harnesslab --export me.html --export-results live
    python -m harnesslab --export me.html --export-results live --export-runs 0   # skip run details

The snapshot is taken by calling the running app through Starlette's TestClient rather than by
calling the metrics functions directly, so what lands in the file is byte-for-byte what the
server would have answered — a hand-rolled second path is exactly how a static export starts
disagreeing with the live one.

Live actions (launching runs, training, importing) are absent by construction: there is nothing
to POST to. The frontend detects the embedded payload, serves reads from it, refuses writes, and
matches on the *normalised query string* so a request carrying parameters the snapshot lacks
fails loudly instead of quietly resolving to the wrong numbers.
"""
from __future__ import annotations
import json, os, re, time
from urllib.parse import quote

from .paths import DIST, RUNS_ROOT

# How many per-run detail payloads to embed. Trajectories needs one per run it can open; all 576
# of a live directory would make the file unwieldy, so this is a bounded, stated sample.
DEFAULT_RUNS = 40


def _urls(client, dirs: list[str], n_runs: int) -> list[str]:
    """Every read-only URL the pages actually request, expanded over the real dirs/harnesses."""
    out = ["/api/overview", "/api/tasks", "/api/harnesses", "/api/models",
           "/api/sentinel", "/api/sentinel/plugins", "/api/judge",
           "/api/harness/list", "/api/harness/knobs",
           "/api/import/sources", "/api/import/status", "/api/real/status",
           "/api/export/formats"]
    for d in dirs:
        ov = client.get(f"/api/results/{d}/runs")
        rows = ov.json() if ov.status_code == 200 else []
        harnesses = sorted({r["harness_id"] for r in rows}) or ["baseline"]
        q = lambda v: quote(str(v), safe="")   # noqa: E731 - local shorthand
        out += [f"/api/results/{d}/runs", f"/api/results/{d}/metrics",
                f"/api/results/{d}/experiment", f"/api/real/{d}/analysis",
                f"/api/harness/versions?dir={d}", f"/api/harness/list?dir={d}",
                f"/api/fork/{d}/pairs?limit=80",
                f"/api/sentinel/leaderboard?dir={d}&k=10%2C15%2C20&threshold=0.6"]
        for h in harnesses:
            out += [f"/api/results/{d}/runs?harness={q(h)}",
                    f"/api/results/{d}/metrics?baseline={q(h)}",
                    f"/api/results/{d}/integrity?harness={q(h)}",
                    f"/api/results/{d}/report?harness={q(h)}",
                    f"/api/results/{d}/patterns?harness={q(h)}",
                    f"/api/sentinel/replay_all/{d}?harness={q(h)}",
                    # the Sentinel page's leaderboard, at the defaults its controls start on
                    f"/api/sentinel/leaderboard?dir={d}&k=10%2C15%2C20&threshold=0.6&harness={q(h)}"]
        for oracle in ("hidden_pass", "strong_pass", "visible_pass"):
            out.append(f"/api/harness/ranking?dir={d}&outcome={oracle}")
            for a, b in (("model", "harness_id"), ("harness_id", "model"),
                         ("model", "task_id"), ("harness_id", "task_id")):
                out.append(f"/api/results/{d}/experiment?a={a}&b={b}&outcome={oracle}")
        for r in rows[:n_runs]:
            out += [f"/api/results/{d}/runs/{r['run_id']}", f"/api/fork/{d}/state/{r['run_id']}"]
    seen, uniq = set(), []
    for u in out:
        if u not in seen:
            seen.add(u); uniq.append(u)
    return uniq


def build(out_path: str, results: list[str] | None = None, n_runs: int = DEFAULT_RUNS) -> dict:
    index = os.path.join(DIST, "index.html")
    if not os.path.exists(index):
        raise SystemExit("the UI is not built. Run: cd harnesslab/frontend && npm install && npm run build")

    dirs = results or sorted(
        d for d in os.listdir(RUNS_ROOT)
        if os.path.exists(os.path.join(RUNS_ROOT, d, "index.jsonl")))
    if not dirs:
        raise SystemExit(f"no results directories under {RUNS_ROOT}")

    from starlette.testclient import TestClient
    from .app import app

    data, failed = {}, []
    with TestClient(app) as client:
        for url in _urls(client, dirs, n_runs):
            try:
                r = client.get(url)
                if r.status_code == 200:
                    data[url[len("/api"):]] = r.json()
                else:
                    failed.append((url, r.status_code))
            except Exception as e:                      # one bad dir must not sink the export
                failed.append((url, f"{type(e).__name__}: {e}"))

    data["__meta__"] = {"generated_at": time.strftime("%Y-%m-%d %H:%M"), "results": dirs,
                        "static": True, "runs_embedded": n_runs}

    html = open(index, encoding="utf-8").read()

    def inline(m):
        tag, url = m.group(0), m.group(2)
        p = os.path.join(DIST, url.lstrip("/"))
        if not os.path.exists(p):
            return tag
        body = open(p, encoding="utf-8").read()
        if url.endswith(".css"):
            return f"<style>\n{body}\n</style>"
        if url.endswith(".js"):
            return f'<script type="module">\n{body}\n</script>'
        return tag

    # drop remote font links: a file meant to open offline must not hang on a network fetch.
    # The CSS carries a system-font fallback stack, so this costs the webfont and nothing else.
    html = re.sub(r'<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>', "", html)
    html = re.sub(r'<link[^>]*rel="stylesheet"[^>]*(href)="([^"]+)"[^>]*>', inline, html)
    html = re.sub(r'<script[^>]*(src)="([^"]+)"[^>]*></script>', inline, html)

    blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    banner = f"<script>window.__HARNESSLAB_DATA__={blob};</script>"
    html = html.replace("</head>", banner + "\n</head>", 1) if "</head>" in html else banner + html

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    return {"path": os.path.abspath(out_path), "bytes": len(html.encode()),
            "results": dirs, "endpoints": len(data) - 1, "failed": failed,
            "runs_embedded": n_runs}
