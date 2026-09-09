"""Where the lab lives.

The platform reads harness configs, tasks and run data from a *lab root*. In a git checkout
that root is the repository itself; from an installed wheel there is no checkout, so the root
becomes a workspace directory that is seeded once from the data bundled inside the wheel.

Resolution order (first hit wins):

  1. ``$HARNESSLAB_LAB``                        explicit override (also set by ``harnesslab --lab``)
  2. a checkout: ``<this file>/../../``        if that directory contains ``harnesses/``
  3. ``~/.harnesslab``                          workspace, seeded on first use from the bundle

Everything else in the package should import ``LAB_ROOT`` (or the derived directories) from here
instead of doing path arithmetic on ``__file__``, so that one rule covers checkout and wheel.

Because ``LAB_ROOT`` is resolved at import time, an override has to be in the environment before
``harnesslab.backend.app`` is imported -- which is exactly what ``harnesslab.__main__.main`` does.
"""
from __future__ import annotations

import os
import shutil

__all__ = [
    "LAB_ROOT", "RUNS_ROOT", "HARNESS_DIR", "TASK_DIR", "DATA_ROOT", "DIST", "MODELS_DIR",
    "INDEX_DB", "BUNDLE_DIR", "resolve_lab_root", "ensure_workspace", "bundle_dir", "describe",
]

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))          # .../harnesslab/backend
_PKG_DIR = os.path.dirname(_BACKEND_DIR)                            # .../harnesslab
_CHECKOUT_GUESS = os.path.dirname(_PKG_DIR)                         # .../lab  (only in a checkout)

#: Directories seeded into a fresh workspace, and shipped in the wheel under ``harnesslab/bundle/``.
SEEDED = ("harnesses", "tasks")

DEFAULT_WORKSPACE = os.path.join(os.path.expanduser("~"), ".harnesslab")


def bundle_dir() -> str | None:
    """Directory holding the packaged copies of ``harnesses/`` and ``tasks/``.

    Present only in an installed wheel (``harnesslab/bundle/``); ``None`` in a plain checkout,
    where the checkout itself already holds the originals.
    """
    b = os.path.join(_PKG_DIR, "bundle")
    return b if os.path.isdir(os.path.join(b, "harnesses")) else None


def _is_checkout(path: str) -> bool:
    return os.path.isdir(os.path.join(path, "harnesses")) and os.path.isdir(os.path.join(path, "tasks"))


def ensure_workspace(root: str) -> str:
    """Create ``root`` if needed and seed it with the packaged harnesses/tasks (never overwrites).

    Always leaves ``root/data/runs`` in place so live runs have somewhere to land.
    """
    os.makedirs(os.path.join(root, "data", "runs"), exist_ok=True)
    src = bundle_dir()
    if src:
        for name in SEEDED:
            dst = os.path.join(root, name)
            if not os.path.exists(dst) and os.path.isdir(os.path.join(src, name)):
                shutil.copytree(os.path.join(src, name), dst)
    else:
        for name in SEEDED:
            os.makedirs(os.path.join(root, name), exist_ok=True)
    return root


def resolve_lab_root(env: dict | None = None, start: str | None = None, workspace: str | None = None,
                     seed: bool = True) -> str:
    """Pure resolver -- see the module docstring. Exposed separately so it can be unit tested.

    ``env`` defaults to ``os.environ``, ``start`` to the checkout guess derived from ``__file__``,
    ``workspace`` to ``~/.harnesslab``. With ``seed=False`` nothing is written to disk.
    """
    env = os.environ if env is None else env
    start = _CHECKOUT_GUESS if start is None else start
    workspace = DEFAULT_WORKSPACE if workspace is None else workspace

    override = (env.get("HARNESSLAB_LAB") or env.get("SINGLETREE_LAB") or env.get("ARGUS_LAB")
                or env.get("HOLDSTILL_LAB") or "").strip()   # legacy names still honoured
    if override:
        root = os.path.abspath(os.path.expanduser(override))
        if seed and not _is_checkout(root):
            ensure_workspace(root)
        return root

    if _is_checkout(start):
        return os.path.abspath(start)

    root = os.path.abspath(os.path.expanduser(workspace))
    if seed:
        ensure_workspace(root)
    return root


LAB_ROOT = resolve_lab_root()

DATA_ROOT = os.path.join(LAB_ROOT, "data")
RUNS_ROOT = os.path.join(DATA_ROOT, "runs")
HARNESS_DIR = os.path.join(LAB_ROOT, "harnesses")
TASK_DIR = os.path.join(LAB_ROOT, "tasks")
INDEX_DB = os.path.join(DATA_ROOT, ".harnesslab_index.sqlite")

#: The built UI. It always ships with the package, never with the lab root.
DIST = os.path.join(_PKG_DIR, "frontend", "dist")
MODELS_DIR = os.path.join(_PKG_DIR, "data", "models")
BUNDLE_DIR = bundle_dir()


def describe() -> dict:
    """One dict for ``harnesslab --help``-style diagnostics and the packaging tests."""
    return {
        "lab_root": LAB_ROOT,
        "source": ("env HARNESSLAB_LAB" if os.environ.get("HARNESSLAB_LAB") or os.environ.get("HOLDSTILL_LAB") else
                   "checkout" if _is_checkout(_CHECKOUT_GUESS) else "workspace"),
        "runs_root": RUNS_ROOT, "harnesses": HARNESS_DIR, "tasks": TASK_DIR,
        "dist": DIST, "dist_built": os.path.isdir(DIST), "bundle": BUNDLE_DIR, "index_db": INDEX_DB,
    }
