# EW-AUC@k — an early-warning metric for trajectory sentinels

*One page. Everything here is computed by `harnesslab/backend/sentinel.py` (`train`, field `auc_by_step`)
and `harnesslab/backend/sentinel_ext.py` (`GET /api/sentinel/leaderboard`).*

## The question the metric answers

A sentinel watches a coding agent while it works and, at every step, emits a risk score
`r_i(k) ∈ [0,1]` for run *i* from the prefix of the trajectory up to step *k*. The run later gets a
label `y_i ∈ {0,1}` from the hidden tests (1 = the run eventually failed). The question is not "can you
tell afterwards", it is: **at step k, before the run is over, can you rank the runs that will fail above
the runs that will not?**

## Definition

Let `A(k) = { i : run i is still running at step k }` — the *alive-at-k cohort*: runs that produced a
step *k* at all. Then

```
EW-AUC@k  =  P( r_i(k) > r_j(k) )  for  i, j drawn from A(k) with y_i = 1, y_j = 0
          =  ( Σ_{i:y=1} Σ_{j:y=0} [ r_i(k) > r_j(k) ] + ½[ r_i(k) = r_j(k) ] ) / (n₁ n₀)
```

i.e. the ordinary Mann–Whitney AUC, computed **within one step index**, over the runs that reached it.
0.5 is chance; 1.0 is a perfect ranking. `sentinel.py::_auc` computes it with tie-averaged ranks and
per-example weights, so a bootstrap is just a re-weighting.

Two things follow from conditioning on `A(k)`:

* **the step index carries no information.** Every score in the comparison was produced at the same
  step, so a scorer that reads only "how long has this run been going" is exactly 0.5 by construction.
* **the cohort shrinks and its base rate drifts.** `n = |A(k)|` and the failure share inside it must be
  reported next to the number; on `real_swe_agent_500`, n = 367 / 265 / 191 at k = 10 / 15 / 20 with a
  failure share of 0.91 / 0.93 / 0.95. EW-AUC@k for large k is a statement about long runs only.

## Why the pooled prefix AUC is misleading

The obvious alternative — pool every (run, step) prefix and take one AUC — is *length-weighted*. Failing
runs are longer, so they contribute more prefixes, and the pooled AUC partly measures run length rather
than conduct. On the 500 imported SWE-agent runs this is not a subtlety:

| scorer | pooled AUC over all prefixes |
|---|---|
| **step index alone** (no features at all) | **0.65** |
| trained risk model | 0.72  (95% CI 0.64–0.78) |
| trained model, run-weighted (each run counts once) | 0.63  (95% CI 0.57–0.67) |

A scorer that has seen nothing but the clock gets 0.65. Most of the trained model's apparent 0.72 is that
same confound. Under EW-AUC@k the clock is worth 0.5 and the model has to earn the rest: out-of-fold,
**0.63 / 0.74 / 0.73 at k = 10 / 15 / 20**, against a rule-layer baseline of 0.46 / 0.36 / 0.29 and an
untrained prior of 0.47 / 0.47 / 0.42 on the same cohorts.

Run-weighting (every run counts once, its prefixes sharing one unit of weight) fixes the *weighting* but
not the *conditioning*: a long run still gets scored at late steps that a short run never reaches. Report
both if you like; report EW-AUC@k if you want to claim earliness.

## Lead time

AUC says nothing about *when*. Pick an operating threshold τ and define, for a run that is eventually
flagged (`first(i) = min{ k : r_i(k) ≥ τ }`):

```
lead_i = last_step(i) − first(i)          # steps of warning before the run ended
```

Report the **median** lead over flagged failures (the mean is dragged by a few very long runs), together
with recall = share of failing runs ever flagged and false alarm = share of passing runs ever flagged.
τ is a policy choice, not a property of the model; quote the whole triple or the number is unreadable.
On `real_swe_agent_500` at τ = 0.6 the trained model flags 48% of eventual failures with 12% false alarms,
a median 14.5 steps before the end. Restricting the decision to information available at or before step k
(what `/api/sentinel/leaderboard` reports per k) turns this into a genuinely early quantity: by step k,
how much has been caught, at what cost, with how much warning left.

## The ceiling: oracle-invisible failures

A trajectory sentinel sees conduct. It cannot see a patch that is wrong in a way the agent's own visible
tests do not expose. Define

```
invisible share = |{ runs : visible tests passed, hidden tests failed }| / |{ runs : hidden tests failed }|
```

These runs look, from inside the trajectory, exactly like successes. They are an upper bound on what any
watcher of the trajectory alone can achieve, and they must be quoted next to EW-AUC@k or the metric reads
as a model failure when it is a measurement ceiling. On `prerecorded_mock` the invisible share is **0.70**
— which is exactly the weak-tests distortion of exercise 5, seen from inside the run — and it explains why
the sentinel trained there reaches only 0.54 pooled AUC. On the imported real runs the agent's last test
result is simply **unknown** for 78% of the failures (8% known invisible, 14% known visible); say
"unknown", do not fold it into "visible".

## How to report it

1. **k ∈ {10, 15, 20}** for SWE-agent-length trajectories, and always with `n = |A(k)|` and the cohort's
   failure share. For short trajectories pick k where the cohort is still large (on the 5–7-step mock
   runs, k = 2, 3 — at k = 10 only ten runs survive and the number is noise).
2. **95% percentile CI from a bootstrap over runs** (not over prefixes: prefixes within a run are not
   independent). `sentinel_ext.py` resamples runs with a fixed seed, so the intervals are paired across
   models and two rows may be compared directly.
3. **The baselines on the same cohort**: the step index (0.5 by construction — state it), the rule layer
   alone, and the untrained prior. A sentinel that does not beat its own rules is a rule layer with extra
   steps.
4. **Recall / false alarm / median lead at a named τ**, because AUC does not commit to a decision.
5. **The oracle-invisible failure share** of the evaluation directory, as the ceiling.
6. **Whether the model was trained on this directory.** Replaying a model on its own training data is
   in-sample: on `real_swe_agent_500` the same model scores 0.65 / 0.81 / 0.86 in-sample against
   0.63 / 0.74 / 0.73 out-of-fold. The leaderboard marks such rows `in_sample`; prefer the cross-validated
   figure, and never compare an in-sample row with an out-of-fold one.

**A sentence for a paper.** *We report EW-AUC@k, the AUC of the sentinel's risk score among runs still
alive at step k; conditioning on survival removes the length confound that lets a scorer reading only the
step index reach 0.65 on pooled prefixes, and we give 95% percentile intervals from a bootstrap over runs
together with the oracle-invisible failure share, which upper-bounds what any trajectory-only watcher can
detect.*
