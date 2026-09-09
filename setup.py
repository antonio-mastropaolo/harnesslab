"""Dynamic packaging bits. All metadata lives in pyproject.toml; only what a static table
cannot express is here.

Two things need code:

1. **Discovery that survives new modules.** The backend grows subpackages
   (``harnesslab.backend.importers``, ...); a hand-maintained ``packages`` list in pyproject.toml
   silently ships a wheel that imports on the developer's checkout and crashes on a user's
   machine. ``find_packages`` restricted to ``harnesslab*`` cannot pick up the task
   repositories under ``tasks/`` or anything in ``node_modules/`` (neither has ``__init__.py``).

2. **Data that lives outside any package.** ``harnesses/`` and ``tasks/`` sit at the repository
   root. They are mapped under ``harnesslab/bundle/`` in the wheel so an installed harnesslab can
   seed a workspace on first run -- see ``harnesslab/backend/paths.py``.
"""
from setuptools import find_packages, setup

# Real Python packages (they have __init__.py).
PACKAGES = find_packages(include=["harnesslab", "harnesslab.*"])

# Data-only directories that must still be laid down in the wheel.
DATA_PACKAGES = [
    "harnesslab.data",              # active_model.txt
    "harnesslab.data.models",       # trained sentinel models
    "harnesslab.frontend",          # the built UI, under dist/
    "harnesslab.plugins",           # sentinel rule plugins (sentinel.PLUGINS_DIR is package-relative)
    "harnesslab.docs",              # prose the app links to
    "harnesslab.bundle.harnesses",  # <- harnesses/
    "harnesslab.bundle.tasks",      # <- tasks/
]

setup(
    packages=sorted(set(PACKAGES) | set(DATA_PACKAGES)),
    package_dir={
        "harnesslab.bundle.harnesses": "harnesses",
        "harnesslab.bundle.tasks": "tasks",
    },
)
