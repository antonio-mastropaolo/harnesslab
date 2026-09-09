"""Metrics over a results directory (index.jsonl + per-run ledgers).

Everything here works on plain lists/dicts; pandas is optional and only used
for pretty tables. Functions:

  load_index(dir)                     -> list[dict]      one row per run
  load_ledger(dir, run_id)            -> list[dict]      spans of one run
  pass_at_k(c, n, k), pass_pow_k(c, n, k)                 per-task estimators (unbiased)
  task_table(rows)                    -> {task_id: {n, c, pass1, pass_at_k..., pass_pow_k...}}
  aggregate(rows, k_values)           -> {'pass@1', 'pass@k', 'pass^k', ...} averaged over tasks
  bootstrap_ci(values, stat, B)       -> (lo, hi)
  paired_bootstrap(rows_a, rows_b)    -> mean difference in per-task pass rate with CI
  tokens_per_solve(rows), cost_of_pass(rows)
  flip_rate(rows)                     -> fraction of tasks whose outcome is not constant across repeats
  boundary_rate(rows)                 -> fraction of runs with >= 1 boundary event, by kind
  cohen_kappa(a, b)                   -> chance-corrected agreement between two label lists
  tool_histogram(dir, rows)           -> counts of tool names across ledgers
"""
from __future__ import annotations
import json, math, os, random
from collections import Counter, defaultdict
from math import comb
from typing import Callable, Iterable, Optional


# ---------------------------------------------------------------- loading
def load_index(results_dir: str) -> list[dict]:
    rows = []
    with open(os.path.join(results_dir, "index.jsonl")) as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def load_ledger(results_dir: str, run_id: str) -> list[dict]:
    with open(os.path.join(results_dir, run_id, "ledger.jsonl")) as f:
        return [json.loads(l) for l in f if l.strip()]


def filter_rows(rows, harness_id=None, task_id=None, model=None):
    return [r for r in rows if (harness_id is None or r["harness_id"] == harness_id)
            and (task_id is None or r["task_id"] == task_id) and (model is None or r["model"] == model)]


# ---------------------------------------------------------------- estimators
def pass_at_k(c: int, n: int, k: int) -> float:
    """Unbiased pass@k (Chen et al. 2021): P(at least one of k sampled runs succeeds)."""
    if n - c < k:
        return 1.0
    return 1.0 - comb(n - c, k) / comb(n, k)


def pass_pow_k(c: int, n: int, k: int) -> float:
    """pass^k (Yao et al. 2024, tau-bench): P(all k sampled runs succeed)."""
    if c < k:
        return 0.0
    return comb(c, k) / comb(n, k)


def task_table(rows: list[dict], outcome: str = "hidden_pass", k_values=(1, 2, 3, 5)) -> dict:
    by_task = defaultdict(list)
    for r in rows:
        by_task[r["task_id"]].append(bool(r.get(outcome)))
    out = {}
    for tid, outcomes in sorted(by_task.items()):
        n, c = len(outcomes), sum(outcomes)
        rec = {"n": n, "c": c, "pass1": c / n if n else float("nan")}
        for k in k_values:
            if k <= n:
                rec[f"pass@{k}"] = pass_at_k(c, n, k)
                rec[f"pass^{k}"] = pass_pow_k(c, n, k)
        out[tid] = rec
    return out


def aggregate(rows: list[dict], outcome: str = "hidden_pass", k_values=(1, 2, 3, 5)) -> dict:
    tt = task_table(rows, outcome, k_values)
    if not tt:
        return {}
    keys = set().union(*(set(v) for v in tt.values())) - {"n", "c"}
    return {k: sum(v[k] for v in tt.values() if k in v) / sum(1 for v in tt.values() if k in v) for k in sorted(keys)}


# ---------------------------------------------------------------- uncertainty
def bootstrap_ci(values: list, stat: Callable = None, B: int = 2000, alpha: float = 0.05, seed: int = 0) -> tuple[float, float]:
    """Percentile bootstrap CI of `stat(values)` (default: mean)."""
    stat = stat or (lambda xs: sum(xs) / len(xs))
    rng = random.Random(seed)
    n = len(values)
    if n == 0:
        return (float("nan"), float("nan"))
    boots = sorted(stat([values[rng.randrange(n)] for _ in range(n)]) for _ in range(B))
    return boots[int(alpha / 2 * B)], boots[int((1 - alpha / 2) * B) - 1]


def per_task_rates(rows: list[dict], outcome: str = "hidden_pass") -> dict:
    tt = task_table(rows, outcome)
    return {t: v["pass1"] for t, v in tt.items()}


def paired_bootstrap(rows_a: list[dict], rows_b: list[dict], outcome: str = "hidden_pass", B: int = 5000, seed: int = 0) -> dict:
    """Task-paired bootstrap of the difference in mean per-task pass rate (B minus A).
    Resamples *tasks* with replacement, which is the right unit when the same tasks
    were run under both conditions (Vats & Golev 2026 use the same design)."""
    ra, rb = per_task_rates(rows_a, outcome), per_task_rates(rows_b, outcome)
    tasks = sorted(set(ra) & set(rb))
    diffs = [rb[t] - ra[t] for t in tasks]
    if not diffs:
        return {"n_tasks": 0}
    rng = random.Random(seed)
    boots = sorted(sum(diffs[rng.randrange(len(diffs))] for _ in diffs) / len(diffs) for _ in range(B))
    return {"n_tasks": len(tasks), "mean_diff": sum(diffs) / len(diffs),
            "ci95": (boots[int(0.025 * B)], boots[int(0.975 * B) - 1]),
            "per_task": dict(zip(tasks, diffs))}


# ---------------------------------------------------------------- efficiency and cost
def tokens_per_solve(rows: list[dict], outcome: str = "hidden_pass") -> float:
    """Total tokens spent (all runs) divided by number of solved runs. Infinite if nothing solved."""
    tot = sum(r["input_tokens"] + r["output_tokens"] for r in rows)
    solved = sum(1 for r in rows if r.get(outcome))
    return tot / solved if solved else float("inf")


def cost_of_pass(rows: list[dict], outcome: str = "hidden_pass") -> float:
    """Expected dollars per correct solution (Erol et al. 2025): mean cost / pass rate."""
    if not rows:
        return float("nan")
    mean_cost = sum(r["cost_usd"] for r in rows) / len(rows)
    p = sum(1 for r in rows if r.get(outcome)) / len(rows)
    return mean_cost / p if p else float("inf")


def mean(xs: Iterable[float]) -> float:
    xs = list(xs)
    return sum(xs) / len(xs) if xs else float("nan")


# ---------------------------------------------------------------- stability and conduct
def flip_rate(rows: list[dict], outcome: str = "hidden_pass") -> float:
    """Fraction of tasks (with >= 2 runs) whose outcome differs across runs."""
    by_task = defaultdict(set)
    counts = Counter(r["task_id"] for r in rows)
    for r in rows:
        by_task[r["task_id"]].add(bool(r.get(outcome)))
    eligible = [t for t in by_task if counts[t] >= 2]
    return sum(1 for t in eligible if len(by_task[t]) > 1) / len(eligible) if eligible else float("nan")


def boundary_rate(rows: list[dict]) -> dict:
    n = len(rows)
    any_rate = sum(1 for r in rows if r.get("boundary_events", 0) > 0) / n if n else float("nan")
    kinds = Counter(k for r in rows for k in r.get("boundary_kinds", []))
    return {"any": any_rate, "by_kind": {k: v / n for k, v in kinds.items()}}


def exit_reasons(rows: list[dict]) -> dict:
    c = Counter(r["exit_reason"] for r in rows)
    return {k: v / len(rows) for k, v in c.items()}


# ---------------------------------------------------------------- agreement
def cohen_kappa(a: list, b: list) -> float:
    assert len(a) == len(b) and a, "label lists must be non-empty and equal length"
    n = len(a)
    po = sum(1 for x, y in zip(a, b) if x == y) / n
    labels = set(a) | set(b)
    pe = sum((sum(1 for x in a if x == l) / n) * (sum(1 for y in b if y == l) / n) for l in labels)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


# ---------------------------------------------------------------- trajectory features
def tool_histogram(results_dir: str, rows: list[dict]) -> Counter:
    c = Counter()
    for r in rows:
        for span in load_ledger(results_dir, r["run_id"]):
            if span["span"] == "execute_tool":
                c[span["gen_ai.tool.name"]] += 1
    return c


def summarize(rows: list[dict], label: str = "", outcome: str = "hidden_pass") -> dict:
    """One-line summary used by the exercises."""
    agg = aggregate(rows, outcome)
    return {
        "label": label, "runs": len(rows), "tasks": len({r["task_id"] for r in rows}),
        "pass@1": agg.get("pass@1"), "pass^3": agg.get("pass^3"), "pass@3": agg.get("pass@3"),
        "flip_rate": flip_rate(rows, outcome),
        "mean_steps": mean(r["steps"] for r in rows),
        "mean_tokens": mean(r["input_tokens"] + r["output_tokens"] for r in rows),
        "tokens_per_solve": tokens_per_solve(rows, outcome),
        "mean_cost": mean(r["cost_usd"] for r in rows),
        "cost_of_pass": cost_of_pass(rows, outcome),
        "boundary_any": boundary_rate(rows)["any"],
        "tests_modified": mean(1.0 if r.get("tests_modified") else 0.0 for r in rows),
        "ran_tests_before_submit": mean(1.0 if r.get("ran_tests_before_submit") else 0.0 for r in rows),
        "exit": exit_reasons(rows),
    }


def fmt_summary(s: dict) -> str:
    def f(x, spec=".2f"):
        return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else (f"{x:{spec}}" if not isinstance(x, float) or math.isfinite(x) else "inf")
    return (f"{s['label']:<16} runs={s['runs']:<4} pass@1={f(s['pass@1'])} pass^3={f(s['pass^3'])} pass@3={f(s['pass@3'])} "
            f"flip={f(s['flip_rate'])} steps={f(s['mean_steps'], '.1f')} tok/run={f(s['mean_tokens'], '.0f')} "
            f"tok/solve={f(s['tokens_per_solve'], '.0f')} $/run={f(s['mean_cost'], '.4f')} $/pass={f(s['cost_of_pass'], '.4f')} "
            f"boundary={f(s['boundary_any'])} tests_mod={f(s['tests_modified'])} verified={f(s['ran_tests_before_submit'])}")


# ---------------------------------------------------------------- spectrum-based attribution over trajectories
def ochiai_attribution(feature_rows: list[dict], outcome_key: str = "resolved") -> list[dict]:
    """Spectrum-based fault localisation (Ochiai) applied to runs instead of statements.
    rows = runs, columns = binary trajectory features, 'failing' = not resolved.
    susp(feature) = ef / sqrt(F * (ef + ep)), where ef/ep = failing/passing runs that
    exhibit the feature and F = total failing runs. Correlation, not causation."""
    import math
    from .real_traj import binary_features
    feats = [binary_features(r) for r in feature_rows]
    fails = [not r[outcome_key] for r in feature_rows]
    F = sum(fails)
    out = []
    for name in feats[0]:
        ef = sum(1 for f, x in zip(feats, fails) if f[name] and x)
        ep = sum(1 for f, x in zip(feats, fails) if f[name] and not x)
        susp = ef / math.sqrt(F * (ef + ep)) if F and (ef + ep) else 0.0
        rate_fail = ef / F if F else float("nan")
        rate_pass = ep / (len(fails) - F) if len(fails) - F else float("nan")
        out.append({"feature": name, "ochiai": susp, "ef": ef, "ep": ep, "rate_in_failures": rate_fail, "rate_in_successes": rate_pass})
    return sorted(out, key=lambda d: -d["ochiai"])


# ---------------------------------------------------------------- factorial designs
def factorial(rows: list[dict], a_key: str = "model", b_key: str = "harness_id", block_key: str = "task_id",
              outcome: str = "hidden_pass") -> dict:
    """Two-factor (A x B) design with tasks as blocks, balanced, sums-of-squares decomposition.

    Y_ijk = mu + alpha_i + beta_j + (alpha beta)_ij + u_k + eps_ijk  (fixed A, B; task as a block)
    Returns the ANOVA-style table (SS, df, MS, F) and the share of total variance each term explains.
    This is the textbook decomposition, not REML; it is meant to make the components visible."""
    from collections import defaultdict
    ys = [1.0 if r.get(outcome) else 0.0 for r in rows]
    A = [r[a_key] for r in rows]; B = [r[b_key] for r in rows]; K = [r[block_key] for r in rows]
    n = len(ys); mu = sum(ys) / n
    def mean_by(keys):
        acc = defaultdict(list)
        for k, y in zip(keys, ys):
            acc[k].append(y)
        return {k: sum(v) / len(v) for k, v in acc.items()}, {k: len(v) for k, v in acc.items()}
    ma, na = mean_by(A); mb, nb = mean_by(B); mk, nk = mean_by(K)
    mab, nab = mean_by(list(zip(A, B)))
    mabk, nabk = mean_by(list(zip(A, B, K)))
    ss_total = sum((y - mu) ** 2 for y in ys)
    ss_a = sum(na[a] * (ma[a] - mu) ** 2 for a in ma)
    ss_b = sum(nb[b] * (mb[b] - mu) ** 2 for b in mb)
    ss_ab = sum(nab[ab] * (mab[ab] - ma[ab[0]] - mb[ab[1]] + mu) ** 2 for ab in mab)
    ss_k = sum(nk[k] * (mk[k] - mu) ** 2 for k in mk)
    # residual within cells (A x B x task)
    ss_within = sum((y - mabk[(a, b, k)]) ** 2 for y, a, b, k in zip(ys, A, B, K))
    ss_cells_x_task = ss_total - ss_a - ss_b - ss_ab - ss_k - ss_within  # A x task, B x task, A x B x task lumped
    df_a, df_b = len(ma) - 1, len(mb) - 1
    df_ab = df_a * df_b; df_k = len(mk) - 1
    df_within = n - len(mabk)
    df_cxt = (len(mabk) - 1) - df_a - df_b - df_ab - df_k
    ms_within = ss_within / df_within if df_within else float("nan")
    table = []
    for name, ss, df in [("model (A)", ss_a, df_a), ("harness (B)", ss_b, df_b), ("model x harness (AB)", ss_ab, df_ab),
                         ("task (block)", ss_k, df_k), ("cell x task", ss_cells_x_task, max(df_cxt, 1)), ("residual (repeats)", ss_within, df_within)]:
        ms = ss / df if df else float("nan")
        table.append({"term": name, "SS": ss, "df": df, "MS": ms, "F": (ms / ms_within if name != "residual (repeats)" and ms_within else float("nan")),
                      "share": ss / ss_total if ss_total else float("nan")})
    return {"n": n, "grand_mean": mu, "cell_means": {f"{a} | {b}": v for (a, b), v in mab.items()},
            "a_means": ma, "b_means": mb, "table": table, "ss_total": ss_total}


def power_n(p_a: float, p_b: float, power: float = 0.8, alpha: float = 0.05) -> float:
    """Runs per arm needed to detect the difference between two proportions.

    The standard two-proportion normal approximation. Returns inf when the two rates are equal:
    no sample size resolves a difference of zero. This is the number the Experiment view draws as
    a curve, and the honest answer to "how many repeats would I have needed?"."""
    za = 1.959964 if abs(alpha - 0.05) < 1e-9 else 1.644854
    zb = 0.841621 if abs(power - 0.8) < 1e-9 else 1.281552
    d = p_a - p_b
    if not d:
        return float("inf")
    return math.ceil((za + zb) ** 2 * (p_a * (1 - p_a) + p_b * (1 - p_b)) / (d * d))


def wrong_winner(p_a: list[float], p_b: list[float], k: int, sims: int = 2000, seed: int = 3) -> dict:
    """Monte-Carlo: how often does the arm with the lower true mean finish ahead?

    Draws Bernoulli outcomes per task at each arm's observed per-task rate, k repeats per task,
    and counts how often the ranking inverts. With k = 1 this is a leaderboard's error rate on
    this pair. `p_a` and `p_b` are per-task rates over the SAME tasks, in the same order."""
    rng = random.Random(seed)
    better_a = (sum(p_a) / len(p_a)) >= (sum(p_b) / len(p_b)) if p_a and p_b else True
    wrong = ties = 0
    for _ in range(sims):
        a = b = 0
        for pa, pb in zip(p_a, p_b):
            for _ in range(k):
                if rng.random() < pa:
                    a += 1
                if rng.random() < pb:
                    b += 1
        if a == b:
            ties += 1
        elif (a > b) != better_a:
            wrong += 1
    return {"wrong": wrong / sims, "ties": ties / sims, "sims": sims, "k": k}
