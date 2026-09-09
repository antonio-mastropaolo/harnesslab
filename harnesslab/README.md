# harnesslab — the web platform for agentlab

*The agent won't hold still; the measurement should.*

A local web app over the lab's `agentlab` harness. It launches cells (model × harness × tasks × repeats)
against the mock agent or **any OpenRouter model**, streams every ledger span to the browser while the run
is happening, and adds a **sentinel**: an early-warning module that scores the partial trajectory at every
step and can nudge, block or abort the agent *before* it submits.

```
pip install -r harnesslab/requirements.txt          # fastapi + uvicorn; everything else is stdlib
export OPENROUTER_API_KEY=sk-or-v1-...             # optional; the mock provider needs no key
cd lab && python -m harnesslab                      # -> http://127.0.0.1:8765
```

`data/runs/real_swe_agent_500/` ships with 500 real trajectories already imported (43 MB) so the Real data page and the
real-trained sentinel work offline; the Real data page can stream more (`pip install datasets`).

The UI is prebuilt in `harnesslab/frontend/dist`. To hack on it: `cd harnesslab/frontend && npm install && npm run dev`
(Vite proxies `/api` to the Python server) and `npm run build` when done.

## Pages

| page | what it shows | lab exercise |
|---|---|---|
| **Command center** | launch matrix (OpenRouter model chips + any id, harness chips, task chips, repeats, parallelism), sentinel settings, A/B toggle; live run grid with per-step tool glyphs, risk meter, interventions, PASS/fail as they land | 0 |
| **Outcome** | outcome grid, pass@k vs pass^k curve, task-bootstrap CI, flip rate, strengthened-oracle pass@1, exit reasons, conduct rates | 1 |
| **Harness lab** | every (model, harness) cell side by side with "which columns move" shading; paired bootstrap vs a baseline; model-family × harness heatmap with a harness-sensitivity column; a harness editor that saves `harnesses/<id>.json` | 2 |
| **Trajectories** | filterable run table → one run: risk-over-trajectory chart (replay + recorded live verdicts), interventions, the ledger as a timeline, the patch, the issue, the harness; tick two runs to compare them side by side (patch-line overlap, both timelines, both risk curves) | 1, 3 |
| **Sentinel** | train the risk model on any results dirs (run-level 5-fold CV), coefficients, AUC by prefix fraction, operating points (recall / false alarm / lead time), replay of every run as a risk curve, X vs X+sentinel paired cells, the pattern catalogue | 3, 4 |
| **Judge** | calibrate the mock judge or any OpenRouter model against the hidden-test oracle: raw agreement vs Cohen's κ, test–retest, the base-rate trap, pairwise position swap, a verbosity-padding test that needs no oracle, process judging vs the ledger | 4 |
| **Integrity** | solution leakage (t05), same patches under two oracles with rank changes, self-report vs oracle, Ochiai attribution over runs | 5 |
| **Real data** | stream N runs from nebius/SWE-agent-trajectories into the ledger format; the dataset-card comparison, exit status and action mix, Ochiai attribution; then every other page works on the real runs | 7 |
| **Report card** | the exercise-6 card, rendered and downloadable as markdown | 6 |
| **Present** | full-screen lecture mode: each slide is a headline over the live page | — |

Everything reads and writes the same `data/runs/<dir>/index.jsonl` + per-run `ledger.jsonl` that
`harnesslab.core.runner` and the exercise scripts use. Numbers agree with the scripts because the API calls the same
functions in `agentlab/analysis.py`.

## The sentinel

`harnesslab/backend/sentinel.py`, three inspectable layers:

1. **Pattern detectors** — named rules with a reason and a nudge: submit without re-running tests, test
   tampering, destructive shell, repeat loop, persistent failing tests, half the budget with no edit, scope
   creep, boundary probe, budget burn, model stopped calling tools.
2. **Risk model** — pure-Python logistic regression over 26 prefix features (steps and tokens used, edits,
   tests, errors, blocked calls, "edited since last test", repeats, files touched, pending submit, ...).
   Trained on finished runs: prefix at step *k* → did the run eventually fail the hidden tests. Evaluated
   out-of-fold by prefix fraction so you can see *how early* it can tell.
3. **LLM sentinel** (optional) — a second model via OpenRouter reads the compact partial trajectory and
   returns `{risk, pattern, rationale, nudge}`; only called when the cheap layers ask for it.

The hook runs **before the pending tool calls execute** (`agentlab/harness.py::run_task(step_hook=...)`), so
it can answer a `submit` or an `rm -rf` with a block instead of letting it run, append a nudge after the
tools run, re-prompt a model that stopped calling tools, or abort. Every verdict is a `sentinel` span in the
ledger; `RunSummary` gains `sentinel_interventions` and `sentinel_max_risk`; the exit reason
`sentinel_abort` exists. `HarnessConfig.sentinel` holds the configuration, so a harness with the hook is a
different measurement cell — the platform's A/B toggle runs `X` and `X+sentinel` on the same tasks and
seeds and the Sentinel page shows the paired result.

**Model registry.** Trained models live in `harnesslab/data/models/<name>.json`; `active_model.txt` names the one every live
run and every replay uses. Two ship with the platform: `mock_prerecorded` (480 mock runs; out-of-fold AUC 0.54, 95% CI
0.50–0.58, because 70% of the mock's failures are invisible to conduct) and `real_swe_agent_500` (500 real SWE-agent runs;
out-of-fold AUC 0.72 over all prefixes, CI 0.64–0.78; at threshold 0.6 it flags 48% of eventual failures with 12% false
alarms, 21.5 steps before the end). The Sentinel page lets you train more and switch between them.

**How the evaluation is kept honest.** "AUC over all prefixes" is length-weighted: failing runs are longer and contribute
more prefixes, so a scorer that only reads the step index already gets 0.65 on the real data. The page therefore also
shows (a) a run-weighted AUC (each run counts once: 0.63, CI 0.57–0.67), (b) the AUC *among runs still alive at step k*,
where the step index cannot help (real data: 0.63 at step 10, 0.74 at 15, 0.73 at 20; the rule layer alone scores
0.46 / 0.36 / 0.29 at the same steps, the untrained prior 0.47 / 0.47 / 0.42), (c) bootstrap CIs over runs, and (d) a
calibration curve with its expected calibration error. The model is trained with balanced class weights, so on a
90%-failure cell its output is a ranking score, not a base-rate probability; the calibration card shows exactly that
(ECE 0.34 on the real data). Imported runs carry no token budget, so the token-fraction feature and the `budget_burn`
rule are inert on them by construction rather than firing on every step.

Honesty note built into the UI: the Sentinel page reports the **oracle-invisible failure share** — runs whose
visible tests passed but hidden tests failed. No trajectory watcher can see those. On the mock data it is
~70%, which is the weak-tests distortion from exercise 5 seen from inside the run. On the imported real runs the
agent's last test result is *unknown* for 78% of the failures (8% known invisible, 14% known visible), and the page
says so instead of folding the unknowns into "visible". Real models show more conduct signal; train on your live
runs and compare.

**A/B cells are seed-paired.** A job with the A/B toggle runs `X` and `X+sentinel` on the same tasks *and the same
seeds* (the seed is hashed from the base harness id), so for the mock the two cells differ only by the hook. The
Sentinel page shows the task-paired bootstrap difference in pass@1, verified-before-submit and boundary events with a
95% interval. A job can also run only the `+sentinel` twin of a harness (`sentinel_only`) into a directory that
already holds the plain cells, so an expensive live table is never duplicated.

## Live evidence (2026-09-03)

Three small-tier families through OpenRouter, six harnesses, eight tasks, three repeats: 432 runs, no errors, $5.34 by
the price table ($6.9 metered by the proxy for the whole session including the smoke test, a judge run and the 144
sentinel-on runs below). Numbers are what `exercises/ex2_harness.py --results data/runs/live` prints and what the
Harness lab heatmap shows.

| pass@1 | baseline | no_test_tool | permissive | short_context | terse_prompt | tight_budget | sensitivity |
|---|---|---|---|---|---|---|---|
| claude-haiku-4.5 | 1.00 | 1.00 | 1.00 | 0.67 | 1.00 | 1.00 | 0.33 |
| gpt-5-mini | 1.00 | 1.00 | 0.96 | 0.79 | 1.00 | 0.92 | 0.21 |
| gemini-2.5-flash | 0.75 | 1.00 | 0.75 | 0.58 | 0.88 | 0.62 | 0.42 |

- The harness effect did not shrink for the stronger families: `short_context` costs every family 21–42 points, and
  tokens per solved task move 4–5× across harnesses for the same model (Haiku: 13.5k under `tight_budget`, 63.5k under
  `short_context`).
- `no_test_tool` scores 1.00 for all three and beats `baseline` (+8pp, task-paired 95% CI [0, +21]). Every one of the six
  `baseline` failures was *submitted with green visible tests* (t03, t06): the weak visible suite told the agent it was
  done. Under the strengthened oracle both cells sit at 0.79. The visible tests are part of the cell, and here they hurt.
- Sentinel trained on these runs (`live_3families`, active): out-of-fold AUC 0.86 (CI 0.82–0.90), run-weighted 0.81,
  0.90 among runs alive at step 5 (rule layer alone 0.65), ECE 0.20. Two caveats the page shows: 64% of the failures are
  oracle-invisible, and the top coefficient is the harness feature `has_test_tool`, so part of the score is the model
  recognising the cell rather than the conduct. Retraining on `baseline` alone leaves 6 failures and a CI of 0.54–0.93:
  not a number.
- Paired A/B (`baseline` and `no_test_tool`, with and without the hook, 8 tasks × 3 repeats × 3 families, seed-paired):
  every task-paired Δ pass@1 interval includes zero. The hook fired 15 times in 144 runs, all on gemini-2.5-flash under
  `baseline` (12 repeat-loop nudges, 3 aborts at the 0.97 threshold); the aborts cost that cell 12 points of
  verified-before-submit. Intervening is a harness change with its own costs, and on tasks this small there is little
  for it to catch.

## OpenRouter

`--provider openai --base-url https://openrouter.ai/api/v1` under the hood (`OpenAIProvider`). The platform
reads `OPENROUTER_API_KEY` (or you paste a key in the Command center; it stays in memory for the session).
`/api/models` enriches a curated list of model families with OpenRouter's live catalogue (prices, context)
and accepts any id you type. Prices for unknown models fall back to `agentlab/providers.py::PRICES`; pass
`price` in the job if you need exact cost.

## API (all JSON)

`GET /api/overview` · `GET /api/results` · `GET /api/results/{dir}/runs[?harness=&task=&model=]` ·
`GET /api/results/{dir}/runs/{run_id}` · `GET /api/results/{dir}/metrics[?model=&baseline=]` ·
`GET /api/results/{dir}/integrity` · `GET /api/results/{dir}/report[.md]` · `GET/POST /api/harnesses` ·
`GET /api/tasks` · `GET /api/models` (curated list, live catalogue, observed cost per run) · `POST /api/settings/key` ·
`POST /api/jobs` (`sentinel_ab`, `sentinel_only`) · `GET /api/jobs` ·
`POST /api/jobs/{id}/cancel` · `GET /api/events` (SSE) · `GET /api/sentinel` · `POST /api/sentinel/train` ·
`POST /api/sentinel/replay` · `GET /api/sentinel/replay_all/{dir}` · `POST /api/sentinel/activate` ·
`POST /api/real/import` · `GET /api/real/status` · `GET /api/real/{dir}/analysis` · `POST /api/judge/run` · `GET /api/judge`

## Changes to agentlab (all backward compatible)

- `ledger.py`: `Ledger(..., listener=None)` calls `listener(rec)` after every span; `RunSummary` gets
  `sentinel_interventions`, `sentinel_max_risk`, `sentinel_cost_usd`; span kind `sentinel` documented.
- `harness.py`: `HarnessConfig.sentinel: dict = {}`; `run_task(..., span_listener=None, step_hook=None, run_id=None)`;
  hook verdicts (`nudge` / `block` / `abort`), the `sentinel_abort` exit reason, and `sentinel_blocked` tool status.
- `tools.py` / `grader.py`: subprocesses get a `python` shim pointing at the running interpreter when the host only has
  `python3` (macOS without a `python` alias), so task commands that say `python -m unittest` run everywhere.
- The existing harness JSONs, exercises, trajectory tests and `tests_agentlab` are unchanged and still pass;
  `tests_agentlab/test_singletree.py` covers the sentinel evaluation, paired seeds, job expansion and the shim.
