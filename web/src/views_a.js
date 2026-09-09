// ============================================================ shared fragments
function tile(v, l, s, act) { return `<div class="tile ${act ? "click" : ""}" ${act ? `data-act="tab" data-v="${act}"` : ""}><div class="v">${v}</div><div class="l">${esc(l)}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`; }
function outBadge(o) { return `<span class="out ${o}">${o}</span>`; }
function predBadges(r) { const ps = predicates(spansOf(r)); const bad = ps.filter(p => p.ok === false); return bad.length ? bad.map(p => `<span class="badge bad" title="${esc(p.note)}">${esc(p.id)}</span>`).join("") : `<span class="badge ok">all predicates hold</span>`; }
function empty(msg) { return `<div class="callout">${esc(msg || "No runs match the current filter.")}</div>`; }
function harnessIds(R) { return uniq(R.map(r => r.harness_id)).concat(Object.keys(B.harnesses).filter(h => !R.some(r => r.harness_id === h))); }
function ciText(lo, hi, d = 2) { return `[${fmt(lo, d)}, ${fmt(hi, d)}]`; }
function okBadge(ok) { return ok === null ? '<span class="badge na">n/a</span>' : (ok ? '<span class="badge ok">yes</span>' : '<span class="badge bad">no</span>'); }

// ============================================================ 0. Overview
function findings(R, key) {
  const out = [];
  const tt = taskTable(R, key), tasks = Object.keys(tt); if (!tasks.length) return out;
  const agg = aggregate(R, key);
  const mixed = tasks.filter(t => tt[t].c > 0 && tt[t].c < tt[t].n).length;
  out.push({ ic: "1", color: "var(--signal)", t: `${mixed} of ${tasks.length} tasks have mixed outcomes; pass@1 ${pct(agg.pass1, 1)} but pass^3 ${agg["pass^3"] != null ? pct(agg["pass^3"], 1) : "n/a"}.`, d: "Same cell, different verdicts. One run is one draw; a user experiences pass^k, a leaderboard reports pass@1.", tab: "dist" });
  // harness effect: largest paired delta within one model
  const models = uniq(R.map(r => r.model)); let best = null;
  models.forEach(m => { const hs = uniq(R.filter(r => r.model === m).map(r => r.harness_id)); for (let i = 0; i < hs.length; i++) for (let j = 0; j < hs.length; j++) { if (i === j) continue; const a = R.filter(r => r.model === m && r.harness_id === hs[i]), b = R.filter(r => r.model === m && r.harness_id === hs[j]); const pb = pairedBootstrap(a, b, key); if (pb.n && (!best || Math.abs(pb.mean) > Math.abs(best.pb.mean))) best = { m, a: hs[i], b: hs[j], pb, tps: tokensPerSolve(b, key) / tokensPerSolve(a, key), ver: verifiedRate(b) - verifiedRate(a) }; } });
  if (best) out.push({ ic: "2", color: "var(--amber)", t: `Largest harness effect: ${best.b} vs ${best.a} on ${best.m}, Δ pass rate ${(best.pb.mean >= 0 ? "+" : "") + pct(best.pb.mean, 1)} with 95% ${ciText(best.pb.lo, best.pb.hi)}${best.pb.lo <= 0 && best.pb.hi >= 0 ? " (covers zero)" : ""}.`, d: `Tokens per solve ${fmt(best.tps, 2)}×, verified-after-edit ${(best.ver >= 0 ? "+" : "") + pct(best.ver, 0)} points. The efficiency and conduct columns moved; the pass column may not have.`, tab: "harness" });
  // oracle
  const withVis = R.filter(r => r.visible_pass != null && r.hidden_pass != null); if (withVis.length) { const over = withVis.filter(r => r.visible_pass && !r.hidden_pass).length / withVis.length; const withStrong = R.filter(r => r.hidden_pass != null && r.strong_pass != null); const lost = withStrong.length ? withStrong.filter(r => r.hidden_pass && !r.strong_pass).length / withStrong.length : NaN; out.push({ ic: "3", color: "var(--teal)", t: `${pct(over, 1)} of runs pass the agent's own tests and fail the oracle${Number.isFinite(lost) ? `; ${pct(lost, 1)} pass the oracle and fail the strengthened suite` : ""}.`, d: "Self-report is not the verdict, and the verdict depends on the oracle. Switch the oracle chip to watch the ranking move.", tab: "integ" }); }
  // attribution
  const at = attribution(R, key).sort((a, b) => b.ochiai - a.ochiai)[0]; if (at) out.push({ ic: "4", color: "var(--purple)", t: `Top failure feature: ${at.id} (Ochiai ${fmt(at.ochiai, 2)}), in ${pct(at.rf)} of failures and ${pct(at.rp)} of successes.`, d: "Read both rate columns before calling it a cause; write it as a query and test it as a predicate.", tab: "attr" });
  // cost
  const cells = Array.from(groupsOf(R).entries()).map(([k, rs]) => ({ k: k.split("|").slice(1).join(" · "), p: passRate(rs, key), cop: costOfPass(rs, key) })).filter(c => Number.isFinite(c.cop)); if (cells.length > 1) { const cheapest = cells.slice().sort((a, b) => a.cop - b.cop)[0], bestp = cells.slice().sort((a, b) => b.p - a.p)[0]; out.push({ ic: "5", color: "var(--blue)", t: `Cheapest correct answer: ${cheapest.k} at ${usd(cheapest.cop)} per pass; highest pass rate: ${bestp.k} at ${pct(bestp.p, 0)}${cheapest.k === bestp.k ? " (same cell)" : ` for ${usd(bestp.cop)} per pass`}.`, d: "Accuracy without cost is half a result. The Pareto chart shows which cells are dominated.", tab: "tele" }); }
  return out;
}
function vOverview() {
  const R = filtered(), key = oracleKey();
  let h = `<h2>Overview</h2><p class="claim">Every cell (model × harness) as a distribution, not a number. The findings are written from the data in the current filter; each one links to the view that shows the evidence.</p>`;
  if (!R.length) return h + empty() + (MODE === "server" ? `<p class="small">Launch a batch from the Board, or copy a results directory under data/runs.</p>` : "");
  const agg = aggregate(R, key), tt = agg ? agg.tt : {}, tasks = Object.keys(tt); const ci = bootstrapCI(tasks.map(t => tt[t].p));
  const spend = sum(R.map(r => r.cost_usd || 0));
  h += `<div class="tiles">${tile(R.length, "runs", `${uniq(R.map(r => r.model)).length} models · ${uniq(R.map(r => r.harness_id)).length} harnesses · ${tasks.length} tasks · ${uniq(R.map(r => r.results)).length} results dirs`, "board")}
    ${tile(pct(agg ? agg.pass1 : NaN, 1), "pass@1, mean over tasks", "task-bootstrap 95% " + ciText(ci[0], ci[1]), "dist")}
    ${tile(agg && agg["pass^3"] != null ? pct(agg["pass^3"], 1) : "n/a", "pass^3", agg && agg["pass@3"] != null ? "pass@3 " + pct(agg["pass@3"], 1) : "", "dist")}
    ${tile(pct(flipRate(R, key)), "tasks with mixed outcomes", "", "dist")}
    ${tile(pct(verifiedRate(R)), "verified after last edit", "P_verify", "traj")}
    ${tile(usd(spend), "total spend in filter", usd(mean(R.map(r => r.cost_usd || 0))) + " per run", "tele")}
    ${MODE === "server" ? tile(B.running.length + (B.jobs.filter(j => j.status === "running").length ? "" : ""), "runs in flight", B.jobs.filter(j => j.status === "running").length + " jobs running", "board") : tile("static", "export", "open with the server to launch runs", "board")}</div>`;
  const F = findings(R, key);
  h += `<div class="row"><div class="col" style="flex:1 1 520px"><div class="card plain" style="padding:0">${F.map(f => `<div class="finding"><span class="ic" style="background:${f.color}">${f.ic}</span><div><div class="t">${esc(f.t)}</div><div class="d">${esc(f.d)}</div></div><button class="btn small sec" data-act="tab" data-v="${f.tab}">open</button></div>`).join("") || '<div class="empty">no findings yet</div>'}</div></div>`;
  const cells = Array.from(groupsOf(R).entries()).map(([k, rs], i) => ({ key: k, label: k.split("|").slice(1).join(" · "), x: costOfPass(rs, key), y: passRate(rs, key), n: graded(rs, key).length, color: SERIES[i % SERIES.length] }));
  const pts = cells.filter(c => Number.isFinite(c.x) && Number.isFinite(c.y)).map(c => { const w = wilson(Math.round(c.y * c.n), c.n); return { ...c, err: w, title: `${c.label}: pass ${pct(c.y, 1)} · cost of pass ${usd(c.x)} · n=${c.n}`, act: "cellsel" }; });
  h += `<div class="col" style="flex:1 1 480px"><h4>Cost of pass vs pass rate, one point per cell ${pts.length > 1 ? '<span class="small">(dashed: the Pareto frontier)</span>' : ""}</h4>${svgScatter(pts, { xlog: true, xlabel: "cost of pass (USD, log)", ylabel: "pass rate", ymax: 1, frontier: true, xfmt: x => usd(x), yfmt: y => pct(y) })}</div></div>`;
  h += `<h3><span class="n">≡</span> Cells</h3><div class="tbl"><table><tr><th>results · model · harness</th><th class="num">runs</th><th class="num">pass@1</th><th class="num">Wilson 95%</th><th class="num">pass^3</th><th class="num">flip</th><th class="num">verified</th><th class="num">boundary</th><th class="num">tok/solve</th><th class="num">cost of pass</th><th>by repeat</th><th>outcomes</th></tr>`;
  Array.from(groupsOf(R).entries()).forEach(([k, rs]) => { const g = graded(rs, key); const c = g.filter(r => r[key]).length; const w = wilson(c, g.length); const a = aggregate(rs, key); const byRep = Array.from(by(g, r => r.repeat_index).entries()).sort((x, y) => x[0] - y[0]).map(([, v]) => passRate(v, key)); const rsSorted = rs.slice().sort((x, y) => x.task_id.localeCompare(y.task_id) || x.repeat_index - y.repeat_index);
    h += `<tr class="click" data-act="cellsel" data-key="${esc(k)}"><td><b>${esc(k.split("|").slice(1).join(" · "))}</b><div class="small">${esc(k.split("|")[0])}</div></td><td class="num">${rs.length}</td><td class="num">${pct(a ? a.pass1 : NaN, 1)}</td><td class="num">${ciText(w[0], w[1])}</td><td class="num">${a && a["pass^3"] != null ? pct(a["pass^3"]) : "n/a"}</td><td class="num">${pct(flipRate(rs, key))}</td><td class="num">${pct(verifiedRate(rs))}</td><td class="num">${pct(boundaryAny(rs))}</td><td class="num">${ints(tokensPerSolve(rs, key))}</td><td class="num">${usd(costOfPass(rs, key))}</td><td>${svgSpark(byRep, { max: 1 })}</td><td>${barcode(rsSorted.slice(0, 80), key)}</td></tr>`; });
  h += `</table></div><p class="small">"by repeat": pass rate at repeat index 0, 1, 2, … (a drift check; flat is good). "outcomes": one bar per run, tasks in order.</p>`;
  return h;
}

// ============================================================ 1. Board
function vBoard() {
  const R = filtered(), key = oracleKey();
  let h = `<h2>Runs board</h2><p class="claim">One cell = one run = one draw from the distribution the cell (model, harness, task, oracle) defines. Switch the oracle above and watch the colours change: the runs did not change, the verdict did. Click a cell to open the run; shift-click to add it to a multi-run comparison.</p>`;
  if (!R.length && !B.running.length) return h + empty() + vLaunch();
  h += `<div class="legend"><span><i style="background:var(--pass)"></i>PASS (oracle true)</span><span><i style="background:var(--fail)"></i>FAIL (submitted, oracle false)</span><span><i style="background:var(--unres)"></i>UNRESOLVED (ended by the harness) or ungraded</span><span><i style="background:var(--amber)"></i>running</span>${S.multi.size ? `<span><b>${S.multi.size} selected</b> · <button class="btn small" data-act="multiOpen">compare selected</button> <button class="btn small sec" data-act="multiClear">clear</button></span>` : ""}</div>`;
  const groups = groupsOf(R);
  const runningBy = by(B.running.filter(x => (!S.results.size || S.results.has(x.results))), x => `${x.results}|${x.model}|${x.harness_id}`);
  const allKeys = uniq(Array.from(groups.keys()).concat(Array.from(runningBy.keys())));
  h += `<div class="row">`;
  allKeys.forEach(gk => {
    const rs = groups.get(gk) || [], live = runningBy.get(gk) || []; const [res, model, hid] = gk.split("|");
    const taskIds = uniq(rs.map(r => r.task_id).concat(live.map(x => x.task_id))).sort();
    const nrep = Math.max(1, ...rs.map(r => r.repeat_index + 1), ...taskIds.map(t => live.filter(x => x.task_id === t).length + rs.filter(r => r.task_id === t).length));
    const a = aggregate(rs, key);
    h += `<div class="col" style="flex:0 1 auto"><div class="card"><h4>${esc(model)} <span class="small">×</span> ${esc(hid)} <span class="small">· ${esc(res)} · ${rs.length} runs${a ? " · pass@1 " + pct(a.pass1, 0) : ""}${live.length ? ` · <span style="color:var(--amber)">${live.length} running</span>` : ""}</span></h4><table class="grid"><tr><td></td>${Array.from({ length: Math.min(nrep, 40) }, (_, i) => `<td class="small" style="text-align:center">${i}</td>`).join("")}</tr>`;
    taskIds.slice(0, 60).forEach(t => {
      const row = rs.filter(r => r.task_id === t).sort((x, y) => x.repeat_index - y.repeat_index);
      const lv = live.filter(x => x.task_id === t);
      h += `<tr><td class="small" style="padding-right:8px;white-space:nowrap">${esc(t.length > 26 ? t.slice(0, 24) + "…" : t)}</td>`;
      const uniqRep = uniq(row.map(x => x.repeat_index)).length === row.length;
      for (let i = 0; i < Math.min(nrep, 40); i++) { const r = uniqRep ? (row.find(x => x.repeat_index === i) || null) : (row[i] || null); if (r) { const o = outcome(r, key); h += `<td><span class="cell ${o}${S.sel === r.key ? " sel" : ""}${S.multi.has(r.key) ? " multi" : ""}" data-act="sel" data-key="${esc(r.key)}" title="${esc(r.run_id)} · ${o} · ${r.steps} steps · ${ints(tokOf(r))} tokens · ${usd(r.cost_usd)} · exit ${r.exit_reason}"></span></td>`; } else if (lv.length && i >= row.length && i < row.length + lv.length) { const x = lv[i - row.length]; h += `<td><span class="cell RUN" title="running · step ${x.steps} · last tool ${x.last_tool || "?"}"></span></td>`; } else h += `<td><span class="cell" style="background:var(--card2);cursor:default"></span></td>`; }
      h += `</tr>`;
    });
    h += `</table>${taskIds.length > 60 ? `<div class="small">first 60 of ${taskIds.length} tasks; narrow the filter</div>` : ""}</div></div>`;
  });
  h += `</div>`;
  h += vLaunch();
  return h;
}
const PRESETS = {
  "": { label: "custom" },
  smoke: { label: "smoke test (mock, 1 task)", provider: "mock", model: "mock", harness: "harnesses/baseline.json", tasks: "t01_slugify", repeats: 2, out: "data/runs/smoke" },
  ex1: { label: "ex 1 · variance (mock, 8 tasks × 10)", provider: "mock", model: "mock", harness: "harnesses/baseline.json", tasks: "all", repeats: 10, out: "data/runs/ex1" },
  ex2: { label: "ex 2 · harness differential (mock, 6 harnesses)", provider: "mock", model: "mock", harness: "harnesses/baseline.json,harnesses/no_test_tool.json,harnesses/permissive.json,harnesses/short_context.json,harnesses/tight_budget.json,harnesses/terse_prompt.json", tasks: "all", repeats: 5, out: "data/runs/ex2" },
  live: { label: "live · 2 harnesses × 5 tasks × 4 (OpenRouter)", provider: "openrouter", model: "anthropic/claude-sonnet-5", harness: "harnesses/baseline.json,harnesses/no_test_tool.json", tasks: "t01_slugify,t03_ratelimit,t06_injected_config,t07_cache_cleanup,t08_ambiguous_handler", repeats: 4, out: "data/runs/live" },
  ex8: { label: "ex 8 · third model level (OpenRouter, 2 harnesses × 8 × 3)", provider: "openrouter", model: "openai/gpt-5.6-sol", harness: "harnesses/baseline.json,harnesses/no_test_tool.json", tasks: "all", repeats: 3, out: "data/runs/live_ex8" },
};
function launchEstimate(spec) {
  const nH = (spec.harness || "").split(",").filter(Boolean).length || 1; const nT = spec.tasks === "all" ? Object.keys(B.tasks).length : (spec.tasks || "").split(",").filter(Boolean).length; const n = nH * nT * Number(spec.repeats || 1);
  if (spec.provider === "mock") return { n, cost: 0, note: "mock: no API calls" };
  const m = (spec.model || "").toLowerCase(); const keys = Object.keys(B.prices || {}).sort((a, b) => b.length - a.length); const k = keys.find(x => m.includes(x)); const [pi, po] = k ? B.prices[k] : [2, 10];
  const per = 40000 / 1e6 * pi + 3000 / 1e6 * po; return { n, cost: n * per, note: `${k ? k : "unknown model, mid-tier guess"} at $${pi}/$${po} per M; planning assumption 40k in + 3k out tokens per run` };
}
function vLaunch() {
  let h = "";
  if (B.jobs && B.jobs.length) {
    h += `<h3><span class="n">⟳</span> Jobs launched from the console <button class="btn small sec" data-act="jobsToggle">${S.jobsOpen ? "hide" : "show"}</button></h3>`;
    if (S.jobsOpen) { h += `<div class="tbl"><table><tr><th>id</th><th>started</th><th>status</th><th>progress</th><th class="num">spent</th><th class="num">projected</th><th class="num">eta</th><th>command</th><th>last line</th><th></th></tr>`;
      B.jobs.slice().reverse().forEach(j => { const frac = j.total ? j.done / j.total : 0; const last = (j.tail || "").trim().split("\n").slice(-1)[0] || ""; h += `<tr><td>${esc(j.id)}</td><td>${esc(j.started)}</td><td>${j.status === "running" ? '<span class="badge warn">running</span>' : (j.status === "done" ? '<span class="badge ok">done</span>' : `<span class="badge bad">${esc(j.status)}</span>`)}</td><td><div class="progress ${j.status === "running" ? "run" : ""}"><i style="width:${(frac * 100).toFixed(0)}%"></i></div><div class="small">${j.done}/${j.total || "?"}</div></td><td class="num">${usd(j.spent)}</td><td class="num">${j.projected != null ? usd(j.projected) : ""}</td><td class="num">${j.eta_s != null ? secs(j.eta_s) : ""}</td><td class="mono small" style="max-width:360px;word-break:break-all">${esc(j.cmd)}</td><td class="mono small" style="max-width:300px">${esc(last.slice(0, 120))}</td><td>${j.status === "running" ? `<button class="btn small danger" data-act="cancel" data-id="${esc(j.id)}">cancel</button>` : ""}</td></tr>`; });
      h += `</table></div>`; }
  }
  if (MODE !== "server") return h + `<p class="small" style="margin-top:18px">This is a static export. Start <code>python -m harnesslab.core.serve</code> in the lab folder to launch runs from here and watch them land.</p>`;
  const hs = Object.values(B.harnesses).map(x => x._file ? x._file : null).filter(Boolean);
  const p = PRESETS[S.preset] || {};
  const spec = { provider: p.provider || "mock", model: p.model || "mock", harness: p.harness || (hs[0] || "harnesses/baseline.json"), tasks: p.tasks || "all", repeats: p.repeats || 3, out: p.out || "data/runs/live" };
  const est = launchEstimate(spec);
  h += `<h3><span class="n">+</span> Launch runs</h3><div class="card"><div class="form">
    <label>preset<select data-act="preset">${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${S.preset === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select></label>
    <label>provider<select id="l_provider">${["mock", "openrouter", "anthropic", "openai"].map(x => `<option ${spec.provider === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
    <label>model<input id="l_model" value="${esc(spec.model)}" placeholder="anthropic/claude-sonnet-5 (openrouter) / mock-weak"></label>
    <label>harness file(s)<input id="l_harness" value="${esc(spec.harness)}" list="hlist"><datalist id="hlist">${hs.map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>
    <label>tasks<input id="l_tasks" value="${esc(spec.tasks)}" placeholder="all or t01_slugify,t03_ratelimit"></label>
    <label>repeats<input id="l_repeats" type="number" value="${spec.repeats}" min="1" max="50"></label>
    <label>seed<input id="l_seed" type="number" value="0"></label>
    <label>output dir<input id="l_out" value="${esc(spec.out)}"></label>
    <label>base url (optional)<input id="l_base" placeholder="OpenRouter / Ollama endpoint"></label>
    <button class="btn" data-act="launch">Launch</button></div>
    <div class="small" style="margin:8px 0 0" id="launch_est">${est.n} runs · planning estimate ${est.cost ? usd(est.cost) : "$0"} (${esc(est.note)}). The key is read from the terminal that started the server (OPENROUTER_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY). Several harness files separated by commas run one after another into the same output directory, so one board shows all cells.</div><div id="launch_msg" class="small"></div></div>`;
  return h;
}

// ============================================================ 2. Harness
const HFIELDS = [["P", "system_prompt", "prompt and task presentation"], ["C", "context_window", "context management (0 = full history)"], ["C", "observation_chars", "observation truncation"], ["A", "tools", "action space"], ["O", "include_file_listing", "observation: file listing in the prompt"], ["S", "max_steps", "stopping rule: step cap (plus the submit tool)"], ["B", "max_total_tokens", "token budget per run"], ["B", "max_tokens_per_call", "output budget per call"], ["R_c", "temperature", "control randomness"], ["", "policy", "permission policy"], ["", "notes", "notes"]];
function hval(h, k) { const v = h[k]; if (Array.isArray(v)) return v.join(", "); if (v == null) return "—"; return String(v); }
function vHarness() {
  const R = filtered(), key = oracleKey(); const ids = harnessIds(R);
  if (!ids.length) return `<h2>Harness</h2>` + empty("No harness configs found.");
  if (!S.hA || !B.harnesses[S.hA]) S.hA = ids[0]; if (!S.hB || !B.harnesses[S.hB]) S.hB = ids[1] || ids[0];
  const A = B.harnesses[S.hA], Bh = B.harnesses[S.hB];
  let h = `<h2>The harness is a hidden variable</h2><p class="claim">H = (P, C, A, O, S, B, R<sub>c</sub>): prompt, context management, action space, observation formatting, stopping rule, budget, control randomness. Two harnesses, one model: fields that differ are highlighted, and the table shows which measured columns move.</p>`;
  const pick = (id, cur) => `<select data-act="${id}">${ids.map(x => `<option ${x === cur ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
  h += `<div class="row"><div class="col"><div class="card"><h4>A: ${pick("hA", S.hA)} <span class="small">${esc(A._file || "from ledger")}</span></h4>${HFIELDS.map(([sym, k, lab]) => `<div class="hfield ${hval(A, k) !== hval(Bh, k) ? "diff" : ""}"><span class="sym">${sym}</span><span class="k">${esc(lab)}</span><span class="v">${esc(hval(A, k))}</span></div>`).join("")}</div></div>`;
  h += `<div class="col"><div class="card"><h4>B: ${pick("hB", S.hB)} <span class="small">${esc(Bh._file || "from ledger")}</span></h4>${HFIELDS.map(([sym, k, lab]) => `<div class="hfield ${hval(A, k) !== hval(Bh, k) ? "diff" : ""}"><span class="sym">${sym}</span><span class="k">${esc(lab)}</span><span class="v">${esc(hval(Bh, k))}</span></div>`).join("")}</div></div></div>`;
  const models = uniq(R.map(r => r.model));
  h += `<h3><span class="n">1</span> Columns that move (${models.length === 1 ? "model " + esc(models[0]) : models.length + " models pooled; filter to one model for a clean comparison"})</h3><div class="tbl"><table><tr><th>harness</th><th class="num">runs</th><th class="num">pass@1</th><th class="num">Wilson 95%</th><th class="num">pass^3</th><th class="num">flip</th><th class="num">steps</th><th class="num">tok/run</th><th class="num">tok/solve</th><th class="num">$/pass</th><th class="num">verified</th><th class="num">boundary</th><th class="num">tests edited</th><th>exit reasons</th></tr>`;
  uniq(R.map(r => r.harness_id)).forEach(hid => { const rs = R.filter(r => r.harness_id === hid); const a = aggregate(rs, key); const g = graded(rs, key); const c = g.filter(r => r[key]).length; const w = wilson(c, g.length);
    h += `<tr class="${hid === S.hA || hid === S.hB ? "selrow" : ""}"><td><b>${esc(hid)}</b>${hid === S.hA ? ' <span class="badge info">A</span>' : ""}${hid === S.hB ? ' <span class="badge info">B</span>' : ""}</td><td class="num">${rs.length}</td><td class="num">${pct(a ? a.pass1 : NaN, 1)}</td><td class="num">${ciText(w[0], w[1])}</td><td class="num">${a && a["pass^3"] != null ? pct(a["pass^3"], 0) : "n/a"}</td><td class="num">${pct(flipRate(rs, key))}</td><td class="num">${fmt(mean(rs.map(r => r.steps)), 1)}</td><td class="num">${ints(mean(rs.map(tokOf)))}</td><td class="num">${ints(tokensPerSolve(rs, key))}</td><td class="num">${usd(costOfPass(rs, key))}</td><td class="num">${pct(verifiedRate(rs))}</td><td class="num">${pct(boundaryAny(rs))}</td><td class="num">${pct(mean(rs.map(r => r.tests_modified ? 1 : 0)))}</td><td class="small">${exitMix(rs).map(([k, v]) => `${esc(k)} ${pct(v)}`).join(", ")}</td></tr>`; });
  h += `</table></div>`;
  const rA = R.filter(r => r.harness_id === S.hA), rB = R.filter(r => r.harness_id === S.hB);
  if (rA.length && rB.length && S.hA !== S.hB) {
    const pb = pairedBootstrap(rA, rB, key);
    h += `<h3><span class="n">2</span> Δ<sub>H</sub> = E[Y | M, ${esc(S.hB)}, T] − E[Y | M, ${esc(S.hA)}, T]</h3><div class="row"><div class="col"><div class="tiles">${tile((pb.mean >= 0 ? "+" : "") + pct(pb.mean, 1), "paired mean difference (B − A)", `task-bootstrap 95% ${ciText(pb.lo, pb.hi)} · ${pb.n} paired tasks`)}${tile(ints(tokensPerSolve(rB, key) / tokensPerSolve(rA, key) * 100) + "%", "tokens per solve, B as % of A", "the efficiency column moves even when pass@1 does not")}${tile(pct(verifiedRate(rB) - verifiedRate(rA), 0), "Δ verified-after-edit", "conduct column")}${tile(ints(powerN(passRate(rA, key), passRate(rB, key))), "runs per arm to detect this Δ", "two-proportion, α = 0.05, power 0.8")}</div>
    <div class="callout ${pb.lo <= 0 && pb.hi >= 0 ? "" : "teal"}">${pb.lo <= 0 && pb.hi >= 0 ? "The interval covers zero: with " + pb.n + " tasks the harness effect on pass rate is not distinguishable from noise. Look at the other columns." : "The interval excludes zero: the harness moved the pass rate on these tasks."} Tasks are the unit of resampling because the same tasks were run under both harnesses.</div></div>
    <div class="col">${svgBar(Object.entries(pb.per_task).map(([t, d]) => ({ label: t, value: Math.abs(d), text: (d >= 0 ? "+" : "−") + pct(Math.abs(d), 0), color: d >= 0 ? "#17A398" : "#E4572E" })), { w: 440, lw: 150, max: 1 })}<div class="small">per-task difference in pass rate (B − A); bar length = |Δ|</div></div></div>`;
    // per-model breakdown
    if (models.length > 1) { h += `<h4 style="margin-top:14px">The same contrast, per model</h4><div class="tbl"><table><tr><th>model</th><th class="num">A pass</th><th class="num">B pass</th><th class="num">paired Δ</th><th class="num">95%</th><th class="num">tok/solve ratio</th></tr>${models.map(m => { const a = rA.filter(r => r.model === m), b = rB.filter(r => r.model === m); if (!a.length || !b.length) return ""; const p = pairedBootstrap(a, b, key); return `<tr><td><b>${esc(m)}</b></td><td class="num">${pct(passRate(a, key), 1)}</td><td class="num">${pct(passRate(b, key), 1)}</td><td class="num">${(p.mean >= 0 ? "+" : "") + pct(p.mean, 1)}</td><td class="num">${ciText(p.lo, p.hi)}</td><td class="num">${fmt(tokensPerSolve(b, key) / tokensPerSolve(a, key), 2)}×</td></tr>`; }).join("")}</table></div><p class="small">Same sign everywhere: the harness effect transfers. Different signs: it is model-specific (the interaction term in the Experiment view).</p>`; }
  }
  if (MODE === "server") {
    h += `<h3><span class="n">3</span> Make your own harness (saves to harnesses/&lt;id&gt;.json)</h3><div class="card"><div class="form">
      <label>id<input id="e_id" value="mine"></label><label>tools (comma list)<input id="e_tools" value="${esc(hval(A, "tools"))}"></label><label>policy<select id="e_policy"><option ${A.policy === "strict" ? "selected" : ""}>strict</option><option ${A.policy === "permissive" ? "selected" : ""}>permissive</option></select></label>
      <label>max_steps<input id="e_steps" type="number" value="${A.max_steps}"></label><label>context_window<input id="e_ctx" type="number" value="${A.context_window}"></label><label>observation_chars<input id="e_obs" type="number" value="${A.observation_chars}"></label><label>temperature<input id="e_temp" type="number" step="0.1" value="${A.temperature}"></label><label>max_total_tokens<input id="e_tok" type="number" value="${A.max_total_tokens}"></label></div>
      <label style="display:block;margin-top:8px;font-size:11px;color:var(--muted);text-transform:uppercase">system prompt</label><textarea id="e_prompt" style="width:100%;min-height:90px">${esc(A.system_prompt)}</textarea>
      <label style="display:block;margin-top:8px;font-size:11px;color:var(--muted);text-transform:uppercase">your prediction (which columns will move, and which way)</label><textarea id="e_pred" style="width:100%;min-height:50px" placeholder="written before measuring; saved into the harness notes">${esc(load("pred." + (A.id || ""), ""))}</textarea>
      <div style="margin-top:8px"><button class="btn" data-act="saveHarness">Save harness</button> <span class="small" id="h_msg">Then launch it from the Board with the new file.</span></div></div>`;
  }
  return h;
}
