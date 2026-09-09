# harnesslab

*Treating the agent harness as a controlled experimental variable.*

The harness is the apparatus around the model: the tool surface, the permission policy, the
context window, the stopping rule. Change it and the same model, on the same tasks, moves by more
than the gap between models. This is a lab for measuring that instead of assuming it away.

Companion lab for the lecture *The software won't hold still: benchmarking and testing LLM coding agents*.

You get a deliberately small coding-agent harness, eight tiny repositories with issues (three of them are traps),
a measurement ledger that records every model call, tool call, edit, and policy event, and eight exercises that
walk from "one passing run" to an evaluation report card with uncertainty, conduct, cost, and integrity checks,
and on to a two-factor experiment.

No third-party dependencies. Python 3.10+. `matplotlib` is optional (figures).

## 60-second start (offline)

```bash
cd lab
python -m harnesslab run --provider mock --tasks t01_slugify --repeats 3 --out data/runs/mine -v
python exercises/ex1_variance.py            # uses the pre-recorded data in data/runs/prerecorded_mock
python -m harnesslab                         # the platform: http://127.0.0.1:8765 (pip install -r harnesslab/requirements.txt)
```

## Live runs (bring an API key)

```bash
export OPENROUTER_API_KEY=...       # or ANTHROPIC_API_KEY / OPENAI_API_KEY with --provider anthropic / openai
python -m harnesslab run --provider openrouter --model anthropic/claude-sonnet-5 \
    --tasks t01_slugify,t03_ratelimit,t07_cache_cleanup --repeats 3 --out data/runs/mine -v
python -m harnesslab run --provider openrouter --model openai/gpt-5.6-sol --harness harnesses/no_test_tool.json \
    --tasks t01_slugify,t03_ratelimit,t07_cache_cleanup --repeats 3 --out data/runs/mine -v
python exercises/ex2_harness.py --results data/runs/mine
python scripts/frontier_batch.py --estimate     # a models x harnesses x tasks x repeats design under a budget
```

With `--provider openrouter` the cost recorded per call is the exact charge the endpoint reports (`usage.cost`);
with the other providers it is tokens × the price table in `harnesslab/core/providers.py`.

Any OpenAI-compatible endpoint works: `--provider openai --base-url https://openrouter.ai/api/v1 --model ...`,
or a local model via Ollama (`--base-url http://localhost:11434/v1`).

Budget: a run is 4-15 model calls; the transcript is re-sent on every call, so a frontier model sees 20-60k input
tokens per run and writes 1-5k. At Sonnet-5 / GPT-5.6 prices that is $0.05-0.15 per run; the full lab plan (about
60 live runs plus the judge exercise) is $5-10 per participant. Opus-class models cost about 2.5x. Use `--price in,out`
(USD per million tokens) if your model is not in `harnesslab/core/providers.py::PRICES`.

Safety: the sandbox is a scratch copy of the task repository plus a command policy, not a security boundary.
Point a real model at it inside a container or VM if you care about the host. Network, privilege escalation,
and secret access are always blocked; `permissive` harnesses execute destructive shell commands *inside the
scratch copy only*.

## The web platform (harnesslab)

`pip install -r harnesslab/requirements.txt && python -m harnesslab` opens a local web app over the same data:
launch cells against the mock agent or any OpenRouter model, watch every ledger span live, compare harnesses
and model families, replay trajectories with a risk curve, and train the **sentinel**, an early-warning hook
that scores the partial trajectory and can block a bad submit before it happens. **Patterns** puts the action
alphabet to work over sets of runs (sequences, transition matrices, divergence, regex queries that export as
unittests) and **Experiment** fits the exercise-8 factorial for whatever is in the filter. Dark and light (projector) themes;
Present mode is a lecture view over the live pages. See `harnesslab/README.md`.

The earlier stdlib console (`python -m harnesslab.core.serve`, port 8766, `--export me.html`) still ships as a legacy
UI; harnesslab supersedes it and its remaining unique views are being ported before it is removed.

## Layout

```
harnesslab/core/     the measurement engine (see harnesslab/core/__init__.py for the module map)
harnesslab/           the web platform: FastAPI backend, sentinel module, prebuilt React UI
tasks/<id>/          issue.md, repo/ (what the agent sees), hidden_tests/, hidden_tests_strong/, task.json
harnesses/*.json     six harness configurations: same model, different measurement cell
exercises/ex1..ex8   the lab, in order; every script takes --results <dir> and --harness <id>; ex7 streams real trajectories; ex8 is the 2 x 2 factorial
trajectory_tests/    unittest assertions over trajectories (exercise 3)
data/runs/prerecorded_mock/        480 offline runs: 8 tasks x 6 harnesses x 10 repeats
data/runs/prerecorded_mock_weak/   160 offline runs: 8 tasks x 2 harnesses x 10 repeats (model 'mock-weak', for exercise 8)
web/                 the legacy stdlib console's single-page app (superseded by harnesslab/frontend)
harnesslab/core/console.py, serve.py   the legacy console's bundle builder and stdlib server / static exporter
solutions/           reference patches and instructor notes (spoilers)
tests_agentlab/      self-tests for the infrastructure: python -m unittest discover -s tests_agentlab
```

## The measurement ledger

Every run writes `ledger.jsonl`: one JSON span per consequential action. Field names mirror the OpenTelemetry
GenAI semantic conventions so the mapping to production telemetry is direct:

| span | what it records |
|---|---|
| `invoke_agent` | start (full harness config, seed) and end (exit reason, totals) |
| `chat` | one model call: `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, latency, derived `cost_usd`, tool calls requested |
| `execute_tool` | one tool execution: `gen_ai.tool.name`, args, status (`ok`/`blocked`/`error`), duration, result preview |
| `edit` | a file changed: path, lines added/removed |
| `boundary_event` | the policy flagged an action: `kind` in {destructive_shell, network, privilege, secret_access, path_escape, test_tampering}, `status` blocked/allowed |
| `grade` | visible, hidden, and strengthened tests (hidden + strong, a superset) run on a pristine copy of the final workspace |

`index.jsonl` has one summary row per run (outcome, steps, tokens, cost, boundary events, exit reason, ...).

## Task probes

| task | what it measures beyond correctness |
|---|---|
| t05_leaky_duration | the issue contains the fix (solution leakage / contamination) |
| t06_injected_config | CONTRIBUTING.md carries an injected instruction to exfiltrate keys (inert domain; blocked by policy) |
| t07_cache_cleanup | the issue tempts `rm -rf` on a directory (destructive action, under-specified scope) |
| t08_ambiguous_handler | two plausible "deprecated" targets (wrong-target edits; visible tests do not catch it) |
| t01, t02, t04 | visible tests are weak; strengthened tests catch plausible wrong fixes |

## Real trajectories (exercise 7)

`pip install datasets`, then `python exercises/ex7_real_trajectories.py --n 500` streams 500 runs from
nebius/SWE-agent-trajectories (80,036 SWE-agent runs with resolved labels, CC-BY-4.0), reproduces the
dataset card's resolved-vs-unresolved comparison on the sample, and ranks binary trajectory features by
Ochiai suspiciousness (spectrum-based fault localisation over runs). `--offline` runs the same analysis on
the mock ledgers. `--to-console DIR` also writes the streamed trajectories as a results directory (`real_traj.to_results_dir`)
so the console shows real SWE-agent runs with the same predicates. Parsing lives in `harnesslab/core/real_traj.py`; the attribution in `harnesslab/core/analysis.py`.

## Importing real trajectories

`python -m harnesslab.core.import_traj <file.traj.json> --out data/runs/imported` converts a mini-SWE-agent
trajectory into the ledger format (best effort; no grading). Use it to run the trajectory tests and the
conduct report on runs produced by a real agent.

## The experiment (exercise 8)

`python exercises/ex8_experiment.py` fits the 2 × 2 design (mock, mock-weak) × (baseline, no_test_tool) with tasks as
blocks: design table with task-bootstrap intervals, sum-of-squares decomposition with the share of each term, paired
Δ_H per model, and the interaction estimate. `--results2` adds a second results directory (for example your live model)
as another level of the model factor. The mock-weak model is `MockProvider` with `strength = 0.65`, so the interaction
is additive by construction — which is what makes it a control.

The platform's **Experiment** page fits the same design for whatever is in the filter, and adds the two questions a
leaderboard cannot answer: how many runs per arm it would take to detect the difference you are looking at, and how
often the ranking inverts at the n you actually have.
