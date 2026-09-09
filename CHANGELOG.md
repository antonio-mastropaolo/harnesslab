# Changelog

All notable changes to **harnesslab** (and the `agentlab` harness it is built on) are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases before 0.3.0 were not packaged and are not reconstructed here: 0.3.0 is the first version
that installs, ships, and cites.

## [Unreleased]

### Verified against the live data (2026-09-03, `data/runs/live`, 576 runs)

Evidence for the 0.3.0 features, run against the 576 real OpenRouter runs rather than the mock
fixtures. Commands and their actual output; anything not run is named as not run.

- **`harnesslab/backend/store.py` == `load_index` + `filter_rows`.** `store.refresh('live')` ingested
  576. `store.rows('live')` returned 576 rows whose `run_id` set and multiset are identical to
  `load_index('data/runs/live')`, with **19,008 field comparisons across every shared key and 0
  mismatches**. `store.run_ids()` identical. Five filters equal to `filter_rows`:
  `harness_id=baseline` 72, `no_test_tool` 72, `model=anthropic/claude-haiku-4.5` 192,
  `task_id=t03_ratelimit` 72, `baseline`+`t01_slugify` 9. `store.overview()` reports 576 runs and
  all eight harness ids (including the two `+sentinel` cells). Verified against a throwaway
  `db_path`, so the shipped sidecar was untouched.
- **Letta Trajectory v1 round-trip** on live run `20260903-150943-0dd045`: 38 records, HTTP 200.
  Validated against the v1 record shapes — 0 `additionalProperties` violations, 0 assistant records
  with non-null `content` beside `tool_calls`, 0 non-stringified `args`, 0 orphan `tool_call_id`s.
  Fidelity against the source ledger: 11 `execute_tool` spans == 11 `tool_calls` == 11 tool results.
- **Inspect AI EvalLog round-trip** on the same run: HTTP 200, 17,080 bytes, parsed back by
  inspect_ai 0.3.262's own `read_eval_log` — `status=success`, `task=harnesslab/t01_slugify`,
  `model=anthropic/claude-haiku-4.5`, 23 messages, scores `visible_pass`/`hidden_pass`/`strong_pass`.
  Needs the `[inspect]` extra; without it `/api/export/formats` reports `available: false` and the
  endpoint returns 501, which is the intended behaviour.
- **`python -m harnesslab --export me.html --export-results live`**: 4.3 MB, **172 endpoints, 0
  failures**, 40 run details. Opened from `file://` in headless Chromium: `live` selected, all nine
  read-only pages populated (Outcome, Harness lab, Trajectories, Sentinel, Judge, Integrity,
  Patterns, Experiment, Report card), **0 network requests and 0 console errors**.
- **`make wheel-check`**: NOT RUN. `npm ci` unlinks `node_modules`, which the sandbox this ran in
  cannot do inside the mounted folder (`EPERM ... unlink .../node_modules/.package-lock.json`).
- **`make docker`**: NOT RUN. Docker is not installed in that sandbox.

### Added — the console's remaining unique views
- **Oracle switch in the shell** (`ORACLES` + the chip group in `App.jsx`). The oracle is a property
  of the measurement, not of one page, so switching it re-scores every view at once instead of each
  page carrying its own selector. Persisted in `localStorage` beside the results/harness pickers;
  Experiment and Patterns now take it from context and pass it to the API. Verified on `data/runs/live`,
  harness `baseline`: visible 1.00 / 1.00 / 1.00, hidden 1.00 / 0.75 / 1.00, strengthened
  0.875 / 0.50 / 1.00 for claude-haiku-4.5 / gemini-2.5-flash / gpt-5-mini — the hidden row reproduces
  the measured live figures, and the visible row is the "submitted on green visible tests" gap.
- `scripts/ui_check.py`: `PAGES` now includes `patterns` and `experiment`, which the gate was not
  covering.

### Fixed
- `harnesslab/backend/static_export.py` captured only a hand-written list of endpoints, so a static
  export left Harness lab, Sentinel and Trajectories unpopulated (40 endpoints captured). It now
  enumerates the read-only URLs the pages actually request and fetches them **through the app's own
  `TestClient`**, so an exported payload is byte-for-byte what the server would answer instead of a
  second code path that can drift from it. 172 endpoints captured for `live`.
- `static_export` built query strings by interpolation, so harness ids containing `+`
  (`baseline+sentinel`, `no_test_tool+sentinel`) decoded as a space and returned 404. Values are
  URL-encoded now, and the exporter reports any endpoint it could not capture instead of writing a
  quietly incomplete file.
- The frontend's static-mode shim matched a request to the snapshot by *bare path*, so a URL
  carrying parameters the snapshot did not have (a second results directory, a picked cell)
  silently resolved to the payload captured without them — plausible but wrong numbers. It now
  matches on the normalised query string and raises "not in this static export" instead.
- `--export-runs N` bounds how many per-run detail payloads are embedded (default 40), so the
  Trajectories page works in an export without inlining all 576 ledgers.

### Changed
- `CURATED` in `harnesslab/backend/app.py`: `mistralai/devstral-medium` → `mistralai/devstral-2512`
  and `x-ai/grok-4-fast` → `x-ai/grok-4.6`, both delisted from the OpenRouter catalogue.
  `/api/models` returns 200 with the new ids. **Not verified against the live catalogue**: the
  sandbox this ran in has no key and cannot reach the metering proxy, so `catalogue_size` was 0.
  Confirm on the Mac with the key registered:
  `curl -s 'http://127.0.0.1:8765/api/models?refresh=1' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['catalogue_size']); print([(m['id'],m['available']) for m in d['models']])"`

### Paper — live numbers (task 4)
- `paper/figs/compute.py`: paths were hardcoded to `/home/claude/lab`, so the paper could not be
  rebuilt in this checkout at all. They now derive from the file's own location, with
  `$HARNESSLAB_LAB` as an override. Added `harness_live`, `harness_paired_live`, `families_live`,
  `pairs_live`, `cv_live` and `spend`, plus `--only-live` so the live numbers can be recomputed
  without refitting the mock and imported models (28.3 s instead of minutes).
- `paper/figs/gen_tables_live.py` (new) emits `tab_harness_live.tex`, `tab_families_live.tex`,
  `tab_sentinel_live.tex` and `spend.tex` from `paper/data/results.json`. Wired into `paper/Makefile`.
- **Every live figure independently reproduces the handoff.** pass@1 grid to two decimals for all
  three families across all six harnesses; sensitivity 0.33 / 0.21 / 0.42; `no_test_tool` −
  `baseline` = +0.083 with task-paired CI [+0.00, +0.21]; sentinel AUC 0.86 [0.81, 0.90],
  run-weighted 0.81, alive-at-step-5 0.89 vs 0.65 rules-only, ECE 0.21, oracle-invisible 36/57
  (63%), top coefficient `has_test_tool` +1.26; every paired A/B interval includes zero.
- The four caveats are carried verbatim in `tab_sentinel_live.tex`'s note and appear in the built
  PDF: the `has_test_tool` leak (with the three largest coefficients), 64% oracle-invisible (with
  the recomputed 36 of 57), the null paired A/B, and the 12 pp abort cost.
- Spend: `\SpendMetered` = $7.00 (metered, cited in the live harness caption). Derived from the
  shipped ledgers is $6.88 over 4,373 model calls for `live` alone, $6.94 / 4,391 including
  `smoke` and the sentinel LLM layer — 0.9% under the metered figure, consistent with billed calls
  the ledgers do not record. The metered log itself is not present in this sandbox, so
  `spend()` reports `metered_usd: null` and the macro falls back to the stated $7.00.

**Three tables were NOT replaced, deliberately.** The task asked for `tab_harness`, `tab_sentinel`
and `tab_real` to be regenerated from `live`. Each is described by the prose around it, in terms
that live data contradicts: the harness section quotes mock-specific figures (flip rates 75–88%,
2,902 vs 5,978 tokens per run, the 46% ranking share), `tab_sentinel`'s caption says "500 imported
SWE-agent trajectories", and the paragraph before `tab_real` says "read the two right-hand columns"
of an Ochiai ranking. Swapping numbers under that prose would have made three sections contradict
themselves silently. The live numbers are three *new* tables instead
(Tables `tab:harness-live`, `tab:families-live`, `tab:sentinel-live`); moving the paper's narrative
onto live data is an editorial pass, not a regeneration.

- PDF rebuilt: 12 pages, 654,035 bytes, 0 LaTeX errors, 0 undefined citations, 10,238 words
  (was 11 pages / 647,330 / 9,605). Text diff against the previous PDF: +341 / −72 lines, and each
  of the 58 substantial "removed" lines was verified still present in the new text — the deletions
  are two-column reflow, not lost prose. `IEEEtran.cls`/`.bst` are absent from this sandbox and
  could not be apt-installed; they were fetched to `/tmp` and supplied via `TEXINPUTS`/`BSTINPUTS`
  rather than committed, so the repo gains no build dependency.

### Test hygiene
- `tests_agentlab/test_importers.py` imported into `data/runs/test_import_tmp_<hex>/` and relied on
  `addCleanup(shutil.rmtree, ..., ignore_errors=True)`. That is not a guarantee: where the unlink
  fails it fails silently, and eleven such directories had accumulated in `data/runs/`. The test now
  redirects `importers.RUNS_ROOT` to a `tempfile.mkdtemp()`, so nothing is created in the shipped
  data directory whether or not removal succeeds.
- `tests_agentlab/test_sentinel_ext.py::TestExportImport` wrote imported models into the shipped
  `harnesslab/data/models/`. It now copies the registry into a temp `MODELS_DIR` and restores the
  real one in `tearDown`.
- After both: `python3 -m unittest discover -s tests_agentlab` → **Ran 233 tests, OK**, and a rerun
  of the two suites created no new `data/runs/` directories and no new model files.


## [0.3.0] — 2026-09-03

The "citable artifact" release: harnesslab stops being a directory you `cd` into and becomes
something you can `pip install`, run in a container, point at thousands of runs, and export from.

### Added — packaging and distribution
- `pyproject.toml`: project `harnesslab` 0.3.0, packages `agentlab` and `harnesslab.*`, with
  `harnesses/` and `tasks/` shipped inside the wheel under `harnesslab/bundle/`, and the built UI
  (`harnesslab/frontend/dist/**`) plus the sentinel models (`harnesslab/data/models/*.json`) as
  package data. Required dependencies stay `fastapi` + `uvicorn`; everything else is an extra
  (`[real]`, `[inspect]`, `[figures]`, `[dev]`).
- Console script `harnesslab`, with `--host`, `--port`, `--lab`, `--no-browser`, `--log-level`,
  `--paths` and `--version`.
- `harnesslab/backend/paths.py`: one rule for locating the lab root — `$HARNESSLAB_LAB`, else a
  checkout detected by `harnesses/` next to the package, else a `~/.harnesslab` workspace seeded on
  first run from the data bundled in the wheel. Replaces the `__file__` arithmetic that assumed a
  checkout.
- `Dockerfile` (node stage builds the UI, `python:3.12-slim` runs it, unprivileged, port 8765) and
  `docker-compose.yml` with `OPENROUTER_API_KEY` passthrough and a volume for `data/runs`.
- `LICENSE` (MIT), `CITATION.cff`, this changelog, and a `Makefile` (`test`, `build-frontend`,
  `wheel`, `docker`, `bench`, `clean`).

### Added — scale
- `harnesslab/backend/store.py`: an incremental SQLite index over `data/runs/*/index.jsonl`, keyed by
  `(dir, run_id)` and refreshed only when a file's mtime or size changes. `rows()`, `run_ids()` and
  `overview()` return exactly what `harnesslab.core.analysis.load_index` + `filter_rows` and
  `metrics.results_dirs()` return today, so it is a drop-in. Filtered queries are 5–36x faster and
  the results-directory overview 11x faster; the cache lives at `data/.holdstill_index.sqlite` and
  is derived data — deleting it costs one rebuild.

### Added — interoperability
- `harnesslab/backend/export.py` (`/api/export/*`): a run as a
  [Letta Trajectory v1](https://github.com/letta-ai/trajectory) JSONL stream; a run as an
  [Inspect AI](https://inspect.aisi.org.uk/) `EvalLog` that `read_eval_log` round-trips; `index.csv`
  and `cells.csv` (cell metrics with bootstrap 95% CIs) for R/pandas; and `bundle.zip` — index,
  ledgers, patches, harness configs and the sentinel model — for a Zenodo deposit.
- `harnesslab/frontend/src/components/packaging/`: `ExportChart` + `exportUtils`, which serialize a
  Recharts chart to `.svg` with computed styles inlined (theme CSS variables resolved, so the file
  survives outside the app), rasterize it to `.png`, and download the numbers behind it as `.csv`.

### Changed
- `harnesslab/__main__.py` now parses arguments and sets `HARNESSLAB_LAB` before importing the
  backend; `harnesslab.backend.app.main()` is unchanged and still works.

### Known limitations
- `ExportChart` cannot capture a Recharts `<Legend>`: Recharts renders it as HTML outside the
  `<svg>`. Use the `caption` prop, or read series names from the exported CSV.
- Ledgers imported from SWE-agent trajectories carry no wall-clock timestamps. The Trajectory export
  synthesizes them from the ledger file's mtime plus the span sequence, and says so in a trailing
  `observation` record.
- A deposit bundle contains measurements, not a re-runnable environment: task repositories and
  hidden tests live in this repository, model weights live with their providers.

[Unreleased]: https://github.com/antonio-mastropaolo/harnesslab/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/antonio-mastropaolo/harnesslab/releases/tag/v0.3.0
