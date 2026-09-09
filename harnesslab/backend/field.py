"""The Field — the projector cold-open, ported from agent-lab.

`web/field.html` in the agent-lab checkout is a single-page instrument that makes the
statistical argument in three minutes: switch the oracle and watch verdicts change, press
rank then resample to see the leader change across 2,000 resampled task sets, press flags to
see runs that fail a trajectory test while still passing the oracle. Nothing in harnesslab
replaced it — Command center watches one *live* run; the Field argues over *all* of them.

It needs exactly one thing the rest of the API does not already expose: the whole bundle
(runs, tasks, harnesses) in one payload. `harnesslab.core.console.build_bundle` already produces
that and still ships inside harnesslab, so this is a thin route, not a reimplementation.

The Field's live-launch panel is deliberately not wired here: launching belongs to Command
center on this platform, and the cold-open does not need it.
"""
from __future__ import annotations

import json
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from .paths import LAB_ROOT

router = APIRouter()

HERE = os.path.dirname(os.path.abspath(__file__))
FIELD_TEMPLATE = os.path.join(HERE, "field.html")
DATA_MARKER = "__DATA__"


def field_html(payload: dict) -> str:
    """field.html with its data slot filled.

    The file is a fragment (the hosted-artifact form it was authored in), so it gets the document
    skeleton here -- otherwise browsers render it in quirks mode. `{"live": true}` tells the page to
    fetch /api/bundle itself; an exported Field would instead be handed `{"bundle": ...}` whole.
    """
    with open(FIELD_TEMPLATE, encoding="utf-8") as f:
        html = f.read()
    if html.count(DATA_MARKER) != 1:
        raise RuntimeError("field.html must carry exactly one __DATA__ slot")
    body = html.replace(DATA_MARKER, json.dumps(payload).replace("</", "<\\/"))
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<title>The Field -- harnesslab</title>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')


@router.get("/field", response_class=HTMLResponse)
def field_page():
    """The Field, live: the page pulls its corpus from /api/bundle."""
    return HTMLResponse(field_html({"live": True}))



def _results_dir(name: str) -> str:
    """Resolve a results directory name, refusing anything that escapes data/runs."""
    safe = os.path.basename(name or "")
    if not safe or safe != name:
        raise HTTPException(status_code=400, detail="results must be a bare directory name")
    path = os.path.join(LAB_ROOT, "data", "runs", safe)
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail=f"no such results directory: {safe}")
    return path


@router.get("/api/bundle")
def bundle(results: str = "prerecorded_mock", preview_chars: int = 900):
    """The Field's whole-corpus payload: runs, tasks, harnesses (plus trajectories/features).

    One directory at a time, because the Field's resampling treats the directory as the corpus.
    """
    from harnesslab.core.console import build_bundle          # imported lazily; LAB_ROOT is on sys.path by now

    return build_bundle([_results_dir(results)], lab_root=LAB_ROOT, preview_chars=preview_chars)


@router.get("/api/status")
def status(results: str = "prerecorded_mock"):
    """The Field's cheap poll.

    It asks only "has the corpus changed?" and refetches /api/bundle when `version` moves, so this
    must stay free of ledger parsing. Jobs are reported empty by design: launching runs belongs to
    Command center on this platform, not to the Field (see the module docstring).
    """
    path = _results_dir(results)
    index = os.path.join(path, "index.jsonl")
    n_runs = 0
    mtime = 0.0
    if os.path.exists(index):
        mtime = os.path.getmtime(index)
        with open(index, "rb") as f:
            n_runs = sum(1 for line in f if line.strip())
    return {"version": f"{n_runs}:{int(mtime)}", "runs": n_runs, "jobs": [], "running": []}


def export_field(results: str, out_path: str, preview_chars: int = 0) -> dict:
    """One self-contained Field: the bundle goes in whole and the page reduces it itself,
    the same code path the live server uses.

    Tool-output previews are dropped (preview_chars=0) because the Field never shows them and they
    are most of the payload. The result opens from disk with no server and no network.
    """
    from harnesslab.core.console import build_bundle

    bundle = build_bundle([_results_dir(results)], lab_root=LAB_ROOT, preview_chars=preview_chars)
    bundle["static"] = True
    html = field_html({"bundle": bundle})
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    return {"path": out_path, "bytes": len(html.encode("utf-8")),
            "runs": len(bundle["runs"]), "tasks": len(bundle["tasks"]),
            "harnesses": len(bundle["harnesses"]), "results": results}
