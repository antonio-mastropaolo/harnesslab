import { useMemo, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Line, Area, ComposedChart } from 'recharts'
import { api, useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Stat, Badge, Empty, Spinner, Note, Tbl, useChartTheme } from '../ui'

const BINS = 20

export default function Sentinel() {
  const { results, harness, overview, events } = useApp()
  const { TT, AX, GRID, SERIES, STATUS, ink2, ink3 } = useChartTheme()
  const s = useFetch('/sentinel', [events.tick])
  const replay = useFetch(results ? `/sentinel/replay_all/${results}?harness=${harness}` : null, [results, harness, events.tick, s.data?.model?.meta?.trained_at])
  const metrics = useFetch(results ? `/results/${results}/metrics` : null, [results, events.tick])
  const [pick, setPick] = useState([])
  const [hFilter, setHFilter] = useState('')
  const [mname, setMname] = useState('')
  const [msg, setMsg] = useState('')
  const [showRuns, setShowRuns] = useState(false)
  const [lbK, setLbK] = useState('10,15,20')
  const [lbThr, setLbThr] = useState(0.6)
  const [lbTick, setLbTick] = useState(0)
  const [copied, setCopied] = useState('')
  const [pluginTick, setPluginTick] = useState(0)
  const fileRef = useRef(null)
  const dirs = overview?.results || []
  const plugins = useFetch('/sentinel/plugins', [pluginTick, events.tick])
  const lbQ = results ? `/sentinel/leaderboard?dir=${results}&k=${encodeURIComponent(lbK)}&threshold=${lbThr}${harness ? `&harness=${harness}` : ''}${lbTick ? `&_=${lbTick}` : ''}` : null
  const lb = useFetch(lbQ, [results, harness, lbK, lbThr, lbTick])
  const meta = s.data?.model?.meta || {}
  const rep = (s.data?.train?.report && s.data.train.report.name === meta.name) ? s.data.train.report : (meta.trained ? meta : null)
  const training = s.data?.train?.status === 'running'

  async function train() {
    setMsg('')
    try { await api('/sentinel/train', { method: 'POST', body: { results: pick.length ? pick : [results], harness: hFilter || null, name: mname || null } }); setMsg('training… (run-level 5-fold CV plus a 200-run bootstrap; ~20 s on 480 runs, minutes on thousands of prefixes)') }
    catch (e) { setMsg(e.message) }
  }

  const coefs = (s.data?.model?.names || []).map((n, i) => ({ n, w: s.data.model.w[i] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
  const detection = useMemo(() => {
    const R = replay.data || []
    const fails = R.filter(r => r.hidden_pass === false), oks = R.filter(r => r.hidden_pass)
    const thr = 0.6
    const firstCross = (r) => { const i = r.risk.findIndex(x => x >= thr); return i < 0 ? null : (i + 1) / r.risk.length }
    const invisible = fails.filter(r => r.visible_pass).length
    const band = (arr) => Array.from({ length: BINS }, (_, b) => {
      const vals = []
      for (const r of arr) r.risk.forEach((y, j) => { const x = (j + 1) / r.risk.length; if (Math.min(BINS - 1, Math.floor(x * BINS)) === b) vals.push(y) })
      vals.sort((a, c) => a - c)
      const q = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : null
      return { x: (b + 0.5) / BINS, med: q(0.5), lo: q(0.25), hi: q(0.75), n: vals.length }
    })
    return { fails, oks, flaggedFail: fails.filter(r => firstCross(r) != null).length, flaggedOk: oks.filter(r => firstCross(r) != null).length, invisible, thr,
      bands: { fail: band(fails), ok: band(oks) } }
  }, [replay.data])
  const pairs = metrics.data?.sentinel_pairs || []
  const op7 = rep?.operating_points?.find(o => o.threshold === 0.7)

  /** How often each detector actually fired on the current directory (from the same replay the chart uses). */
  const fires = useMemo(() => {
    const R = replay.data || [], prefix = {}, runs = {}
    for (const r of R) {
      const seen = new Set()
      for (const step of (r.patterns || [])) for (const id of step) { prefix[id] = (prefix[id] || 0) + 1; seen.add(id) }
      for (const id of seen) runs[id] = (runs[id] || 0) + 1
    }
    return { prefix, runs, nRuns: R.length }
  }, [replay.data])

  async function exportModel(name) {
    try {
      const b = await api(`/sentinel/export/${encodeURIComponent(name)}`)
      const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${name}.sentinel.json`; document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setMsg(`exported ${name} (sha256 ${b.sha256.slice(0, 12)}…)`)
    } catch (e) { setMsg(`export failed: ${e.message}`) }
  }

  async function importModel(file) {
    if (!file) return
    setMsg('')
    try {
      const bundle = JSON.parse(await file.text())
      const r = await api('/sentinel/import', { method: 'POST', body: { bundle } })
      setMsg(`imported ${r.name} · ${r.n_features} features · trained on ${(r.provenance?.training_dirs || []).join(', ') || 'unknown'}`)
      s.reload()
    } catch (e) { setMsg(`import refused: ${e.message}`) }
  }

  async function copyLeaderboard() {
    try {
      const md = await api(`/sentinel/leaderboard.md?dir=${results}&k=${encodeURIComponent(lbK)}&threshold=${lbThr}${harness ? `&harness=${harness}` : ''}`)
      await navigator.clipboard?.writeText(md)
      setCopied('copied'); setTimeout(() => setCopied(''), 1800)
    } catch (e) { setCopied(e.message) }
  }

  if (s.loading && !s.data) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="stats">
        <Stat label="active risk model" value={meta.trained ? (meta.name || 'trained') : 'prior'} small tone={meta.trained ? 'good' : 'warn'} sub={meta.trained ? `${meta.n_runs} runs · ${meta.n_examples} prefixes · ${(meta.sources || []).map(x => x.split('/').pop()).join(', ')}` : 'hand-set weights from the lecture; train it'} />
        <Stat label="AUC, any prefix" value={fmt.num(rep?.auc_all_prefixes, 2)} tone={rep?.auc_all_prefixes > 0.65 ? 'good' : rep ? 'warn' : undefined}
          sub={rep?.auc_ci?.any_prefix ? `95% CI ${fmt.num(rep.auc_ci.any_prefix[0], 2)}–${fmt.num(rep.auc_ci.any_prefix[1], 2)} · step-only baseline ${fmt.num(rep.auc_baselines?.step_only, 2)}` : 'out-of-fold; 0.5 = coin flip'} />
        <Stat label="AUC, run-weighted" value={fmt.num(rep?.auc_run_weighted, 2)}
          sub={rep?.auc_ci?.run_weighted ? `95% CI ${fmt.num(rep.auc_ci.run_weighted[0], 2)}–${fmt.num(rep.auc_ci.run_weighted[1], 2)} · long failures no longer dominate` : 'each run weighted once'} />
        <Stat label="calibration error" value={fmt.num(rep?.ece, 3)} tone={rep?.ece > 0.1 ? 'warn' : rep ? 'good' : undefined} sub="ECE over 10 bins; 0 = the risk number means what it says" />
        <Stat label="oracle-invisible failures" value={fmt.pct(rep?.oracle_invisible?.invisible_share ?? rep?.oracle_invisible_failure_share)} tone={(rep?.oracle_invisible?.invisible_share ?? rep?.oracle_invisible_failure_share ?? 0) > 0.5 ? 'serious' : undefined}
          sub={rep?.oracle_invisible ? `visible tests passed, hidden failed · unknown for ${fmt.pct(rep.oracle_invisible.unknown_share)} of failures` : 'visible tests passed, hidden failed — no watcher can see these'} />
        <Stat label="recall / false alarm @0.7" value={`${fmt.pct(op7?.recall)} / ${fmt.pct(op7?.false_alarm)}`} sub={op7?.mean_lead_steps != null ? `lead ${fmt.num(op7.mean_lead_steps, 1)} steps before the end` : 'a run is flagged if any prefix crosses'} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-4" title="Train on finished runs" right={<span>label = failed the hidden tests</span>}>
          <div className="space-y-2">
            <div className="text-[11px] text-ink3">results directories (prefix at step k → did the run eventually fail?)</div>
            <div className="flex flex-wrap gap-1.5">
              {dirs.map(d => <button key={d.name} onClick={() => setPick(p => p.includes(d.name) ? p.filter(x => x !== d.name) : [...p, d.name])} className={`chip cursor-pointer ${(pick.length ? pick : [results]).includes(d.name) ? 'border-accent text-accent-ink bg-accent/15' : 'border-line2 text-ink2'}`}>{d.name} <span className="text-ink3">{d.runs}</span></button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] text-ink3">restrict to harness (optional)<input className="input mt-1 mono" placeholder="e.g. baseline" value={hFilter} onChange={e => setHFilter(e.target.value)} /></label>
              <label className="block text-[11px] text-ink3">model name (optional)<input className="input mt-1 mono" placeholder="auto" value={mname} onChange={e => setMname(e.target.value.replace(/[^a-zA-Z0-9_+@.-]/g, ''))} /></label>
            </div>
            <button className="btn btn-primary w-full justify-center" onClick={train} disabled={training}>{training ? 'training…' : 'Train risk model (5-fold CV by run)'}</button>
            {(msg || s.data?.train?.error) && <div className="text-[12px] text-ink3">{s.data?.train?.error || msg}</div>}
            {s.data?.models?.length > 0 && (
              <div className="border-t border-line pt-2">
                <div className="text-[11px] text-ink3 mb-1">saved models · click to activate (used by every new live run and every replay) · <span className="text-ink2">export</span> writes a portable JSON with provenance and a sha256</div>
                <div className="space-y-1">{s.data.models.map(m => (
                  <div key={m.name} className={`w-full px-2.5 py-1.5 rounded-lg border flex items-center gap-2 ${m.active ? 'border-accent bg-accent/10' : 'border-line hover:border-ink3'}`}>
                    <button onClick={() => api('/sentinel/activate', { method: 'POST', body: { name: m.name } }).then(() => s.reload()).catch(e => setMsg(e.message))}
                      title="activate this model" className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${m.active ? 'bg-accent' : 'bg-line2'}`} />
                      <span className="mono text-[12px] flex-1 truncate">{m.name}</span>
                      <span className="text-[11px] text-ink3 whitespace-nowrap">{m.meta?.n_runs} runs</span>
                      <span className={`text-[11px] tabular-nums whitespace-nowrap ${m.meta?.auc_all_prefixes > 0.65 ? 'text-good-ink' : 'text-warn-ink'}`}>AUC {fmt.num(m.meta?.auc_all_prefixes, 2)}</span>
                    </button>
                    <button onClick={() => exportModel(m.name)} title={`download ${m.name}.sentinel.json`} className="text-[11px] text-ink3 hover:text-accent-ink shrink-0 px-1">export</button>
                  </div>))}</div>
                <div className="flex items-center gap-2 mt-2">
                  <button className="btn" onClick={() => fileRef.current?.click()}>Import model…</button>
                  <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                    onChange={e => { importModel(e.target.files?.[0]); e.target.value = '' }} />
                  <span className="text-[11px] text-ink3">a bundle whose feature list differs from this build is refused, with the reason</span>
                </div>
              </div>
            )}
            <Note>Pure-Python logistic regression on {s.data?.features?.length} prefix features. It is deliberately inspectable: the coefficients are the argument. A trained model replaces the prior for every new live run.</Note>
          </div>
        </Card>

        <Card className="col-span-12 xl:col-span-4" title="What the model weighs" right={<span>standardised logistic weights → P(fail)</span>}>
          <div className="h-[300px]">
            <ResponsiveContainer>
              <BarChart data={coefs.slice(0, 14)} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 40 }}>
                <CartesianGrid stroke={GRID.stroke} strokeDasharray="2 4" horizontal={false} />
                <XAxis type="number" {...AX} />
                <YAxis type="category" dataKey="n" width={120} tick={{ fill: ink2, fontSize: 10.5, fontFamily: 'ui-monospace, Menlo, monospace' }} axisLine={false} tickLine={false} interval={0} />
                <Tooltip {...TT} formatter={(v) => [fmt.num(v, 3), 'weight']} />
                <ReferenceLine x={0} stroke={ink2} />
                <Bar dataKey="w" radius={3} maxBarSize={14}>{coefs.slice(0, 14).map((c, i) => <Cell key={i} fill={c.w > 0 ? STATUS.serious : SERIES[2]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Note>Orange pushes towards "will fail", green towards "will pass". Argue with it: a negative weight on <span className="mono">n_tests</span> means running tests predicts success in this cell — cause, or the harness giving a test tool?</Note>
        </Card>

        <Card className="col-span-12 xl:col-span-4" title="How early can it tell?" right={<span>out-of-fold, runs still alive at step k</span>}>
          {rep?.auc_by_step?.length ? (
            <Tbl nowrap>
              <thead><tr><th>alive at step</th><th className="text-right">n</th><th className="text-right">fail share</th><th className="text-right">model</th><th className="text-right">rules only</th><th className="text-right">prior</th></tr></thead>
              <tbody>{rep.auc_by_step.map(a => <tr key={a.step}><td className="mono">{a.step}</td><td className="text-right">{a.n}</td><td className="text-right">{fmt.pct(a.fail_share)}</td><td className="text-right font-medium" style={{ color: a.auc >= 0.6 ? STATUS.good : a.auc >= 0.5 ? STATUS.warn : STATUS.critical }}>{fmt.num(a.auc, 2)}</td><td className="text-right text-ink2">{fmt.num(a.auc_rules, 2)}</td><td className="text-right text-ink2">{fmt.num(a.auc_prior, 2)}</td></tr>)}</tbody>
            </Tbl>
          ) : <Empty>Train the model to see the table.</Empty>}
          {rep?.auc_by_prefix?.length > 0 && (
            <div className="h-[150px] mt-2">
              <ResponsiveContainer>
                <BarChart data={rep.auc_by_prefix} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid {...GRID} /><XAxis dataKey="bucket" {...AX} /><YAxis domain={[0.3, 1]} {...AX} />
                  <Tooltip {...TT} formatter={(v, n, p) => [fmt.num(v, 2) + ` (n=${p.payload.n})`, 'AUC by fraction elapsed']} />
                  <ReferenceLine y={0.5} stroke={ink3} strokeDasharray="3 3" />
                  <Bar dataKey="auc" radius={[4, 4, 0, 0]} maxBarSize={40}>{rep.auc_by_prefix.map((b, i) => <Cell key={i} fill={b.auc >= 0.6 ? SERIES[2] : b.auc >= 0.5 ? STATUS.warn : STATUS.critical} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <Note>Rows condition on the run still being alive at step k, so "long runs fail" cannot help the score: a step-only scorer is 0.5 by construction here (it is {fmt.num(rep?.auc_baselines?.step_only, 2)} on the any-prefix number). The two right-hand columns are what you get without the learned weights.</Note>
          {rep?.operating_points && (
            <Tbl className="mt-2" nowrap><thead><tr><th>threshold</th><th className="text-right">recall (runs)</th><th className="text-right">false alarm</th><th className="text-right">lead</th></tr></thead>
              <tbody>{rep.operating_points.map(o => <tr key={o.threshold}><td className="mono">{o.threshold}</td><td className="text-right">{fmt.pct(o.recall)}</td><td className="text-right">{fmt.pct(o.false_alarm)}</td><td className="text-right">{o.mean_lead_steps != null ? fmt.num(o.mean_lead_steps, 1) : '—'}</td></tr>)}</tbody></Tbl>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-6" title={`Replay of every run in ${results} · ${harness}`} right={<><label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={showRuns} onChange={e => setShowRuns(e.target.checked)} /> individual runs</label><span>{detection.fails.length} failed · {detection.oks.length} passed</span></>}>
          {replay.loading && !replay.data ? <Spinner label="replaying ledgers" /> : (
            <>
              <div className="h-[220px]">
                <ResponsiveContainer>
                  <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="x" type="number" domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} {...AX} />
                    <YAxis domain={[0, 1]} {...AX} />
                    <ReferenceLine y={detection.thr} stroke={STATUS.serious} strokeDasharray="3 3" />
                    {showRuns && [...detection.oks, ...detection.fails].slice(0, 160).map(r => (
                      <Line key={r.run_id} data={r.risk.map((y, j) => ({ x: (j + 1) / r.risk.length, y }))} dataKey="y" type="monotone" dot={false} isAnimationActive={false} stroke={r.hidden_pass ? SERIES[2] : STATUS.critical} strokeOpacity={0.18} strokeWidth={1} activeDot={false} />
                    ))}
                    <Area data={detection.bands.fail.map(b => ({ x: b.x, r: [b.lo, b.hi] }))} dataKey="r" stroke="none" fill={STATUS.critical} fillOpacity={0.18} isAnimationActive={false} activeDot={false} />
                    <Area data={detection.bands.ok.map(b => ({ x: b.x, r: [b.lo, b.hi] }))} dataKey="r" stroke="none" fill={SERIES[2]} fillOpacity={0.18} isAnimationActive={false} activeDot={false} />
                    <Line data={detection.bands.fail} dataKey="med" name="failed · median" stroke={STATUS.critical} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line data={detection.bands.ok} dataKey="med" name="passed · median" stroke={SERIES[2]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] mt-1">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 inline-block" style={{ background: STATUS.critical }} />failed: median and interquartile band ({detection.flaggedFail}/{detection.fails.length} crossed {detection.thr})</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 inline-block" style={{ background: SERIES[2] }} />passed ({detection.flaggedOk}/{detection.oks.length} false alarms)</span>
                <span className="ml-auto text-ink3">{detection.invisible} of the failures had passing visible tests</span>
              </div>
              <Note>Read this against the invisible-failure share. A watcher scores <em>conduct</em>; a wrong-but-plausible patch that satisfies the visible tests looks exactly like a right one. That share is the weak-tests distortion from exercise 5, seen from inside the run.</Note>
            </>
          )}
        </Card>

        <Card className="col-span-12 xl:col-span-3" title="Is the risk number calibrated?" right={<span>out-of-fold, 10 bins</span>}>
          {rep?.calibration ? (
            <div className="h-[200px]">
              <ResponsiveContainer>
                <ComposedChart data={rep.calibration.filter(b => b.n > 0).map(b => ({ x: b.mean_pred, y: b.fail_rate, n: b.n, bin: b.bin }))} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="x" type="number" domain={[0, 1]} tickFormatter={v => v.toFixed(1)} {...AX} />
                  <YAxis domain={[0, 1]} tickFormatter={v => v.toFixed(1)} {...AX} />
                  <Tooltip {...TT} formatter={(v, n, p) => [`${fmt.num(v, 2)} observed · ${p.payload.n} prefixes`, `bin ${p.payload.bin}`]} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={ink3} strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="y" stroke={SERIES[6]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>Train the model to see calibration.</Empty>}
          <Note>x = predicted risk, y = observed failure rate in that bin. Points on the diagonal mean "0.6" is a probability, not just a ranking; ECE {fmt.num(rep?.ece, 3)}. The model is trained with balanced class weights, so on a cell with a lopsided base rate the curve sits off the diagonal: the number ranks prefixes, it does not state the base rate.</Note>
        </Card>

        <Card className="col-span-12 xl:col-span-3" title="Does intervening help?" right={<span>X vs X+sentinel, tasks paired</span>}>
          {pairs.length === 0 ? <Empty>Launch a job with "A/B" on (or "sentinel only" into a directory that already holds the plain cells). Pairs appear here.</Empty> : (
            <Tbl nowrap>
              <thead><tr><th>cell</th><th className="text-right">Δ pass@1</th><th className="text-right">Δ verified</th><th className="text-right">Δ boundary</th></tr></thead>
              <tbody>{pairs.map(p => {
                const D = ({ d }) => <td className="text-right" style={{ color: d.ci95[0] > 0 ? STATUS.good : d.ci95[1] < 0 ? STATUS.critical : ink3 }}>{(d.mean_diff >= 0 ? '+' : '') + (d.mean_diff * 100).toFixed(0)}pp <span className="text-[10.5px] text-ink3">[{(d.ci95[0] * 100).toFixed(0)}, {(d.ci95[1] * 100).toFixed(0)}]</span></td>
                return <tr key={p.model + p.harness}><td><span className="text-ink2">{p.model.split('/').pop()}</span> · <span className="text-s7">{p.harness}</span> <span className="text-ink3">n={p.hidden_pass.n_tasks}</span></td><D d={p.hidden_pass} /><D d={p.verified} /><D d={p.boundary} /></tr>
              })}</tbody>
            </Tbl>
          )}
          <Note>Grey = the task-paired 95% interval crosses zero. Blocking a destructive command is a safety win whatever pass@1 does; a nudge that raises pass@1 is a <em>harness</em> improvement and belongs in the cell description, not in the model's score.</Note>
        </Card>
      </div>

      <Card title="Leaderboard" right={<>
        <label className="flex items-center gap-1">k <input className="input !w-24 mono !py-1" value={lbK} onChange={e => setLbK(e.target.value.replace(/[^0-9,]/g, ''))} /></label>
        <label className="flex items-center gap-1">threshold <input className="input !w-16 mono !py-1" type="number" min="0" max="1" step="0.05" value={lbThr} onChange={e => setLbThr(Number(e.target.value))} /></label>
        <button className="btn !py-1" disabled={lb.loading} title="drop the cached result for this directory and replay every model again"
          onClick={() => api(`${lbQ}&refresh=true`).then(() => setLbTick(t => t + 1))}>recompute</button>
        <button className="btn !py-1" onClick={copyLeaderboard}>{copied || 'copy as markdown'}</button>
      </>}>
        {lb.error ? <Empty>{String(lb.error.message || lb.error)}</Empty> : lb.loading && !lb.data ? <Spinner label="replaying every model on this directory" /> : !lb.data ? <Empty>Pick a results directory.</Empty> : (
          <>
            <Tbl nowrap>
              <thead><tr>
                <th>model</th>
                {lb.data.k.map(k => <th key={k} className="text-right">EW-AUC@{k}</th>)}
                <th className="text-right">recall @{lb.data.threshold}</th><th className="text-right">false alarm</th><th className="text-right">median lead</th>
              </tr></thead>
              <tbody>{lb.data.rows.map(r => (
                <tr key={r.model} className={r.active ? 'bg-accent/10' : undefined}>
                  <td className="min-w-0">
                    <span className={`mono text-[12px] ${r.active ? 'text-accent-ink font-medium' : ''}`}>{r.model}</span>
                    {r.active && <span className="ml-1.5"><Badge tone="accent">active</Badge></span>}
                    {r.in_sample && <span className="ml-1.5" title="this model was trained on this directory: the numbers are in-sample and optimistic"><Badge tone="warn">in-sample</Badge></span>}
                    {r.kind === 'rules' && <span className="ml-1.5"><Badge tone="neutral">baseline</Badge></span>}
                  </td>
                  {lb.data.k.map(k => {
                    const c = r.per_k.find(x => x.k === k)
                    return <td key={k} className="text-right">
                      <span style={{ color: c?.ew_auc == null ? ink3 : c.ew_auc >= 0.65 ? STATUS.good : c.ew_auc >= 0.55 ? STATUS.warn : ink2 }}>{fmt.num(c?.ew_auc, 2)}</span>
                      {c?.ew_auc_ci && <span className="text-[10.5px] text-ink3 ml-1">[{fmt.num(c.ew_auc_ci[0], 2)}, {fmt.num(c.ew_auc_ci[1], 2)}]</span>}
                    </td>
                  })}
                  <td className="text-right">{fmt.pct(r.overall.recall)}{r.overall.recall_ci && <span className="text-[10.5px] text-ink3 ml-1">[{fmt.pct(r.overall.recall_ci[0])}, {fmt.pct(r.overall.recall_ci[1])}]</span>}</td>
                  <td className="text-right">{fmt.pct(r.overall.false_alarm)}{r.overall.false_alarm_ci && <span className="text-[10.5px] text-ink3 ml-1">[{fmt.pct(r.overall.false_alarm_ci[0])}, {fmt.pct(r.overall.false_alarm_ci[1])}]</span>}</td>
                  <td className="text-right">{fmt.num(r.overall.median_lead, 1)}{r.overall.median_lead_ci && <span className="text-[10.5px] text-ink3 ml-1">[{fmt.num(r.overall.median_lead_ci[0], 1)}, {fmt.num(r.overall.median_lead_ci[1], 1)}]</span>}</td>
                </tr>))}</tbody>
            </Tbl>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink3 mt-2">
              <span>{lb.data.n_runs} runs · {lb.data.n_fail} eventual failures · {lb.data.n_prefixes} prefixes</span>
              {lb.data.rows[0]?.per_k.map(c => <span key={c.k}>alive at k={c.k}: n={c.n_alive} ({fmt.pct(c.fail_share)} fail)</span>)}
              <span className="ml-auto">{lb.data.cached ? 'cached' : `computed in ${fmt.num(lb.data.seconds, 1)} s`} · {lb.data.bootstrap} run-bootstrap resamples</span>
            </div>
            <Note><b>EW-AUC@k</b> is the AUC among the runs <em>still alive at step k</em>, so the step index carries no information and the length confound that gives a step-only scorer 0.65 on pooled prefixes is gone. Brackets are 95% percentile intervals from a bootstrap over runs, paired across rows (same resamples). Recall / false alarm / lead are whole-run at the threshold: a run counts as flagged if any prefix crosses it. A row marked <em>in-sample</em> was trained on this directory — read its out-of-fold numbers from the training report instead. Definition and reporting rules: <span className="mono">harnesslab/docs/early_warning_metric.md</span>.</Note>
          </>
        )}
      </Card>

      <Card title="Detectors" right={<>
        <span>{plugins.data?.n_builtin ?? '—'} built-in · {plugins.data?.n_plugin ?? '—'} from <span className="mono">harnesslab/plugins/</span></span>
        <button className="btn !py-1" onClick={() => api('/sentinel/plugins/reload', { method: 'POST' }).then(() => setPluginTick(t => t + 1))}>reload plugins</button>
      </>}>
        {plugins.data?.errors?.length > 0 && (
          <div className="mb-3 border border-critical/40 bg-critical/10 rounded-lg p-2.5 text-[11.5px] text-critical-ink">
            {plugins.data.errors.map((e, i) => <div key={i}><span className="mono">{e.file}</span> — {e.error}</div>)}
          </div>
        )}
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          {(plugins.data?.detectors || Object.entries(s.data?.patterns || {}).map(([id, p]) => ({ id, source: 'builtin', ...p }))).map(p => {
            const nRun = fires.runs[p.id] || 0, nPre = fires.prefix[p.id] || 0
            return (
              <div key={p.id + p.file} className="border border-line rounded-lg p-3 bg-panel2/40 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge tone={{ critical: 'critical', high: 'serious', medium: 'warn', low: 'neutral' }[p.severity]}>{p.severity}</Badge>
                  <Badge tone={p.source === 'builtin' ? 'neutral' : p.source === 'rule' ? 'accent' : 'violet'}>{p.source}</Badge>
                  <span className="mono text-[11px] text-ink3 truncate" title={p.id}>{p.id}</span>
                </div>
                <div className="font-medium text-[12.5px]">{p.label}</div>
                <div className="text-[11.5px] text-ink3 mt-1">{p.why}</div>
                {p.when && <div className="mono text-[10.5px] text-ink2 mt-1.5 bg-bg/60 border border-line rounded px-1.5 py-1 break-words">{p.when}</div>}
                {p.nudge && <div className="text-[11.5px] text-ink2 mt-1.5 italic">“{p.nudge}”</div>}
                <div className="flex items-center gap-2 mt-2 text-[10.5px] text-ink3 border-t border-line pt-1.5">
                  <span className={nRun ? 'text-ink2' : ''}>{!fires.nRuns ? 'replaying…' : nRun ? `fired in ${nRun}/${fires.nRuns} runs · ${nPre} prefixes` : `no fire in ${fires.nRuns} runs`}</span>
                  {p.source !== 'builtin' && <span className="mono ml-auto truncate" title={p.file}>{p.file}</span>}
                </div>
                {p.citation && <div className="text-[10.5px] text-ink3 mt-1.5">{p.citation}</div>}
              </div>
            )
          })}
        </div>
        <Note>Counts come from the replay of <span className="mono">{results}</span>{harness ? <> · <span className="mono">{harness}</span></> : null} above, so they are what these detectors would have said while those runs were being written. Plugins are hot-reloaded on mtime change and take part in live runs and replays through the same <span className="mono">score()</span> call as the built-ins; a plugin that raises is caught and reported here instead of stopping the run. A detector that never fires costs nothing but tells you nothing — and one that fires on almost every prefix is a false-alarm machine, which is what the leaderboard's rules-only row measures.</Note>
      </Card>
    </div>
  )
}
