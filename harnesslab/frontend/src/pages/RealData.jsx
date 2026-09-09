import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api, useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Stat, Badge, Empty, Spinner, Note, Tbl, useChartTheme } from '../ui'

export default function RealData() {
  return (
    <div className="space-y-4">
      <header className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-[15px] font-semibold text-ink">Data sources</h2>
        <span className="text-[12px] text-ink3">
          every run on this platform — launched here, streamed from a dataset, or imported from another harness — lands in the same ledger format
        </span>
      </header>
      <ImportExternal />
      <NebiusStream />
    </div>
  )
}

/* ------------------------------------------------------------------ external harness import */
function ImportExternal() {
  const { events, setResults, go } = useApp()
  const srcs = useFetch('/import/sources', [])
  const st = useFetch('/import/status', [events.tick])
  const [path, setPath] = useState('')
  const [dir, setDir] = useState('')
  const [model, setModel] = useState('')
  const [source, setSource] = useState('')          // '' = auto-detect
  const [det, setDet] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [msg, setMsg] = useState('')
  const running = st.data?.status === 'running'
  const result = st.data?.status === 'done' ? st.data.result : null

  // debounce the sniffer so typing a path does not hammer the disk
  useEffect(() => {
    if (!path.trim()) { setDet(null); return }
    let dead = false
    setDetecting(true)
    const t = setTimeout(() => {
      api('/import/detect?path=' + encodeURIComponent(path.trim()))
        .then(d => { if (!dead) { setDet(d); if (d.source && !dir) setDir(suggestDir(d.source, path)) } })
        .catch(() => { if (!dead) setDet(null) })
        .finally(() => { if (!dead) setDetecting(false) })
    }, 350)
    return () => { dead = true; clearTimeout(t) }
  }, [path]) // eslint-disable-line

  const chosen = source || det?.source || ''
  const canImport = !!path.trim() && !!dir.trim() && !!chosen && !running

  async function run() {
    setMsg('')
    try {
      await api('/import', { method: 'POST', body: { path: path.trim(), results_dir: dir.trim(), source: source || null, model: model.trim() || null } })
      st.reload()
    } catch (e) { setMsg(e.message) }
  }

  const prog = st.data?.progress
  return (
    <Card
      title="Import external harness runs"
      right={<span>Claude Code · Codex · OpenHands · SWE-agent · Inspect · Trajectory v1</span>}
    >
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-5 space-y-2">
          <label className="text-[11px] text-ink3 block">
            path to a session file or a directory of them
            <input className="input mt-1 mono" spellCheck={false}
              placeholder="~/.claude/projects/-home-me-repo/  ·  ~/.codex/sessions/2026/07/11/  ·  logs/run.eval"
              value={path} onChange={e => setPath(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-ink3">results dir<input className="input mt-1 mono" placeholder="imported_claude_code" value={dir} onChange={e => setDir(e.target.value)} /></label>
            <label className="text-[11px] text-ink3">model override (optional)<input className="input mt-1 mono" placeholder="leave blank to use the trace's model" value={model} onChange={e => setModel(e.target.value)} /></label>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-ink3 mr-1">source</span>
            <button onClick={() => setSource('')} className={`chip cursor-pointer ${source === '' ? 'border-accent text-accent-ink bg-accent/15' : 'border-line2 text-ink2'}`}>auto</button>
            {(srcs.data?.sources || []).map(s => (
              <button key={s.name} title={s.description} onClick={() => setSource(s.name)}
                className={`chip cursor-pointer ${source === s.name ? 'border-accent text-accent-ink bg-accent/15' : 'border-line2 text-ink2'}`}>{s.name}</button>
            ))}
          </div>
          <DetectLine det={det} detecting={detecting} chosen={chosen} override={!!source} />
          <button className="btn btn-primary w-full justify-center" onClick={run} disabled={!canImport}>
            {running ? `importing ${prog?.[0] ?? 0}${prog?.[1] ? ' / ' + prog[1] : ''}` : `Import into data/runs/${dir || '…'}`}
          </button>
          {(msg || st.data?.error) && <div className="text-[12px] text-critical">{msg || st.data.error}</div>}
          <Note>
            Each external session becomes one run with the same <span className="mono">ledger.jsonl</span> the lab's own runner writes,
            so the harness becomes a value in the <span className="mono">model × harness × task</span> matrix rather than a footnote.
            Re-running an import over the same directory is a no-op for runs already there.
            Inspect logs need <span className="mono">pip install inspect_ai</span>; nothing else needs a package.
          </Note>
        </div>

        <div className="col-span-12 xl:col-span-7 space-y-3">
          {result ? <ImportResult r={result} onOpen={() => { setResults(result.results_dir); go('explorer') }} /> : <SourceTable rows={srcs.data?.sources || []} />}
          {(st.data?.history?.length > 1) && (
            <div className="text-[11px] text-ink3">
              earlier imports: {st.data.history.slice(1).map((h, i) => <span key={i} className="mono mr-2">{h.source}→{h.results_dir} ({h.imported})</span>)}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function suggestDir(source, path) {
  const base = (path || '').replace(/\/+$/, '').split('/').pop() || ''
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
  return `imported_${source}${slug ? '_' + slug : ''}`
}

function DetectLine({ det, detecting, chosen, override }) {
  if (detecting) return <div className="text-[12px] text-ink3">sniffing…</div>
  if (!det) return <div className="text-[12px] text-ink3">detected source appears here</div>
  if (!det.exists) return <div className="text-[12px] text-critical">no such file or directory</div>
  return (
    <div className="text-[12px] text-ink2 flex flex-wrap gap-2 items-center">
      {det.source
        ? <><Badge tone="good">{det.source}</Badge><span className="text-ink3">{det.sessions ?? '?'} session{det.sessions === 1 ? '' : 's'}{det.is_dir ? ' in this directory' : ''}</span></>
        : <Badge tone="warn">no known format detected — pick a source</Badge>}
      {override && chosen !== det.source && <span className="text-warn-ink">forcing <span className="mono">{chosen}</span></span>}
      {(det.candidates || []).length > 1 && (
        <span className="text-ink3">also matched {det.candidates.slice(1).map(c => `${c.source} ${c.confidence}`).join(', ')}</span>
      )}
      {det.error && <span className="text-critical">{det.error}</span>}
    </div>
  )
}

function SourceTable({ rows }) {
  if (!rows.length) return <Spinner label="loading adapters" />
  return (
    <div>
      <Tbl><thead><tr><th>adapter</th><th>what it reads</th></tr></thead>
        <tbody>{rows.map(s => (
          <tr key={s.name}>
            <td className="mono whitespace-nowrap align-top">{s.name}</td>
            <td className="text-ink2">{s.description}<div className="text-[11px] text-ink3 mono mt-0.5">{s.patterns.join(' · ')}</div></td>
          </tr>
        ))}</tbody></Tbl>
      <Note>
        Outcomes are only claimed when the trace carries a real verdict — an Inspect score, an OpenHands/SWE-bench
        <span className="mono"> resolved</span> flag, or a sidecar <span className="mono">results.json</span>. Everything else imports with
        <span className="mono"> hidden_pass = null</span>, which the outcome pages read as "not passed": treat pass@1 over an
        unverdicted directory as a lower bound, not a measurement.
      </Note>
    </div>
  )
}

function ImportResult({ r, onOpen }) {
  const unknown = r.outcomes_unknown || 0
  const known = r.outcomes_known || 0
  return (
    <div className="space-y-3">
      <div className="stats">
        <Stat label="imported" value={r.imported} sub={`${r.skipped} already present`} small />
        <Stat label="source" value={r.source} sub={`→ data/runs/${r.results_dir}`} small />
        <Stat label="tasks" value={r.n_tasks} sub={(r.tasks || []).slice(0, 2).join(', ') || '—'} small />
        <Stat label="outcome known" value={`${known} / ${known + unknown}`} sub={unknown ? `${unknown} run(s) carry no verdict` : 'every run has a verdict'} tone={unknown ? 'warn' : 'good'} small />
      </div>
      <Tbl nowrap>
        <thead><tr><th>agent</th><th>version</th><th className="text-right">runs</th><th>tools (lab surface)</th><th>observed</th><th className="text-right">steps</th><th>policy</th><th>hash</th></tr></thead>
        <tbody>{(r.harnesses || []).map(h => {
          const f = h.fingerprint || {}
          return (
            <tr key={h.harness_id}>
              <td className="mono">{f.agent || h.harness_id}</td>
              <td className="mono text-ink3">{f.agent_version || '—'}</td>
              <td className="text-right">{h.runs}</td>
              <td className="text-[11.5px] text-ink2">{(f.lab_tools || []).join(' ')}</td>
              <td className="text-[11.5px] text-ink3">{(f.observed_tools || []).slice(0, 6).join(' ')}{(f.observed_tools || []).length > 6 ? ' …' : ''}</td>
              <td className="text-right">{f.observed_max_steps}</td>
              <td>{f.policy_hint === 'permissive'
                ? <Badge tone="critical" title={(f.destructive_executed || []).join(', ')}>permissive · {(f.destructive_executed || []).join(' ')}</Badge>
                : <span className="text-ink3">unknown</span>}</td>
              <td className="mono text-[11px] text-ink3">{h.hash}</td>
            </tr>
          )
        })}</tbody>
      </Tbl>
      {(r.harnesses || []).some(h => h.fingerprint?.system_prompt_chars > 0) && (
        <div className="text-[11px] text-ink3">
          system prompts are hashed, never stored: {(r.harnesses || []).filter(h => h.fingerprint?.system_prompt_chars).map(h => (
            <span key={h.harness_id} className="mono mr-2">{h.fingerprint.agent} sha256 {h.fingerprint.system_prompt_sha256.slice(0, 12)}… ({h.fingerprint.system_prompt_chars} chars)</span>
          ))}
        </div>
      )}
      {!!(r.errors || []).length && <div className="text-[12px] text-critical">{r.errors.slice(0, 4).map((e, i) => <div key={i} className="mono">{e}</div>)}</div>}
      <div className="flex flex-wrap gap-2 items-center">
        <button className="btn" onClick={onOpen}>open the imported trajectories</button>
        <span className="text-[12px] text-ink3">the results selector at the top switches every page to <span className="mono">{r.results_dir}</span></span>
      </div>
      <Note>
        <span className="mono">hash</span> is sha256 over the whole observed fingerprint (agent, version, tool set, step count,
        system-prompt digest, truncation hints, executed destructive commands). Two runs with the same hash are the same
        harness as far as the trace can prove; <span className="mono">policy</span> says <em>permissive</em> only when a destructive
        command was actually seen to execute, never on the strength of a config we cannot read.
      </Note>
    </div>
  )
}

/* ------------------------------------------------------------------ nebius/SWE-agent stream (unchanged) */
function NebiusStream() {
  const { overview, events, results, setResults, go } = useApp()
  const { TT, AX, GRID, SERIES, STATUS, ink2 } = useChartTheme()
  const dirs = (overview?.results || []).filter(d => d.name.startsWith('real_'))
  const [pick, setPick] = useState('')
  const dir = dirs.find(d => d.name === pick) || dirs[0]
  const a = useFetch(dir ? `/real/${dir.name}/analysis` : null, [dir?.name, events.tick])
  const st = useFetch('/real/status', [events.tick])
  const [cfg, setCfg] = useState({ n: 500, seed: 0, model: '' })
  const [msg, setMsg] = useState('')
  const running = st.data?.status === 'running'
  async function imp() {
    setMsg('')
    try { await api('/real/import', { method: 'POST', body: { n: cfg.n, seed: cfg.seed, model: cfg.model || null } }) } catch (e) { setMsg(e.message) }
  }
  const d = a.data
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 xl:col-span-4" title="Stream real trajectories" right={<span>nebius/SWE-agent-trajectories · CC-BY-4.0</span>}>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-ink3">runs<input className="input mt-1" type="number" min={50} max={5000} step={50} value={cfg.n} onChange={e => setCfg(c => ({ ...c, n: +e.target.value }))} /></label>
            <label className="text-[11px] text-ink3">seed (0 = first n)<input className="input mt-1" type="number" value={cfg.seed} onChange={e => setCfg(c => ({ ...c, seed: +e.target.value }))} /></label>
            <label className="text-[11px] text-ink3">model filter<input className="input mt-1 mono" placeholder="swe-agent-llama-70b" value={cfg.model} onChange={e => setCfg(c => ({ ...c, model: e.target.value }))} /></label>
          </div>
          <button className="btn btn-primary w-full justify-center" onClick={imp} disabled={running}>{running ? `importing ${st.data?.progress?.[0] ?? 0} / ${st.data?.progress?.[1] ?? cfg.n}` : `Import ${cfg.n} runs into the ledger format`}</button>
          {(msg || st.data?.error) && <div className="text-[12px] text-critical">{msg || st.data.error}</div>}
          <Note>80,036 SWE-agent runs on real GitHub issues, each labelled resolved or not. Needs <span className="mono">pip install datasets</span> and network; 500 runs take 1–3 minutes. Each run becomes a ledger, so the Trajectories, Sentinel and Integrity pages work on it, and the sentinel can be trained on it.</Note>
          {dirs.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{dirs.map(x => <button key={x.name} onClick={() => setPick(x.name)} className={`chip cursor-pointer ${x.name === dir?.name ? 'border-accent text-accent-ink bg-accent/15' : 'border-line2 text-ink2'}`}>{x.name} <span className="text-ink3">{x.runs}</span></button>)}</div>}
        </div>
      </Card>
      <div className="col-span-12 xl:col-span-8">
        {!dir ? <Empty>No real trajectories imported yet.</Empty> : !d ? <Spinner label="analysing" /> : d.error ? <Empty>{d.error}</Empty> : (
          <div className="stats">
            <Stat label="runs" value={d.n} sub={d.by_model.map(m => `${m.model.replace('swe-agent-', '')} ${m.n}`).join(' · ')} />
            <Stat label="resolved" value={fmt.pct(d.resolved / d.n)} sub={`${d.resolved} of ${d.n} · real base rate`} tone="warn" />
            <Stat label="steps, resolved" value={fmt.num(d.table[0].resolved, 1)} sub="dataset card 31.3 (80,036 runs)" />
            <Stat label="steps, unresolved" value={fmt.num(d.table[0].unresolved, 1)} sub={`CI [${fmt.num(d.steps_ci_unresolved[0], 1)}, ${fmt.num(d.steps_ci_unresolved[1], 1)}] · card 58.4`} />
            <Stat label="context exhausted" value={fmt.pct(d.table.find(t => t.key === 'exit_context').unresolved)} sub={`unresolved · resolved ${fmt.pct(d.table.find(t => t.key === 'exit_context').resolved)}`} tone="serious" />
          </div>
        )}
        {d && !d.error && (
          <div className="grid grid-cols-12 gap-4 mt-4">
            <Card className="col-span-12 xl:col-span-6" title="1 · Resolved vs unresolved, your sample next to the dataset card" pad={false}>
              <div className="px-2 pb-2"><Tbl nowrap><thead><tr><th>metric</th><th className="text-right">resolved</th><th className="text-right">unresolved</th><th className="text-right">card (80,036)</th></tr></thead>
                <tbody>{d.table.map(t => <tr key={t.key}><td className="whitespace-nowrap">{t.metric}</td><td className="text-right">{t.kind === 'rate' ? fmt.pct(t.resolved) : fmt.num(t.resolved, 1)}</td><td className="text-right font-medium">{t.kind === 'rate' ? fmt.pct(t.unresolved) : fmt.num(t.unresolved, 1)}</td><td className="text-right text-ink3">{t.card || '—'}</td></tr>)}</tbody></Tbl></div>
              <div className="px-4 pb-3"><Note>Failure costs about twice the steps, several times the edited lines, and six times the context exhaustion. Those are symptoms as much as causes — hold that thought for the Ochiai table.</Note></div>
            </Card>
            <div className="col-span-12 xl:col-span-6 space-y-4">
              <Card title="2 · Exit status and action mix">
                <div className="flex flex-wrap gap-1.5 mb-2">{Object.entries(d.exit_status).map(([k, v]) => <Badge key={k} tone={k.startsWith('submitted') && !k.includes('context') && !k.includes('no_patch') ? 'good' : 'warn'}>{k} {v}</Badge>)}</div>
                <div className="h-[150px]">
                  <ResponsiveContainer>
                    <BarChart data={['view', 'search', 'edit', 'run', 'submit', 'other'].map(a => ({ a, resolved: d.action_mix.resolved[a] || 0, unresolved: d.action_mix.unresolved[a] || 0 }))} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                      <CartesianGrid {...GRID} /><XAxis dataKey="a" {...AX} /><YAxis tickFormatter={v => (v * 100).toFixed(0) + '%'} {...AX} />
                      <Tooltip {...TT} formatter={(v) => fmt.pct(v, 1)} /><Legend wrapperStyle={{ fontSize: 11, color: ink2 }} />
                      <Bar dataKey="resolved" fill={SERIES[2]} radius={[3, 3, 0, 0]} maxBarSize={22} /><Bar dataKey="unresolved" fill={STATUS.critical} radius={[3, 3, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <Card className="col-span-12" title="3 · Spectrum-based attribution: rows are runs, columns are binary trajectory features" right={<span>Ochiai = ef / √(F · (ef + ep))</span>} pad={false}>
              <div className="px-2 pb-2 grid grid-cols-1 2xl:grid-cols-2 gap-x-6 min-w-0">
                <Tbl nowrap><thead><tr><th>feature</th><th className="text-right">Ochiai</th><th className="text-right">in failures</th><th className="text-right">in successes</th></tr></thead>
                  <tbody>{d.ochiai.slice(0, Math.ceil(d.ochiai.length / 2)).map(f => <OchRow key={f.feature} f={f} />)}</tbody></Tbl>
                <Tbl nowrap><thead><tr><th>feature</th><th className="text-right">Ochiai</th><th className="text-right">in failures</th><th className="text-right">in successes</th></tr></thead>
                  <tbody>{d.ochiai.slice(Math.ceil(d.ochiai.length / 2)).map(f => <OchRow key={f.feature} f={f} />)}</tbody></Tbl>
              </div>
              <div className="px-4 pb-3"><Note>Q1: is <span className="mono">never_verified_after_edit</span> a cause, a symptom, or a harness artefact (a context cap that cuts off the run before the test)? Q3: where does that cap show up on the report card? Stretch: these trajectories were generated to <em>train</em> agents — would filtering on a feature teach the model to avoid the failure, or the symptom? Then improve <span className="mono">agentlab/real_traj.py::classify_command</span> and see whether the ranking moves.</Note></div>
            </Card>
            <Card className="col-span-12" title="4 · Now do the rest of the lab on it">
              <div className="flex flex-wrap gap-2 items-center text-[12.5px] text-ink2">
                <button className="btn" onClick={() => { setResults(dir.name); go('explorer') }}>open a real unresolved trajectory</button>
                <button className="btn" onClick={() => { setResults(dir.name); go('sentinel') }}>train the sentinel on these runs</button>
                <button className="btn" onClick={() => { setResults(dir.name); go('integrity') }}>self-report vs oracle on real data</button>
                <span className="text-ink3">the results selector at the top switches every page to <span className="mono">{dir.name}</span></span>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function OchRow({ f }) {
  const { SERIES, STATUS } = useChartTheme()
  const base = f.rate_in_failures > 0.9 && f.rate_in_successes > 0.9
  const disc = f.rate_in_failures - (f.rate_in_successes || 0) > 0.15
  return (
    <tr>
      <td className="mono text-[12px]">{f.feature} {base ? <Badge tone="warn">base rate</Badge> : disc ? <Badge tone="serious">discriminates</Badge> : null}</td>
      <td className="text-right font-medium">{fmt.num(f.ochiai, 3)}</td>
      <td className="text-right"><span className="inline-block h-2 rounded-full mr-1.5 align-middle" style={{ width: f.rate_in_failures * 60, background: STATUS.critical }} />{fmt.pct(f.rate_in_failures)}</td>
      <td className="text-right"><span className="inline-block h-2 rounded-full mr-1.5 align-middle" style={{ width: (f.rate_in_successes || 0) * 60, background: SERIES[2] }} />{fmt.pct(f.rate_in_successes)}</td>
    </tr>
  )
}
