// ============================================================ shell
function renderShell() {
  const tab = TABS.find(t => t[0] === S.tab) || TABS[0];
  $("strip").innerHTML = STRIP.map((b, i) => `<span class="box ${tab[2] === b ? "on" : ""}">${b}</span>${i < STRIP.length - 1 ? '<span class="arrow">→</span>' : ""}`).join("");
  $("tabs").innerHTML = TABS.map(t => `${t[4] ? `<span class="grp">${t[4]}</span>` : ""}<button class="${S.tab === t[0] ? "on" : ""}" data-act="tab" data-v="${t[0]}">${t[1]}<kbd>${t[3]}</kbd></button>`).join("");
  const chips = (label, key, values) => values.length <= 1 ? "" : `<div class="fgroup"><label>${label} ${S[key].size ? `<span class="chip pin" data-act="chipClear" data-k="${key}" style="padding:0 6px;font-size:10px">clear</span>` : ""}</label><div class="chips">${values.map(v => `<span class="chip ${S[key].has(v) ? "on" : ""}" data-act="chip" data-k="${key}" data-v="${esc(v)}">${esc(v)}</span>`).join("")}</div></div>`;
  const allTasks = uniq(B.runs.map(r => r.task_id)).sort();
  const taskChips = allTasks.length <= 24 ? chips("task", "tasks", allTasks) : `<div class="fgroup"><label>task ${S.tasks.size ? `<span class="chip pin" data-act="chipClear" data-k="tasks" style="padding:0 6px;font-size:10px">clear</span>` : ""}</label><div class="chips"><select data-act="taskPick" style="font-size:12px;padding:2px 6px"><option value="">${allTasks.length} tasks: pick one</option>${allTasks.map(t => `<option ${S.tasks.has(t) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div></div>`;
  $("filters").innerHTML = chips("results", "results", uniq(B.runs.map(r => r.results))) + chips("model", "models", uniq(B.runs.map(r => r.model))) + chips("harness", "harnesses", uniq(B.runs.map(r => r.harness_id))) + taskChips
    + `<div class="fgroup"><label>oracle</label><div class="chips">${[["visible", "visible tests"], ["hidden", "hidden tests"], ["strong", "strengthened tests"]].map(([v, l]) => `<span class="chip oracle ${S.oracle === v ? "on" : ""}" data-act="oracle" data-v="${v}">${l}</span>`).join("")}</div></div>`;
  const n = filtered().length;
  $("meta").textContent = `${n === B.runs.length ? B.runs.length : n + " of " + B.runs.length} runs · ${Object.keys(B.harnesses).length} harnesses · ${Object.keys(B.tasks).length} tasks · data ${B.generated_at}`;
  const live = $("live"); live.className = "live" + (MODE === "server" ? " on" : ""); live.querySelector("span").textContent = MODE === "server" ? `live · ${B.running.length} running` : "static export";
}
function renderMain() {
  const views = { overview: vOverview, board: vBoard, harness: vHarness, traj: vTraj, patterns: vPatterns, queries: vQueries, dist: vDist, attr: vAttr, tele: vTele, integ: vInteg, exp: vExp, report: vReport };
  const t0 = performance.now();
  try { $("main").innerHTML = (views[S.tab] || vOverview)(); }
  catch (e) { $("main").innerHTML = `<div class="callout">render error in view "${esc(S.tab)}": ${esc(e.message)}</div><pre>${esc(e.stack)}</pre>`; console.error(e); }
  if (S.hl != null) { const el = $("sp_" + S.hl); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  const dt = performance.now() - t0; if (dt > 50) console.debug(`render ${S.tab} ${dt.toFixed(0)} ms`);
  const d = $("drawer"); if (S.help && !d) document.body.insertAdjacentHTML("beforeend", helpHtml()); else if (!S.help && d) d.remove();
  syncHash();
}
function render() { renderShell(); renderMain(); }
function go(tab) { S.tab = tab; S.hl = null; window.scrollTo(0, 0); render(); }

// ============================================================ events
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act;
  if (act === "tab") go(el.dataset.v);
  else if (act === "chip") { const set = S[el.dataset.k]; set.has(el.dataset.v) ? set.delete(el.dataset.v) : set.add(el.dataset.v); S.listPage = 0; render(); }
  else if (act === "chipClear") { S[el.dataset.k].clear(); render(); }
  else if (act === "oracle") { S.oracle = el.dataset.v; render(); }
  else if (act === "sel") { if (ev.shiftKey || ev.target.closest('[data-act="multiToggle"]')) return; S.sel = el.dataset.key; S.cmp = null; S.hl = null; S.tab = "traj"; S.trajTab = "viewer"; window.scrollTo(0, 0); render(); loadDetail(S.sel); }
  else if (act === "cellsel") { const [res, model, hid] = el.dataset.key.split("|"); if (model) { S.models = new Set([model]); S.harnesses = new Set([hid]); if (res && res !== model) S.results = new Set([res]); } render(); }
  else if (act === "trajTab") { S.trajTab = el.dataset.v; S.hl = null; render(); }
  else if (act === "trajSort") { S.trajSort = el.dataset.v; renderMain(); }
  else if (act === "page") { S.listPage = Math.max(0, S.listPage + Number(el.dataset.v)); renderMain(); }
  else if (act === "nav") { const R = listRows(filtered()); const i = R.findIndex(r => r.key === S.sel); const j = i + Number(el.dataset.v); if (R[j]) { S.sel = R[j].key; S.hl = null; renderMain(); loadDetail(S.sel); } }
  else if (act === "scroll") { S.hl = Number(el.dataset.seq); renderMain(); }
  else if (act === "attrOpen") { S.attrOpen = S.attrOpen === el.dataset.id ? null : el.dataset.id; renderMain(); }
  else if (act === "expA") { S.expA = el.dataset.k; renderMain(); }
  else if (act === "expB") { S.expB = el.dataset.k; renderMain(); }
  else if (act === "multiToggle") { ev.stopPropagation(); const k = el.dataset.key; S.multi.has(k) ? S.multi.delete(k) : S.multi.add(k); renderMain(); }
  else if (act === "multiSet") { S.multi = new Set(el.dataset.keys.split(",").filter(Boolean)); S.tab = "traj"; S.trajTab = "multi"; window.scrollTo(0, 0); render(); }
  else if (act === "multiOpen") { S.tab = "traj"; S.trajTab = "multi"; window.scrollTo(0, 0); render(); }
  else if (act === "multiClear") { S.multi.clear(); renderMain(); }
  else if (act === "multiPage") { const boxes = Array.from(document.querySelectorAll('input[data-act="multiToggle"]')); const all = boxes.every(b => S.multi.has(b.dataset.key)); boxes.forEach(b => all ? S.multi.delete(b.dataset.key) : S.multi.add(b.dataset.key)); renderMain(); }
  else if (act === "jobsToggle") { S.jobsOpen = !S.jobsOpen; renderMain(); }
  else if (act === "copy") { const ta = $("report_md"); ta.select(); try { navigator.clipboard.writeText(ta.value).then(() => { $("copy_msg").textContent = "copied"; }); } catch (e) { document.execCommand("copy"); $("copy_msg").textContent = "copied"; } }
  else if (act === "csv") exportCsv();
  else if (act === "runjson") { const r = runByKey(S.sel); if (r) downloadText(`${r.run_id}.json`, JSON.stringify({ summary: r, spans: spansOf(r), features: featOf(r) }, null, 1)); }
  else if (act === "launch") launchRuns();
  else if (act === "cancel") cancelJob(el.dataset.id);
  else if (act === "saveHarness") saveHarness();
  else if (act === "help") { S.help = !S.help; renderMain(); }
  else if (act === "qex") { S.q = { ...S.q, re: el.dataset.re, name: el.dataset.name }; renderMain(); }
  else if (act === "qsave") { readQueryForm(); if (!S.q.re && S.q.steps_min === "" && S.q.steps_max === "" && !S.q.exit) return; S.qSaved.push({ ...S.q }); store("queries", S.qSaved); renderMain(); }
  else if (act === "qload") { S.q = { ...S.qSaved[Number(el.dataset.i)] }; renderMain(); }
  else if (act === "qdel") { S.qSaved.splice(Number(el.dataset.i), 1); store("queries", S.qSaved); renderMain(); }
  else if (act === "qexport") { readQueryForm(); S.qOpen = queryAsTest(S.q); renderMain(); }
  else if (act === "qclose") { S.qOpen = null; renderMain(); }
});
document.addEventListener("click", (ev) => { // shift-click on a board cell adds to the selection
  const el = ev.target.closest('.cell[data-act="sel"]'); if (!el || !ev.shiftKey) return; ev.preventDefault(); const k = el.dataset.key; S.multi.has(k) ? S.multi.delete(k) : S.multi.add(k); renderMain();
}, true);
document.addEventListener("change", (ev) => {
  const el = ev.target.closest("[data-act],[data-q]"); if (!el) return;
  if (el.dataset.q != null) { readQueryForm(); renderMain(); const again = document.querySelector(`[data-q="${el.dataset.q}"]`); if (again) again.focus(); return; }
  const act = el.dataset.act;
  if (act === "hA") { S.hA = el.value; renderMain(); }
  else if (act === "hB") { S.hB = el.value; renderMain(); }
  else if (act === "cmp") { S.cmp = el.value || null; renderMain(); }
  else if (act === "trajOutcome") { S.trajOutcome = el.value; S.listPage = 0; renderMain(); }
  else if (act === "trajTask") { S.trajTask = el.value; S.listPage = 0; renderMain(); }
  else if (act === "thr") { S.thr[el.dataset.k] = Number(el.value); renderMain(); }
  else if (act === "sortAttr") { S.sortAttr = el.value; renderMain(); }
  else if (act === "patCell") { S.patCell = el.value; renderMain(); }
  else if (act === "patTask") { S.patTask = el.value; renderMain(); }
  else if (act === "patK") { S.patK = Number(el.value); renderMain(); }
  else if (act === "expFA") { S.expFA = el.value; S.expA = S.expB = null; renderMain(); }
  else if (act === "expFB") { S.expFB = el.value; S.expA = S.expB = null; renderMain(); }
  else if (act === "preset") { S.preset = el.value; renderMain(); }
  else if (act === "taskPick") { S.tasks = el.value ? new Set([el.value]) : new Set(); render(); }
});
document.addEventListener("input", (ev) => { const el = ev.target.closest("[data-q]"); if (el && el.dataset.q === "re") { readQueryForm(); } if (["l_provider", "l_model", "l_harness", "l_tasks", "l_repeats"].includes(ev.target.id)) { const est = launchEstimate(readLaunchForm()); const e = $("launch_est"); if (e) e.firstChild.textContent = `${est.n} runs · planning estimate ${est.cost ? usd(est.cost) : "$0"} (${est.note}). `; } });
document.addEventListener("keydown", (ev) => {
  if (ev.target.matches("input,textarea,select")) { if (ev.key === "Enter" && ev.target.dataset.q != null) { readQueryForm(); renderMain(); } return; }
  const map = Object.fromEntries(TABS.map(t => [t[3], t[0]]));
  if (map[ev.key]) go(map[ev.key]);
  else if (ev.key === "?") { S.help = !S.help; renderMain(); }
  else if (ev.key === "Escape") { if (S.help) { S.help = false; renderMain(); } }
  else if (ev.key === "t") cycleTheme();
  else if ((ev.key === "j" || ev.key === "k") && S.sel) { const R = listRows(filtered()); const i = R.findIndex(r => r.key === S.sel); const j = i + (ev.key === "j" ? 1 : -1); if (R[j]) { S.sel = R[j].key; S.hl = null; if (S.tab !== "traj") { S.tab = "traj"; S.trajTab = "viewer"; render(); } else renderMain(); loadDetail(S.sel); } }
  else if (ev.key === "m" && S.sel) { S.multi.has(S.sel) ? S.multi.delete(S.sel) : S.multi.add(S.sel); renderMain(); }
});
window.addEventListener("hashchange", () => { hashToState(); render(); });
function readQueryForm() { document.querySelectorAll("[data-q]").forEach(el => { S.q[el.dataset.q] = el.value; }); }
function readLaunchForm() { return { provider: $("l_provider").value, model: $("l_model").value.trim(), harness: $("l_harness").value.trim(), tasks: $("l_tasks").value.trim() || "all", repeats: Number($("l_repeats").value || 1), seed: Number($("l_seed").value || 0), out: $("l_out").value.trim(), base_url: $("l_base").value.trim() }; }

// ============================================================ theme
function applyTheme() { const t = S.theme; if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); const b = $("btn_theme"); if (b) b.textContent = "◐ " + t; }
function cycleTheme() { S.theme = S.theme === "auto" ? "dark" : S.theme === "dark" ? "light" : "auto"; store("theme", S.theme); applyTheme(); }
$("btn_theme").addEventListener("click", cycleTheme);
$("btn_help").addEventListener("click", () => { S.help = !S.help; renderMain(); });

// ============================================================ exports
function downloadText(name, text, mime = "text/plain") { try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { alert("download blocked in this viewer; run the console locally to save files"); } }
function exportCsv() { const R = filtered(); const cols = ["results", "run_id", "task_id", "harness_id", "model", "repeat_index", "exit_reason", "visible_pass", "hidden_pass", "strong_pass", "steps", "tool_calls", "edits", "lines_added", "lines_removed", "boundary_events", "tests_modified", "input_tokens", "output_tokens", "cost_usd", "wall_ms"]; const feat = ["sequence", "ran_after_last_edit", "read_before_write", "repeated_no_edit", "first_edit_step"]; const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`; const lines = [cols.concat(feat).join(",")]; R.forEach(r => { const f = featOf(r); lines.push(cols.map(c => q(r[c])).concat(feat.map(c => q(f[c]))).join(",")); }); downloadText("agentlab_runs.csv", lines.join("\n"), "text/csv"); }

// ============================================================ data: static bundle or live server
let VERSION = null;
async function loadBundle(force) {
  if (window.__BUNDLE__) { B = window.__BUNDLE__; MODE = "static"; VERSION = B.version; return; }
  const r = await fetch("/api/bundle" + (force ? "?force=1" : "")); B = await r.json(); MODE = "server"; VERSION = B.version;
}
async function loadDetail(key) {
  if (MODE !== "server" || S.detail[key]) return;
  const r = runByKey(key); if (!r) return;
  try { const res = await fetch(`/api/run?results=${encodeURIComponent(r.results)}&id=${encodeURIComponent(r.run_id)}`); const d = await res.json(); if (!d.error) { S.detail[key] = d; if (S.sel === key && S.tab === "traj") renderMain(); } } catch (e) { console.warn(e); }
}
async function launchRuns() {
  const spec = readLaunchForm(); $("launch_msg").textContent = "launching…";
  try { const res = await fetch("/api/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec) }); const j = await res.json(); $("launch_msg").textContent = j.error ? "error: " + j.error : `job ${j.id} started: ${j.cmd}`; setTimeout(refresh, 1200); }
  catch (e) { $("launch_msg").textContent = "error: " + e.message; }
}
async function cancelJob(id) { try { await fetch("/api/jobs/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); setTimeout(refresh, 600); } catch (e) { console.warn(e); } }
async function saveHarness() {
  const body = { id: $("e_id").value.trim(), tools: $("e_tools").value.split(",").map(s => s.trim()).filter(Boolean), policy: $("e_policy").value, max_steps: Number($("e_steps").value), context_window: Number($("e_ctx").value), observation_chars: Number($("e_obs").value), temperature: Number($("e_temp").value), max_total_tokens: Number($("e_tok").value), system_prompt: $("e_prompt").value, notes: "made in the console. Prediction: " + ($("e_pred").value || "(none written)") };
  store("pred." + body.id, $("e_pred").value);
  try { const res = await fetch("/api/harness", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await res.json(); $("h_msg").textContent = j.error ? "error: " + j.error : `saved ${j.path}; launch it from the Board`; if (!j.error) { await loadBundle(true); render(); } }
  catch (e) { $("h_msg").textContent = "error: " + e.message; }
}
let refreshing = false;
async function refresh() {
  if (MODE !== "server" || refreshing) return; refreshing = true;
  try { const st = await (await fetch("/api/status")).json(); const running = st.jobs.some(j => j.status === "running");
    if (st.version !== VERSION) { await loadBundle(false); render(); }
    else { B.jobs = st.jobs; B.running = st.running; renderShell(); if (running && (S.tab === "board" || S.tab === "overview")) renderMain(); } }
  catch (e) { console.warn("refresh failed", e); }
  finally { refreshing = false; }
}
(async function boot() {
  S.theme = load("theme", "auto"); applyTheme(); S.qSaved = load("queries", []);
  try { await loadBundle(false); } catch (e) { $("main").innerHTML = `<div class="callout">Could not load data: ${esc(e.message)}. Start the server with <code>python -m harnesslab.core.serve</code> or open an exported file.</div>`; return; }
  hashToState();
  if (S.sel && !runByKey(S.sel)) S.sel = null;
  render();
  if (S.sel) loadDetail(S.sel);
  if (MODE === "server") setInterval(refresh, 3000);
})();
