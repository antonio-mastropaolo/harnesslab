# Instructor notes (do not distribute)

## Before the session

1. `python -m harnesslab.core.runner --provider mock --tasks all --repeats 1 --out /tmp/check` must print 8 lines and no traceback.
2. Run every exercise once on the pre-recorded data; outputs below are what to expect (seed 7). Start `python -m harnesslab.core.serve` once and click through the nine views; export with `--export check.html` so you have a static fallback to project if a laptop cannot run the server. Run exercise 7 once online the day before so the feature cache (data/figures/nebius_features_*.jsonl) exists on your machine as a fallback to distribute.
3. Run `python scripts/frontier_batch.py --estimate`, then the batch itself with the OpenRouter key (default design: Sonnet 5, GPT-5.6 Sol, DeepSeek V4 Pro, GLM 5.3 × baseline, no_test_tool, terse_prompt × 8 tasks × 3 repeats = 288 runs, planning estimate about $25, budget cap $50; add `--models anthropic/claude-opus-5 --harnesses baseline,no_test_tool` for 48 Opus runs, about $13). The `frontier_*` directories go into the zip you distribute; they are the real-model version of the pre-recorded mock data and they make the Experiment view's interaction plot real. Also do 3 live runs yourself with the model you will recommend, so you know the per-run cost and whether the model calls tools reliably. Small models occasionally exit `no_action` (they answer in prose instead of calling `submit`); that is itself a teaching point but it should not be the majority.
4. Have `data/runs/prerecorded_mock` (480 runs) and `data/runs/prerecorded_mock_weak` (160 runs, the weaker mock for exercise 8) in the repo you distribute. Everything works with no key.
5. The console launches runner jobs as subprocesses of the server; the API key must be exported in the terminal that starts the server. Jobs and their logs are listed on the Board; logs are in data/jobs/.

## Expected numbers on the pre-recorded data (seed 7, 10 repeats)

Baseline: pass@1 0.66, pass^3 0.43, pass@3 0.89, flip rate 0.75, tokens/solve ~9k, boundary 0.11, verified 0.93.
Six-harness table: pass@1 within 0.59–0.73 (no_test_tool lowest, tight_budget highest); tokens/solve 4.9k–9.0k; verified 0.00 (no_test_tool) to 0.94; permissive is the only one with tests_modified > 0.
Paired bootstrap no_test_tool − baseline: −0.075, 95% CI [−0.30, +0.11]. The CI includes zero. That is the lesson.
t07 under permissive has pass 0.10 in this seed versus 0.50 under baseline; that is sampling noise at n=10 (p_correct is the same), and is worth pointing at when someone asks whether permissive is "worse".
Trajectory tests: baseline fails only process-quality tests (unverified submits, idle loops, no_submit); permissive additionally fails `test_no_destructive_shell_executed` and `test_tests_never_modified`.
Judge (mock): agreement ~0.73, kappa ~0.45, test-retest ~0.93, P(pick A) 0.69 before swap and 0.38 after. The mock judge memoises an opinion per patch, so identical patches share a verdict; with a bad seed this makes kappa jump around. Re-run with `--seed 1` if the numbers look odd.
Distortions: t05 pass 1.00 with patch~issue similarity ~0.38 versus <0.05 elsewhere; strengthened tests drop t06 hidden-passers by ~49% (bool coercion) and t08 by ~36% (function left in place); overclaim 0.21–0.29 for harnesses with run_tests. Under the strengthened oracle the ranking moves: permissive 3 → 5, terse_prompt 5 → 3; baseline, no_test_tool, short_context and tight_budget keep their ranks. (The strengthened suite is a superset of the hidden suite: strong = hidden tests + strong tests. Pre-recorded data was regenerated to that definition; 46 runs that previously read 'hidden fail, strong pass' now read 'strong fail'.)
Console (Board, all runs, hidden oracle): 640 runs, pass@1 61.9% with task-bootstrap 95% [0.49, 0.76], pass^3 30.5%, flip rate 100%, cost of pass $0.0085, verified 63%, boundary 7%. Integrity: visible 87.3%, hidden 61.9%, strengthened 60.5%; visible-vs-hidden κ 0.38; 25.5% of runs 'visible passes, hidden fails'. Attribution (hidden oracle, default thresholds): no_test_run 0.461 (42% of failures, 26% of successes), never_verified_after_edit 0.378, no_edit_at_all 0.339, did_not_submit 0.302.

## Why the mock behaves the way it does

`agentlab/_mock_knowledge.py::PROFILES` sets per-task probabilities of a correct first attempt, retry after failing tests, test tampering, following the injection (t06), destructive shell (t07), wrong target (t08), idle loop, and giving up. The mock reads the harness: without `run_tests` it cannot retry, with a terse system prompt it verifies less and tampers more, with a short context window it re-reads files. All of that is documented in `mock.py`. If a student asks "is the mock rigged?": yes, deliberately, and the live runs are there to check whether real models show the same shapes. In our experience they do (verification rate and boundary events move with the harness far more than pass rate does).

## Answers to the questions

### Ex1
Q1. Divergence is usually at the first `write_file` (buggy versus correct content), i.e. *what*; the tool sequence before it is often identical. HAL's "what but not when" finding is the opposite pattern at scale: same action types, different order.
Q2. One run reports 0 or 1 per task. pass^5 is 0.34 versus pass@1 0.66. A reviewer should ask for the distribution and the repeat count.
Q3. Task-level: tasks are the sampled unit; runs within a task are not independent draws from the task population. The run-level interval treats 80 correlated outcomes as 80 independent ones.
Q4. For p≈0.66, one binomial SE over n tasks is sqrt(0.66·0.34/n) ≈ 0.47/sqrt(n); a ±5 point interval needs n≈90 task-level observations. Repeats reduce within-task noise but not between-task variance, so more tasks beats more repeats once repeats ≥3.

### Ex2
Q1. In the mock, pass@1 moves least; tokens/solve and verification rate move most. The same is true in Vats & Golev.
Q2. It submits the buggy fix; pass^k falls because the retry channel is gone, even where pass@1 barely moves.
Q3. `tests_mod` and `boundary ... allowed`. A leaderboard shows neither.
Q4. Any change that adds steps without changing the retry channel: context_window=1 forces re-reads; a verbose system prompt asking for exhaustive exploration; observation truncation.
Q5. Expect the same ordering on verification rate and cost; pass rate may reorder with n=9. To claim generalisation you need more tasks, more models, and a preregistered comparison.

### Ex3
Q1. Safety group: policy. Process group: metric, except `tests_never_modified` which most teams will make a policy. Budgets: policy for the benchmark operator (a run over budget is not a valid run), metric for the researcher.
Q2. The hidden outcome does not change (tests use temp dirs); the ledger changes: `status: allowed`, and the `cache/` directory is gone in the workspace. The score is blind to it.
Q3. An `execute_tool` span with a network command that was *not* blocked, plus, outside the ledger, an egress log. The ledger can show intent and attempt; only network telemetry shows success. This motivates recording boundary events at the tool boundary and not trusting the model's summary.
Q4. Read patch.diff; for t04 assert `import csv` not in added lines; for t01 assert the `def slugify(text: str) -> str:` line is unchanged.
Q5. A rate test needs a sample size and a tolerance; with 10 runs a 5% threshold is one event. Frame it as a CI band over repeated runs, or as a sequential test.

### Ex4
Q1. Hides the base rate and the chance agreement; kappa is agreement beyond chance, 0 = chance, 1 = perfect.
Q2. With the mock, yes (`verbosity_bias=0.10`). Without an oracle: pad patches and compare verdict distributions, which needs no ground truth.
Q3. No. High test-retest with low kappa is a consistently wrong judge (Norman et al.'s consistency–bias paradox).
Q4. Minimum: an oracle-labelled calibration set of ≥50 items balanced across outcomes, report kappa (not agreement), swap positions for pairwise, repeat each judgment ≥2 times and report consistency, report the judge model and prompt verbatim, and re-calibrate when either changes.
Q5. Real judges on these toy patches tend to be strong on correctness (kappa 0.6–0.9) and still show measurable position bias; `--repeats 3` usually lowers test-retest a little at temperature 0 because providers are not deterministic.

### Ex5
Q1. (i) String similarity between issue text and gold patch; (ii) search the issue thread for fenced code blocks that compile and touch the same file. Both flag t05. Both miss paraphrased solutions and solutions in linked PRs.
Q2. Ranking changes for permissive (3 → 5) and terse_prompt (5 → 3) in the pre-recorded data; any claim ordering harnesses by hidden pass rate is fragile.
Q3. t06's strong test enforces a boolean-parsing convention the issue never states; t01's unicode test likewise. The benchmark should record test provenance and let contributors contest; BASTION's dispute process is exactly this.
Q4. Retire when (a) first-appearance evidence predates model training cutoffs, or (b) leaderboard-wide pass rate saturates, or (c) a leakage detector fires; keep historical scores with the task version pinned, never silently re-score.

### Ex6
1. Yesterday: pass@1. Now: pass@1 with a task-level CI, pass^k, and tokens (or $) per solve; plus the conduct row.
2. Missing: security scan of the produced code (SAST/CWE), task provenance (first-appearance evidence), a ledger schema shared across sites. The first is a `grade`-time step running a scanner over the workspace and recording findings as a span.

### Ex7 (real trajectories)
Expected on a 500-row stream (seed 0, all models): resolved share around 15-20% (the full set is 16.7%); unresolved runs roughly 1.6-2x the steps; submit rate ~95% vs ~55-60%; context-exhaustion exit near zero in resolved and 25-35% in unresolved. Top Ochiai features are usually `exit_context`, `did_not_submit`, `steps>40`, and `never_verified_after_edit`. `no_search` is the planted base-rate lesson in the offline run; on real data it is rarer.
Q1. exit_context and did_not_submit are symptoms (they are how the run ended); steps>40 is partly a harness artefact (the step cap); never_verified_after_edit is closest to a cause. The separating experiment is a harness change: give the same model a verify-before-submit rule and see whether the feature's rate in failures moves.
Q2. The nebius runs are SWE-agent + open-weight models on SWE-bench-extra; Majgaonkar's are OpenHands/SWE-agent/Prometheus with stronger models on SWE-bench. Different cells, different bottlenecks; 'the bottleneck' is not well-formed without the cell.
Q3. A step cap shows up in the exit-reason distribution and in mean steps; it hides in pass@1 (runs that would fail anyway fail either way) and in tokens per solve (it caps the cost of failures, flattering the harness).
Q4. Rankings shift with model; features tied to control (repetition, context) move most. All runs share the harness, so harness-specific features are constant here; you would need a second harness to see them.
Q5. Filtering on a symptom (exit_context) removes the long failures and teaches shorter runs, not better ones; filtering on verification teaches the behaviour. This is SWE-Gym's verifier-guided sampling in miniature.
If the download fails in the room (proxy, no network), run --offline; the method is identical and the base-rate lesson is stronger on the mock.

### Ex8 (the experiment)
Expected (mock + mock-weak, baseline + no_test_tool, 320 runs): cell means 0.662 / 0.588 / 0.525 / 0.438; shares model 2.1%, harness 0.7%, interaction 0.0%, task 18.7%, cell × task 9.2%, residual 69.4%; paired Δ (no_test_tool − baseline) −0.075 [−0.30, +0.11] for mock and −0.087 [−0.29, +0.08] for mock-weak; interaction estimate −0.012. In the console's Experiment view the same design appears with Wilson intervals per cell; clicking mock|baseline as A and mock|no_test_tool as B gives +7.5 points, paired 95% about [−0.30, +0.11], and 651 runs per arm to detect that difference at power 0.8.
Q1. The task block. It shrinks only if tasks are homogeneous in difficulty, which is the opposite of what a benchmark wants; the right response is blocking, not homogenising.
Q2. The CI on a cell mean scales with 1/sqrt(repeats) for the residual part only; halving that contribution needs 4× the repeats, and the task part does not move at all.
Q3. Adding a third harness grows the harness share (six harnesses give about 2.3%) and, on the mock, the interaction stays near zero: the mock's harness sensitivities are additive by construction (strength multiplies p_correct). Real models need not be; that is HarnessBank's claim.
Q4. The sign usually agrees (no_test_tool lowers pass^k more than pass@1) but the magnitude differs. Generalisation needs more models, more tasks, and a preregistered contrast; one live model is a third level, not a generalisation.
Q5. H0: E[Y | M, B, T] = E[Y | M, A, T]. Nuisance: task set and version, environment (deps, network), budget (steps, tokens), oracle and its version, temperature/seed, date (API drift). A leaderboard holds the task set and the oracle fixed, and rarely anything else.

## The console in the room

- Open the Board on the projector with the pre-recorded data before students arrive. Switch the oracle chip once as the first thing you do: it is the fastest demonstration of 'the runs did not change, the verdict did'.
- Exercise 2: ask each pair to say aloud which field they changed and which column they predicted before they launch. The Harness editor writes harnesses/<id>.json; the Board's launch panel takes comma-separated harness files so baseline and theirs land in one results directory.
- Exercise 3: the predicate 'no identical call repeated on an unchanged state' resets at every edit; running the tests twice around an edit is not a repeat. Students will ask.
- Exercise 8: the variance table uses the balanced subset of harnesses (those present for every model). With one live model on two harnesses added to the mock's six, the decomposition drops to the two shared harnesses; the interaction plot still shows all of them.
- Static export: `python -m harnesslab.core.serve --export` embeds every ledger (about 3.6 MB for 640 runs). It opens from a file:// URL with no server, so it is also the fallback if a laptop cannot bind a port.

## Timing risks

- Live runs are the only slow part. Start them at minute 0 in a second terminal; everything else works offline.
- Ex3 tends to run long because students want to read whole ledgers. Cap the timeline reading at five minutes.
- If short on time, cut Ex5(c) and the Ex4 process-judging section; exercise 7 can be assigned as homework since it needs no key, only network. Exercise 8 on the pre-recorded data takes five minutes in the console; the live third level is the part to drop.
