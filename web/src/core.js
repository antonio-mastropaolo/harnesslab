// ============================================================ state
let B = null, MODE = "static";
const S = { tab: "overview", results: new Set(), models: new Set(), harnesses: new Set(), tasks: new Set(), oracle: "hidden",
  sel: null, cmp: null, multi: new Set(), hl: null, hA: null, hB: null, expA: null, expB: null, expFA: "model", expFB: "harness_id",
  sortAttr: "ochiai", attrOpen: null, thr: { steps: 8, repeated: 0, lines: 20, files: 1, first_edit: 4 }, detail: {},
  trajTab: "list", trajOutcome: "", trajTask: "", trajSort: "run", listPage: 0, patK: 3, patCell: "", patTask: "",
  q: { name: "", re: "", steps_min: "", steps_max: "", cost_min: "", exit: "", boundary: "", tests_mod: "" }, qOpen: null, qSaved: [],
  jobsOpen: true, help: false, theme: "auto", seqTab: "sequences", preset: "" };
const TABS = [
  ["overview", "Overview", "Task", "1", "Runs"], ["board", "Board", "Task", "2", ""],
  ["harness", "Harness", "Harness", "3", "Harness"],
  ["traj", "Trajectories", "Trajectory", "4", "Trajectories"], ["patterns", "Patterns", "Trajectory", "5", ""], ["queries", "Queries", "Trajectory", "6", ""],
  ["dist", "Distribution", "Distribution", "7", "Statistics"], ["attr", "Attribution", "Trajectory", "8", ""], ["exp", "Experiment", "Inference", "9", ""],
  ["tele", "Telemetry", "Telemetry", "0", "Ledger"], ["integ", "Integrity", "Oracle", "-", ""], ["report", "Report card", "Inference", "=", ""]];
const STRIP = ["Task", "Oracle", "Harness", "Trajectory", "Distribution", "Telemetry", "Inference"];
const ORACLE_KEY = { visible: "visible_pass", hidden: "hidden_pass", strong: "strong_pass" };
const TOOL_CODE = { list_files: "L", read_file: "R", write_file: "W", edit_file: "E", run_tests: "T", bash: "B", submit: "S" };
const KIND_CODE = { view: "R", search: "F", edit: "E", run: "T", submit: "S", other: "B" };
const CODE_NAME = { L: "list_files", R: "read / view", F: "search", W: "write_file", E: "edit", T: "run tests", B: "bash / other", S: "submit" };
const SERIES = ["#E4572E", "#17A398", "#3B6FD9", "#F2A93B", "#8B5CF6", "#6B7280", "#D946EF", "#0EA5E9"];

// ============================================================ helpers
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => { if (!xs.length) return NaN; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (xs, q) => { if (!xs.length) return NaN; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const fmt = (x, d = 2) => (x == null || Number.isNaN(x)) ? "n/a" : (!Number.isFinite(x) ? "inf" : Number(x).toFixed(d));
const pct = (x, d = 0) => (x == null || Number.isNaN(x)) ? "n/a" : (100 * x).toFixed(d) + "%";
const usd = (x) => (x == null || Number.isNaN(x)) ? "n/a" : (!Number.isFinite(x) ? "inf" : (x === 0 ? "$0" : "$" + x.toFixed(x < 0.1 ? 4 : 2)));
const ints = (x) => (x == null || Number.isNaN(x)) ? "n/a" : (!Number.isFinite(x) ? "inf" : Math.round(x).toLocaleString());
const secs = (s) => s == null ? "" : (s < 60 ? s + "s" : Math.floor(s / 60) + "m" + String(s % 60).padStart(2, "0") + "s");
const uniq = (xs) => Array.from(new Set(xs));
const by = (xs, f) => { const m = new Map(); xs.forEach(x => { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; };
const oracleKey = () => ORACLE_KEY[S.oracle];
const hasOracle = (r, key) => r[key || oracleKey()] != null;
function outcome(r, key) { key = key || oracleKey(); if (r[key] == null) return r.exit_reason === "submitted" ? "UNGRADED" : "UNRESOLVED"; if (r[key]) return "PASS"; return r.exit_reason === "submitted" ? "FAIL" : "UNRESOLVED"; }
function filtered() {
  return B.runs.filter(r => (!S.results.size || S.results.has(r.results)) && (!S.models.size || S.models.has(r.model))
    && (!S.harnesses.size || S.harnesses.has(r.harness_id)) && (!S.tasks.size || S.tasks.has(r.task_id)));
}
const spansOf = (r) => (S.detail[r.key] && S.detail[r.key].spans) || B.trajectories[r.key] || [];
const featOf = (r) => B.features[r.key] || {};
const runByKey = (k) => B.runs.find(r => r.key === k);
const tokOf = (r) => (r.input_tokens || 0) + (r.output_tokens || 0);
const cellOf = (r) => `${r.model}|${r.harness_id}`;
const cellLabel = (r) => `${r.model} · ${r.harness_id}`;
const runShort = (r) => /^\d{8}-\d{6}-[0-9a-f]{6}$/.test(r.run_id) ? r.run_id.slice(-6) : (r.run_id.length > 18 ? "…" + r.run_id.slice(-14) : r.run_id);
function groupsOf(R) { return by(R, r => `${r.results}|${r.model}|${r.harness_id}`); }

// ============================================================ statistics (all in the browser)
function comb(n, k) { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
function passAtK(c, n, k) { if (n - c < k) return 1; return 1 - comb(n - c, k) / comb(n, k); }
function passPowK(c, n, k) { if (c < k) return 0; return comb(c, k) / comb(n, k); }
function wilson(c, n, z = 1.96) { if (!n) return [NaN, NaN]; const p = c / n, d = 1 + z * z / n, ctr = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, ctr - h), Math.min(1, ctr + h)]; }
function wald(c, n, z = 1.96) { if (!n) return [NaN, NaN]; const p = c / n, h = z * Math.sqrt(p * (1 - p) / n); return [p - h, p + h]; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function bootstrapCI(vals, Bn = 2000, seed = 7) { const n = vals.length; if (!n) return [NaN, NaN]; const r = rng(seed), boots = []; for (let b = 0; b < Bn; b++) { let s = 0; for (let i = 0; i < n; i++) s += vals[Math.floor(r() * n)]; boots.push(s / n); } boots.sort((a, b) => a - b); return [boots[Math.floor(0.025 * Bn)], boots[Math.floor(0.975 * Bn) - 1], boots]; }
function graded(runs, key) { key = key || oracleKey(); return runs.filter(r => r[key] != null); }
function taskTable(runs, key) { key = key || oracleKey(); const m = by(graded(runs, key), r => r.task_id), out = {}; Array.from(m.keys()).sort().forEach(t => { const o = m.get(t).map(r => !!r[key]); const n = o.length, c = o.filter(x => x).length; out[t] = { n, c, p: c / n }; }); return out; }
function aggregate(runs, key, ks = [1, 2, 3, 5]) { const tt = taskTable(runs, key), ts = Object.keys(tt); if (!ts.length) return null; const res = { pass1: mean(ts.map(t => tt[t].p)), n_tasks: ts.length, runs: runs.length, tt }; ks.forEach(k => { const a = ts.filter(t => tt[t].n >= k); if (a.length) { res["pass@" + k] = mean(a.map(t => passAtK(tt[t].c, tt[t].n, k))); res["pass^" + k] = mean(a.map(t => passPowK(tt[t].c, tt[t].n, k))); } }); return res; }
function passRate(runs, key) { key = key || oracleKey(); const g = graded(runs, key); return g.length ? g.filter(r => r[key]).length / g.length : NaN; }
function pairedBootstrap(runsA, runsB, key, Bn = 4000) { const ta = taskTable(runsA, key), tb = taskTable(runsB, key); const tasks = Object.keys(ta).filter(t => tb[t]); const diffs = tasks.map(t => tb[t].p - ta[t].p); if (!diffs.length) return { n: 0 }; const [lo, hi] = bootstrapCI(diffs, Bn, 11); return { n: tasks.length, mean: mean(diffs), lo, hi, per_task: Object.fromEntries(tasks.map((t, i) => [t, diffs[i]])) }; }
function flipRate(runs, key) { const tt = taskTable(runs, key); const ts = Object.keys(tt); return ts.length ? ts.filter(t => tt[t].c > 0 && tt[t].c < tt[t].n).length / ts.length : NaN; }
function tokensPerSolve(runs, key) { key = key || oracleKey(); const tot = sum(runs.map(tokOf)), s = runs.filter(r => r[key]).length; return s ? tot / s : Infinity; }
function costOfPass(runs, key) { key = key || oracleKey(); const g = graded(runs, key); if (!g.length) return NaN; const mc = mean(g.map(r => r.cost_usd || 0)), p = g.filter(r => r[key]).length / g.length; return p ? mc / p : Infinity; }
function verifiedRate(runs) { return mean(runs.map(r => featOf(r).ran_after_last_edit ? 1 : 0)); }
function boundaryAny(runs) { return mean(runs.map(r => r.boundary_events > 0 ? 1 : 0)); }
function exitMix(runs) { const m = by(runs, r => r.exit_reason); return Array.from(m.entries()).map(([k, v]) => [k, v.length / runs.length]).sort((a, b) => b[1] - a[1]); }
function latencyOf(r) { return sum(spansOf(r).filter(s => s.span === "chat").map(s => s.ms || 0)); }
function kappa(a, b) { const n = a.length; if (!n) return NaN; const po = a.filter((x, i) => x === b[i]).length / n; const labels = uniq(a.concat(b)); const pe = sum(labels.map(l => (a.filter(x => x === l).length / n) * (b.filter(x => x === l).length / n))); return pe === 1 ? 1 : (po - pe) / (1 - pe); }
function powerN(pA, pB, power = 0.8) { const za = 1.959964, zb = power === 0.8 ? 0.841621 : 1.281552; const d = pA - pB; if (!d) return Infinity; return Math.ceil(Math.pow(za + zb, 2) * (pA * (1 - pA) + pB * (1 - pB)) / (d * d)); }
function riskRatio(a, b, c, d) { // a: exposed fail, b: exposed pass, c: unexposed fail, d: unexposed pass
  const p1 = a / (a + b || 1), p0 = c / (c + d || 1); if (!p0 || !p1) return { rr: p0 ? p1 / p0 : NaN, lo: NaN, hi: NaN }; const rr = p1 / p0, se = Math.sqrt(1 / a - 1 / (a + b) + 1 / c - 1 / (c + d)); return { rr, lo: Math.exp(Math.log(rr) - 1.96 * se), hi: Math.exp(Math.log(rr) + 1.96 * se) }; }
function levenshtein(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1); for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; } return prev[n]; }
function factorial(runs, aKey, bKey, blockKey, key) {
  key = key || oracleKey(); runs = graded(runs, key);
  const ys = runs.map(r => r[key] ? 1 : 0), A = runs.map(r => r[aKey]), Bv = runs.map(r => r[bKey]), K = runs.map(r => r[blockKey]);
  const n = ys.length, mu = mean(ys);
  const meanBy = (keys) => { const acc = new Map(); keys.forEach((k, i) => { if (!acc.has(k)) acc.set(k, []); acc.get(k).push(ys[i]); }); const m = new Map(), cnt = new Map(); acc.forEach((v, k) => { m.set(k, mean(v)); cnt.set(k, v.length); }); return [m, cnt]; };
  const [ma, na] = meanBy(A), [mb, nb] = meanBy(Bv), [mk, nk] = meanBy(K), [mab, nab] = meanBy(A.map((a, i) => a + "|" + Bv[i])), [mabk] = meanBy(A.map((a, i) => a + "|" + Bv[i] + "|" + K[i]));
  const sq = (x) => x * x;
  const ssT = sum(ys.map(y => sq(y - mu)));
  const ssA = sum(Array.from(ma.entries()).map(([a, m]) => na.get(a) * sq(m - mu)));
  const ssB = sum(Array.from(mb.entries()).map(([b, m]) => nb.get(b) * sq(m - mu)));
  const ssAB = sum(Array.from(mab.entries()).map(([ab, m]) => { const [a, b] = ab.split("|"); return nab.get(ab) * sq(m - ma.get(a) - mb.get(b) + mu); }));
  const ssK = sum(Array.from(mk.entries()).map(([k, m]) => nk.get(k) * sq(m - mu)));
  const ssW = sum(ys.map((y, i) => sq(y - mabk.get(A[i] + "|" + Bv[i] + "|" + K[i]))));
  const ssCxT = Math.max(0, ssT - ssA - ssB - ssAB - ssK - ssW);
  const dfA = ma.size - 1, dfB = mb.size - 1, dfAB = dfA * dfB, dfK = mk.size - 1, dfW = n - mabk.size, dfC = Math.max((mabk.size - 1) - dfA - dfB - dfAB - dfK, 1);
  const msW = dfW ? ssW / dfW : NaN;
  const rows = [[aKey + " (A)", ssA, dfA], [bKey + " (B)", ssB, dfB], ["A × B", ssAB, dfAB], ["task (block)", ssK, dfK], ["cell × task", ssCxT, dfC], ["residual (repeats)", ssW, dfW]].map(([term, ss, df]) => { const ms = df ? ss / df : NaN; return { term, ss, df, ms, F: term.startsWith("residual") ? NaN : ms / msW, share: ssT ? ss / ssT : NaN }; });
  return { n, mu, ma, mb, mab, rows, ssT };
}
// Monte-Carlo: with k repeats per task, how often does the arm with the lower true mean come out ahead?
function wrongWinner(pA, pB, k, sims = 2000, seed = 3) { const r = rng(seed); let wrong = 0, ties = 0; const better = mean(pA) >= mean(pB) ? "A" : "B"; for (let s = 0; s < sims; s++) { let a = 0, b = 0; for (let t = 0; t < pA.length; t++) for (let j = 0; j < k; j++) { if (r() < pA[t]) a++; if (r() < pB[t]) b++; } if (a === b) ties++; else if ((a > b ? "A" : "B") !== better) wrong++; } return { wrong: wrong / sims, ties: ties / sims }; }

// ============================================================ trajectory predicates (evaluated on the ledger spans)
const toolSpans = (spans) => spans.filter(s => s.span === "execute_tool");
const isEditSpan = (s) => s.tool === "write_file" || s.tool === "edit_file" || s.kind === "edit";
const isTestSpan = (s) => s.tool === "run_tests" || s.kind === "run" || (s.tool === "bash" && /unittest|pytest/.test((s.args && s.args.command) || ""));
const isReadSpan = (s) => s.tool === "read_file" || s.kind === "view";
const codeOf = (s) => s.kind ? (KIND_CODE[s.kind] || "?") : (TOOL_CODE[s.tool] || "?");
function predicates(spans) {
  const tools = toolSpans(spans);
  const editIdx = tools.map((s, i) => isEditSpan(s) ? i : -1).filter(i => i >= 0);
  const lastEdit = editIdx.length ? editIdx[editIdx.length - 1] : -1;
  const verifyAfter = lastEdit >= 0 ? tools.slice(lastEdit + 1).some(isTestSpan) : null;
  const untested = editIdx.filter(i => !tools.slice(i + 1).some(isTestSpan));
  const testEdit = tools.find(s => isEditSpan(s) && /(^|\/)tests?\//.test((s.args && (s.args.path || s.args.command)) || ""));
  const boundary = spans.filter(s => s.span === "boundary_event");
  const blocked = boundary.filter(b => b.status === "blocked"), allowed = boundary.filter(b => b.status === "allowed");
  const submitted = tools.some(s => s.tool === "submit" || s.kind === "submit");
  const seen = new Set(); let unread = null;
  for (const s of tools) { if (isReadSpan(s)) seen.add(s.args.path || "?"); else if (isEditSpan(s) && s.args.path && !seen.has(s.args.path)) { unread = s; break; } }
  let sig = new Set(), rep = null, repCount = 0;
  for (const s of tools) { if (isEditSpan(s)) sig = new Set(); const k = s.tool + JSON.stringify(s.args || {}); if (sig.has(k)) { repCount++; rep = rep || s; } sig.add(k); }
  const noTests = !tools.some(isTestSpan);
  const imported = tools.some(s => s.kind);
  return [
    { id: "P_verify", label: "Verified after last edit", formula: "∃ t > t_last-edit : a_t = run_tests", ok: verifyAfter, at: lastEdit >= 0 ? tools[lastEdit].seq : null, note: lastEdit < 0 ? "no edit in this run" : (verifyAfter ? "" : "the last edit was never tested") },
    { id: "G(edit ⇒ F test)", label: "Every edit eventually tested", formula: "G(edit ⇒ F test)", ok: editIdx.length ? untested.length === 0 : null, at: untested.length ? tools[untested[0]].seq : null, note: untested.length ? untested.length + " edit(s) never followed by a test" : "" },
    { id: "P_scope", label: "Never edited a test file", formula: "∀ t : path(a_t) ∉ tests/", ok: !testEdit, at: testEdit ? testEdit.seq : null, note: testEdit ? "edited " + (testEdit.args.path || testEdit.args.command) : "" },
    { id: "G ¬blocked", label: "No blocked action", formula: "G ¬(policy = blocked)", ok: imported ? null : blocked.length === 0, at: blocked.length ? blocked[0].seq : null, note: imported ? "no policy on imported runs" : (blocked.length ? blocked.length + " blocked: " + uniq(blocked.map(b => b.kind)).join(", ") : "") },
    { id: "G ¬destructive", label: "No boundary event executed", formula: "G ¬(policy = allowed-through)", ok: imported ? null : allowed.length === 0, at: allowed.length ? allowed[0].seq : null, note: imported ? "" : (allowed.length ? allowed.length + " executed under a permissive policy: " + uniq(allowed.map(b => b.kind)).join(", ") : "") },
    { id: "F submit", label: "Eventually submitted", formula: "F submit", ok: submitted, at: null, note: submitted ? "" : "run ended by the harness, not by the agent" },
    { id: "read ≺ write", label: "Read before write", formula: "∀ write(f) : ∃ read(f) before it", ok: imported ? null : !unread, at: unread ? unread.seq : null, note: imported ? "paths not recoverable from the command language" : (unread ? "wrote " + unread.args.path + " without reading it" : "") },
    { id: "¬loop", label: "No identical call repeated on an unchanged state", formula: "¬∃ i<j : a_i = a_j ∧ no edit in (i, j)", ok: repCount === 0, at: rep ? rep.seq : null, note: repCount ? repCount + " exact repeat(s) with no edit in between" : "" },
    { id: "ran_tests", label: "Ran the tests at all", formula: "∃ t : a_t = run_tests", ok: !noTests, at: null, note: noTests ? "no test execution in the whole run" : "" },
  ];
}
function seqOf(r) { return (featOf(r).sequence) || toolSpans(spansOf(r)).map(codeOf).join(""); }

// ============================================================ binary features for attribution
function featureDefs() {
  const t = S.thr;
  return [
    ["never_verified_after_edit", "never verified after last edit", f => f.n_edit > 0 && !f.ran_after_last_edit],
    ["no_test_run", "no test run at all", f => f.n_test === 0 && f.n_bash === 0],
    ["did_not_submit", "did not submit", f => !f.submitted],
    ["no_read_before_write", "wrote a file it never read", f => !f.read_before_write],
    ["edited_tests", "edited a test file", f => !!f.tests_modified],
    ["boundary_event", "≥1 boundary event", f => f.boundary_events > 0],
    [`repeated>${t.repeated}`, `identical calls repeated on an unchanged state > ${t.repeated}`, f => (f.repeated_no_edit != null ? f.repeated_no_edit : f.repeated) > t.repeated],
    [`steps>${t.steps}`, `steps > ${t.steps}`, f => f.steps > t.steps],
    [`lines_edited>${t.lines}`, `patch > ${t.lines} lines`, f => f.lines_edited > t.lines],
    [`files>${t.files}`, `files edited > ${t.files}`, f => f.files_edited > t.files],
    [`late_first_edit>${t.first_edit}`, `first edit after step ${t.first_edit}`, f => f.first_edit_step > t.first_edit],
    ["no_edit_at_all", "no edit at all", f => f.n_edit === 0],
    ["exit_budget", "ended by step, token or context budget", f => ["max_steps", "budget_exceeded", "exit_context", "exit_cost"].includes(f.exit_reason)],
  ];
}
function attribution(runs, key) {
  key = key || oracleKey(); runs = graded(runs, key);
  const defs = featureDefs(); const fails = runs.map(r => !r[key]); const F = fails.filter(x => x).length, P = runs.length - F;
  return defs.map(([id, label, fn]) => { let ef = 0, ep = 0; const carriers = []; runs.forEach((r, i) => { if (fn(featOf(r))) { carriers.push(r); if (fails[i]) ef++; else ep++; } });
    const ochiai = (F && ef + ep) ? ef / Math.sqrt(F * (ef + ep)) : 0; const rf = F ? ef / F : 0, rp = P ? ep / P : 0; const tar = (rf + rp) ? rf / (rf + rp) : 0;
    return { id, label, ef, ep, rf: F ? ef / F : NaN, rp: P ? ep / P : NaN, ochiai, tarantula: tar, carriers }; });
}
function predicateStats(runs, matchFn, key) {
  key = key || oracleKey(); runs = graded(runs, key);
  let a = 0, b = 0, c = 0, d = 0; const matches = [];
  runs.forEach(r => { const m = matchFn(r); const fail = !r[key]; if (m) { matches.push(r); if (fail) a++; else b++; } else { if (fail) c++; else d++; } });
  const F = a + c; const ochiai = (F && a + b) ? a / Math.sqrt(F * (a + b)) : 0;
  return { matches, a, b, c, d, n: runs.length, passIn: (a + b) ? b / (a + b) : NaN, passOut: (c + d) ? d / (c + d) : NaN, ochiai, rr: riskRatio(a, b, c, d) };
}

// ============================================================ sequences: clustering, transitions, divergence
function clusterSequences(seqs, k) { // average-linkage agglomerative on edit distance; returns array of index arrays
  const n = seqs.length; if (!n) return []; const D = Array.from({ length: n }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = levenshtein(seqs[i], seqs[j]); D[i][j] = d; D[j][i] = d; }
  let clusters = Array.from({ length: n }, (_, i) => [i]);
  const dist = (A, Bc) => { let s = 0; for (const i of A) for (const j of Bc) s += D[i][j]; return s / (A.length * Bc.length); };
  while (clusters.length > k) { let best = [0, 1, Infinity]; for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) { const d = dist(clusters[i], clusters[j]); if (d < best[2]) best = [i, j, d]; } const [i, j] = best; clusters[i] = clusters[i].concat(clusters[j]); clusters.splice(j, 1); }
  return clusters.map(c => { let med = c[0], bestS = Infinity; for (const i of c) { const s = sum(c.map(j => D[i][j])); if (s < bestS) { bestS = s; med = i; } } return { members: c, medoid: med, D }; });
}
function transitions(seqs) { const M = {}; const alpha = "LRFWETBS"; alpha.split("").forEach(a => { M[a] = {}; alpha.split("").forEach(b => M[a][b] = 0); }); seqs.forEach(s => { for (let i = 0; i + 1 < s.length; i++) if (M[s[i]] && M[s[i]][s[i + 1]] != null) M[s[i]][s[i + 1]]++; }); return M; }
function commonPrefix(seqs) { if (!seqs.length) return ""; let p = seqs[0]; for (const s of seqs) { let i = 0; while (i < p.length && i < s.length && p[i] === s[i]) i++; p = p.slice(0, i); if (!p) break; } return p; }

// ============================================================ line diff (LCS) for edits
function lineDiff(a, b) { const A = a.split("\n"), Bl = b.split("\n"); const n = A.length, m = Bl.length; if (n * m > 4e6) return null; const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1)); for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === Bl[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); const out = []; let i = 0, j = 0; while (i < n && j < m) { if (A[i] === Bl[j]) { out.push(["ctx", A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { out.push(["del", A[i]]); i++; } else { out.push(["add", Bl[j]]); j++; } } while (i < n) out.push(["del", A[i++]]); while (j < m) out.push(["add", Bl[j++]]); return out; }
function diffHtml(pairs, ctx = 2) { if (!pairs) return `<div class="small">file too large to diff</div>`; const keep = new Set(); pairs.forEach((p, i) => { if (p[0] !== "ctx") for (let k = -ctx; k <= ctx; k++) keep.add(i + k); }); let h = "", gap = false; pairs.forEach((p, i) => { if (!keep.has(i)) { gap = true; return; } if (gap) { h += `<span class="ctx">   …</span>\n`; gap = false; } h += `<span class="${p[0]}">${p[0] === "add" ? "+" : p[0] === "del" ? "-" : " "} ${esc(p[1])}</span>\n`; }); return `<div class="diff">${h || '<span class="ctx">(identical)</span>'}</div>`; }

// ============================================================ url state + storage
const SETS = ["results", "models", "harnesses", "tasks"];
function stateToHash() { const p = new URLSearchParams(); p.set("tab", S.tab); SETS.forEach(k => { if (S[k].size) p.set(k, Array.from(S[k]).join(",")); }); if (S.oracle !== "hidden") p.set("oracle", S.oracle); if (S.sel) p.set("run", S.sel); if (S.cmp) p.set("cmp", S.cmp); if (S.trajTab !== "list") p.set("tt", S.trajTab); if (S.expA) p.set("A", S.expA); if (S.expB) p.set("B", S.expB); if (S.hA) p.set("hA", S.hA); if (S.hB) p.set("hB", S.hB); return "#" + p.toString(); }
function hashToState() { const h = location.hash.slice(1); if (!h) return; const p = new URLSearchParams(h); if (p.get("tab") && TABS.some(t => t[0] === p.get("tab"))) S.tab = p.get("tab"); SETS.forEach(k => { if (p.get(k)) S[k] = new Set(p.get(k).split(",")); }); if (p.get("oracle") && ORACLE_KEY[p.get("oracle")]) S.oracle = p.get("oracle"); if (p.get("run")) S.sel = p.get("run"); if (p.get("cmp")) S.cmp = p.get("cmp"); if (p.get("tt")) S.trajTab = p.get("tt"); if (p.get("A")) S.expA = p.get("A"); if (p.get("B")) S.expB = p.get("B"); if (p.get("hA")) S.hA = p.get("hA"); if (p.get("hB")) S.hB = p.get("hB"); }
function syncHash() { try { history.replaceState(null, "", stateToHash()); } catch (e) { } }
function store(k, v) { try { localStorage.setItem("agentlab." + k, JSON.stringify(v)); } catch (e) { } }
function load(k, d) { try { const v = localStorage.getItem("agentlab." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
