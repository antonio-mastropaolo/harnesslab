import { useEffect, useMemo, useState } from 'react'
import { api, useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Stat, Badge, Empty, Toggle, RiskBar, riskTone, Note, Kbd, useChartTheme } from '../ui'

const TOOL_GLYPH = { list_files: '≡', read_file: '👁', write_file: '✎', edit_file: '✎', run_tests: '⚗', bash: '$', submit: '⏎' }

export default function CommandCenter() {
  const { overview, events, results, setResults, reloadOverview, go } = useApp()
  const models = useFetch('/models', [overview?.key_present])
  const [sel, setSel] = useState({ models: ['mock'], harnesses: ['baseline'], tasks: [], repeats: 3, parallel: 4, max_cost_usd: 10 })
  const [out, setOut] = useState('mine')
  const [sentinel, setSentinel] = useState({ enabled: true, mode: 'intervene', threshold: 0.6, llm: { enabled: false, model: 'openai/gpt-5-mini' } })
  const [ab, setAb] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    if (overview?.tasks?.length) setSel(s => ({ ...s, tasks: overview.tasks.slice(0, 5).map(t => t.id) }))
  }, [overview?.tasks?.length])

  const toggle = (k, v) => setSel(s => ({ ...s, [k]: s[k].includes(v) ? s[k].filter(x => x !== v) : [...s[k], v] }))
  const nRuns = sel.models.length * sel.harnesses.length * (ab ? 2 : 1) * sel.tasks.length * sel.repeats
  const est = useMemo(() => {
    const ms = models.data?.models || []
    const obs = models.data?.observed || {}
    let usd = 0, observed = 0
    for (const m of sel.models) {
      if (m === 'mock') continue
      const cells = sel.harnesses.length * (ab ? 2 : 1) * sel.tasks.length * sel.repeats
      if (obs[m]?.runs >= 3) { usd += obs[m].cost_per_run * cells; observed++; continue }   // observed mean cost per run
      const mm = ms.find(x => x.id === m)
      if (!mm) continue
      // 8 calls × 3k in + 300 out is the lab's rule of thumb for a small run
      usd += (8 * 3000 / 1e6 * (mm.price_in || 0) + 8 * 300 / 1e6 * (mm.price_out || 0)) * cells
    }
    return { usd, observed, total: sel.models.filter(m => m !== 'mock').length }
  }, [sel, ab, models.data])

  async function launch() {
    setBusy(true); setErr('')
    try {
      await api('/jobs', { method: 'POST', body: { out, models: sel.models, harnesses: sel.harnesses, tasks: sel.tasks, repeats: sel.repeats, parallel: sel.parallel, max_cost_usd: sel.max_cost_usd, sentinel, sentinel_ab: ab } })
      setResults(out)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function saveKey() {
    await api('/settings/key', { method: 'POST', body: { key } })
    setKey(''); setShowKey(false); reloadOverview(); models.reload()
  }

  const runs = Object.values(events.runs).sort((a, b) => b.started - a.started)
  const running = runs.filter(r => r.status === 'running')
  const done = runs.filter(r => r.status !== 'running')
  const passed = done.filter(r => r.summary?.hidden_pass).length
  const interventions = runs.reduce((n, r) => n + r.spans.filter(s => s.span === 'sentinel' && s.action && s.action !== 'none').length, 0)
  const spend = done.reduce((n, r) => n + (r.summary?.cost_usd || 0), 0)
  const jobs = Object.values(events.jobs).concat(overview?.jobs?.filter(j => !events.jobs[j.id]) || []).sort((a, b) => b.created_at - a.created_at)

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ------------------------------------------------ launch matrix */}
      <div className="col-span-12 xl:col-span-4 space-y-4">
        <Card title="Launch a measurement cell" right={<span>{nRuns} runs · est {est.usd ? fmt.usd(est.usd, 2) : '$0'}{est.total ? (est.observed === est.total ? ' (observed)' : ' (rule of thumb)') : ''}</span>}>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-ink3 mb-1.5 flex justify-between"><span>models (OpenRouter ids)</span>
                {!overview?.key_present && <button className="text-warn hover:underline" onClick={() => setShowKey(v => !v)}>set key</button>}
                {overview?.key_present && <button className="text-ink3 hover:text-ink" onClick={() => setShowKey(v => !v)}>change key</button>}
              </div>
              {showKey && (
                <div className="flex gap-2 mb-2">
                  <input className="input mono" type="password" placeholder="sk-or-v1-…" value={key} onChange={e => setKey(e.target.value)} />
                  <button className="btn btn-primary" onClick={saveKey} disabled={!key}>save</button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(models.data?.models || [{ id: 'mock', family: 'Mock', available: true }]).map(m => (
                  <button key={m.id} onClick={() => toggle('models', m.id)} disabled={!m.available && m.id !== 'mock'}
                    title={m.price_in != null ? `$${m.price_in?.toFixed(2)} / $${m.price_out?.toFixed(2)} per M tokens` : ''}
                    className={`chip cursor-pointer transition-colors ${sel.models.includes(m.id) ? 'border-accent text-accent-ink bg-accent/15' : 'border-line2 text-ink2 hover:border-ink3'} disabled:opacity-30`}>
                    <span className="text-ink3">{m.family}</span> {m.id.split('/').pop()}
                  </button>
                ))}
                <input className="input !w-44 !py-0.5 mono" placeholder="any OpenRouter id ↵" onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { toggle('models', e.target.value.trim()); e.target.value = '' } }} />
                {sel.models.filter(m => !(models.data?.models || []).some(x => x.id === m)).map(m => <button key={m} onClick={() => toggle('models', m)} className="chip cursor-pointer border-accent text-accent-ink bg-accent/15 mono">{m} ×</button>)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink3 mb-1.5">harnesses</div>
              <div className="flex flex-wrap gap-1.5">
                {(overview?.harnesses || []).map(h => (
                  <button key={h.id} onClick={() => toggle('harnesses', h.id)} title={h.notes}
                    className={`chip cursor-pointer ${sel.harnesses.includes(h.id) ? 'border-s7 text-s7 bg-s7/15' : 'border-line2 text-ink2 hover:border-ink3'}`}>{h.id}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink3 mb-1.5">tasks</div>
              <div className="flex flex-wrap gap-1.5">
                {(overview?.tasks || []).map(t => (
                  <button key={t.id} onClick={() => toggle('tasks', t.id)} title={t.title}
                    className={`chip cursor-pointer ${sel.tasks.includes(t.id) ? 'border-s3 text-s3-ink bg-s3/15' : 'border-line2 text-ink2 hover:border-ink3'}`}>
                    {t.id.slice(0, 3)} {t.id.slice(4)}{t.probe && t.probe !== 'none' && <span className="text-ink3">·{t.probe.replace('_', ' ').split(' ')[0]}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <label className="text-[11px] text-ink3">repeats<input className="input mt-1" type="number" min={1} max={20} value={sel.repeats} onChange={e => setSel(s => ({ ...s, repeats: +e.target.value }))} /></label>
              <label className="text-[11px] text-ink3">parallel<input className="input mt-1" type="number" min={1} max={8} value={sel.parallel} onChange={e => setSel(s => ({ ...s, parallel: +e.target.value }))} /></label>
              <label className="text-[11px] text-ink3" title="the job stops submitting work once its ledger cost reaches this">max spend $<input className="input mt-1" type="number" min={0} step={0.5} value={sel.max_cost_usd} onChange={e => setSel(s => ({ ...s, max_cost_usd: +e.target.value }))} /></label>
              <label className="text-[11px] text-ink3">results dir<input className="input mt-1 mono" value={out} onChange={e => setOut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} /></label>
            </div>
            <div className="border-t border-line pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink3">sentinel</span>
                <Toggle checked={sentinel.enabled} onChange={v => setSentinel(s => ({ ...s, enabled: v }))} label={sentinel.enabled ? 'on' : 'off'} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <label className="text-[11px] text-ink3">mode
                  <select className="input mt-1" value={sentinel.mode} onChange={e => setSentinel(s => ({ ...s, mode: e.target.value }))}>
                    <option value="intervene">intervene (nudge / block / abort)</option>
                    <option value="flag">flag only (no confound)</option>
                  </select></label>
                <label className="text-[11px] text-ink3">nudge threshold <span className="mono text-ink2">{sentinel.threshold.toFixed(2)}</span>
                  <input className="w-full mt-2" type="range" min={0.3} max={0.95} step={0.05} value={sentinel.threshold} onChange={e => setSentinel(s => ({ ...s, threshold: +e.target.value }))} /></label>
              </div>
              <div className="flex items-center justify-between">
                <Toggle checked={sentinel.llm.enabled} onChange={v => setSentinel(s => ({ ...s, llm: { ...s.llm, enabled: v } }))} label="LLM sentinel (second model reads the partial trajectory)" />
              </div>
              {sentinel.llm.enabled && <input className="input mono" value={sentinel.llm.model} onChange={e => setSentinel(s => ({ ...s, llm: { ...s.llm, model: e.target.value } }))} />}
              <Toggle checked={ab} onChange={setAb} label={<span>A/B: also run each harness <em>without</em> the sentinel (paired comparison)</span>} />
            </div>
            {err && <div className="text-critical text-[12px]">{err}</div>}
            <button className="btn btn-primary w-full justify-center py-2" onClick={launch} disabled={busy || !sel.models.length || !sel.harnesses.length || !sel.tasks.length}>
              {busy ? 'launching…' : `Launch ${nRuns} runs → data/runs/${out}`}
            </button>
            <Note>Every run writes <code>ledger.jsonl</code>, <code>patch.diff</code>, <code>messages.json</code> exactly like <code>harnesslab.core.runner</code>; the exercises read the same index. The sentinel is part of the harness, so its verdicts are spans in the ledger.</Note>
          </div>
        </Card>
        {jobs.length > 0 && (
          <Card title="Jobs">
            <div className="space-y-1.5">
              {jobs.slice(0, 6).map(j => (
                <div key={j.id} className="flex items-center gap-2 text-[12px]">
                  <Badge tone={j.status === 'running' ? 'accent' : j.status === 'finished' ? 'good' : j.status === 'error' ? 'critical' : j.status === 'stopped' ? 'warn' : 'neutral'} dot={j.status === 'running'}>{j.status}</Badge>
                  <span className="mono text-ink2">{j.out}</span>
                  <span className="text-ink3">{j.models.map(m => m.split('/').pop()).join(', ')} · {j.harnesses.join(', ')}</span>
                  {j.stop_reason && <span className="text-warn-ink">{j.stop_reason}</span>}
                  <span className="ml-auto tabular-nums text-ink2">{j.done}/{j.total || '?'}{j.spent ? ` · ${fmt.usd(j.spent, 3)}` : ''}</span>
                  {j.status === 'running' && <button className="text-ink3 hover:text-critical" onClick={() => api(`/jobs/${j.id}/cancel`, { method: 'POST' })}>cancel</button>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ------------------------------------------------ live */}
      <div className="col-span-12 xl:col-span-8 space-y-4">
        <div className="stats">
          <Stat label="running" value={running.length} sub="model calls in flight" />
          <Stat label="finished" value={done.length} sub={`${passed} passed hidden tests`} />
          <Stat label="pass rate (session)" value={done.length ? fmt.pct(passed / done.length) : '—'} tone={done.length ? (passed / done.length > 0.6 ? 'good' : 'warn') : undefined} sub="not a leaderboard number" />
          <Stat label="interventions" value={interventions} sub="nudges · blocks · aborts" tone={interventions ? 'serious' : undefined} />
          <Stat label="spend" value={fmt.usd(spend, 3)} sub="derived from tokens × price" />
        </div>
        <Card title="Live runs" right={<>{runs.length > 0 && <button className="hover:text-ink" onClick={events.clear}>clear</button>}<span>{runs.length} this session</span></>} pad={false}>
          {runs.length === 0 ? <div className="p-4"><Empty>No runs yet in this session. Launch a cell on the left — the mock provider works without a key — and watch each trajectory unfold step by step with its risk score.</Empty></div> : (
            <div className="divide-y divide-line">
              {runs.slice(0, 40).map(r => <LiveRun key={r.meta.run_id} r={r} threshold={sentinel.threshold} onOpen={() => go('explorer', `${results}/${r.meta.run_id}`)} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function LiveRun({ r, threshold, onOpen }) {
  const { STATUS } = useChartTheme()
  const tools = r.spans.filter(s => s.span === 'execute_tool')
  const sentinels = r.spans.filter(s => s.span === 'sentinel')
  const lastRisk = sentinels.length ? sentinels[sentinels.length - 1].risk : null
  const acts = sentinels.filter(s => s.action && s.action !== 'none')
  const steps = r.spans.filter(s => s.span === 'chat').length
  const tok = r.spans.filter(s => s.span === 'chat').reduce((n, s) => n + (s['gen_ai.usage.input_tokens'] || 0) + (s['gen_ai.usage.output_tokens'] || 0), 0)
  const bnd = r.spans.filter(s => s.span === 'boundary_event')
  const s = r.summary
  return (
    <div className="px-4 py-2.5 grid grid-cols-12 gap-3 items-center hover:bg-panel2/40 cursor-pointer" onClick={onOpen}>
      <div className="col-span-3 min-w-0">
        <div className="flex items-center gap-2">
          {r.status === 'running' ? <span className="w-2 h-2 rounded-full bg-accent live shrink-0" /> :
            r.status === 'error' ? <span className="w-2 h-2 rounded-full bg-critical shrink-0" /> :
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s?.hidden_pass ? STATUS.good : STATUS.critical }} />}
          <span className="font-medium text-[12.5px] truncate">{r.meta.task}</span>
          <span className="text-ink3 text-[11px]">r{r.meta.repeat}</span>
        </div>
        <div className="text-[11px] text-ink3 truncate mt-0.5">{r.meta.model.split('/').pop()} · <span className="text-s7">{r.meta.harness}</span></div>
      </div>
      <div className="col-span-3 flex items-center gap-[3px] flex-wrap">
        {tools.map((t, i) => {
          const name = t['gen_ai.tool.name']
          const bad = t.status === 'blocked' || t.status === 'error' || t.status === 'sentinel_blocked'
          const isTest = name === 'run_tests' || (name === 'bash' && /pytest|unittest/.test(t.args?.command || ''))
          const failed = isTest && t.tests_passed === false
          return <span key={i} title={`${name} ${JSON.stringify(t.args || {}).slice(0, 100)} → ${t.status}${t.tests_passed != null ? ' tests_passed=' + t.tests_passed : ''}`}
            className={`w-5 h-5 rounded text-[10px] flex items-center justify-center mono border ${t.status === 'sentinel_blocked' ? 'border-s7 text-s7 bg-s7/20' : bad ? 'border-critical/60 text-critical-ink bg-critical/15' : failed ? 'border-warn/60 text-warn bg-warn/10' : isTest ? 'border-s3/60 text-s3-ink bg-s3/10' : name === 'submit' ? 'border-ink2 text-ink bg-panel2' : 'border-line2 text-ink2 bg-panel2'}`}>
            {TOOL_GLYPH[name] || '·'}</span>
        })}
        {acts.map((a, i) => <span key={'a' + i} title={`sentinel ${a.action}: ${a.text}`} className="h-5 px-1.5 rounded text-[10px] flex items-center mono border border-s7 text-s7 bg-s7/20">{a.action}</span>)}
        {r.status === 'running' && <span className="w-5 h-5 rounded border border-dashed border-line2 animate-pulse" />}
      </div>
      <div className="col-span-2"><RiskBar risk={lastRisk} threshold={threshold} width={90} /></div>
      <div className="col-span-4 flex items-center gap-2 justify-end text-[11.5px] text-ink3 tabular-nums whitespace-nowrap">
        <span>{steps} st</span><span>{fmt.int(tok)} tok</span>
        {bnd.length > 0 && <Badge tone="critical">{bnd.length} boundary</Badge>}
        {s && <Badge tone={s.hidden_pass ? 'good' : 'critical'}>{s.hidden_pass ? 'PASS' : 'fail'}</Badge>}
        {s && <span className="mono" title={s.error || ''}>{s.exit_reason}</span>}
        {s?.error && <span className="text-critical-ink truncate max-w-[220px]" title={s.error}>{s.error.replace(/^\w+Error: /, '').slice(0, 60)}</span>}
        {r.status === 'error' && <Badge tone="critical">error</Badge>}
      </div>
    </div>
  )
}
