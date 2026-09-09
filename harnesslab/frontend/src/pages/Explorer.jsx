import { useEffect, useMemo, useRef, useState } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, ReferenceDot } from 'recharts'
import { useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Stat, Badge, Empty, Spinner, RiskBar, Note, Tbl, Kbd, useChartTheme } from '../ui'

export default function Explorer() {
  const { results, harness, route, go, events } = useApp()
  const parts = route.arg ? route.arg.split('/') : []
  if (parts[0] === 'fork' && parts.length === 4) return <Fork dir={parts[1]} a={parts[2]} b={parts[3]} back={() => go('explorer')} />
  if (parts[0] === 'compare' && parts.length === 4) return <Compare dir={parts[1]} a={parts[2]} b={parts[3]} back={() => go('explorer')} />
  const [dirArg, runArg] = parts
  if (runArg) return <RunDetail dir={dirArg} runId={runArg} back={() => go('explorer')} />
  return <RunList results={results} harness={harness} open={(id) => go('explorer', `${results}/${id}`)}
    compare={(a, b) => go('explorer', `compare/${results}/${a}/${b}`)} fork={(a, b) => go('explorer', `fork/${results}/${a}/${b}`)} tick={events.tick} />
}

function RunList({ results, harness, open, compare, fork, tick }) {
  const { STATUS } = useChartTheme()
  const [filter, setFilter] = useState({ outcome: 'all', task: '', q: '', allH: false })
  const [pairs, setPairs] = useState(false)
  const [sel, setSel] = useState([])
  const toggleSel = (id) => setSel(x => x.includes(id) ? x.filter(y => y !== id) : [...x.slice(-1), id])
  const r = useFetch(results ? `/results/${results}/runs${filter.allH ? '' : '?harness=' + harness}` : null, [results, harness, filter.allH, tick])
  const rows = useMemo(() => (r.data || []).filter(x => (filter.outcome === 'all' || (filter.outcome === 'pass') === !!x.hidden_pass) && (!filter.task || x.task_id === filter.task) && (!filter.q || JSON.stringify(x).includes(filter.q)))
    .sort((a, b) => b.started_at.localeCompare(a.started_at)), [r.data, filter])
  if (!results) return <Empty>No results directory yet.</Empty>
  if (r.loading && !r.data) return <Spinner />
  const tasks = [...new Set((r.data || []).map(x => x.task_id))].sort()
  return (
    <div className="space-y-4">
    {pairs && <PairPicker dir={results} fork={fork} close={() => setPairs(false)} />}
    <Card title={`${rows.length} trajectories`} right={<>
      {sel.length === 2 && <button className="btn btn-primary !py-0.5" onClick={() => fork(sel[0], sel[1])}>fork selected</button>}
      {sel.length === 2 && <button className="btn !py-0.5" onClick={() => compare(sel[0], sel[1])}>compare selected</button>}
      {sel.length === 1 && <span className="text-ink3">select one more run to compare</span>}
      <button className={`btn !py-0.5 ${pairs ? 'btn-primary' : ''}`} onClick={() => setPairs(v => !v)}>paired twins…</button>
      <select className="input !w-auto !py-0.5" value={filter.outcome} onChange={e => setFilter(f => ({ ...f, outcome: e.target.value }))}><option value="all">all outcomes</option><option value="pass">passed</option><option value="fail">failed</option></select>
      <select className="input !w-auto !py-0.5" value={filter.task} onChange={e => setFilter(f => ({ ...f, task: e.target.value }))}><option value="">all tasks</option>{tasks.map(t => <option key={t}>{t}</option>)}</select>
      <label className="flex items-center gap-1 text-ink3"><input type="checkbox" checked={filter.allH} onChange={e => setFilter(f => ({ ...f, allH: e.target.checked }))} /> all harnesses</label>
      <input className="input !w-40 !py-0.5" placeholder="search…" value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} />
    </>} pad={false}>
      <div className="overflow-auto max-h-[calc(100vh-180px)]">
        <table className="tbl tbl-nowrap">
          <thead className="sticky top-0 bg-panel"><tr><th></th><th></th><th>task</th><th>harness</th><th>model</th><th className="text-right">steps</th><th className="text-right">tokens</th><th className="text-right">cost</th><th>exit</th><th className="text-right">boundary</th><th className="text-right">interv.</th><th>max risk</th><th>verified</th><th>oracle</th></tr></thead>
          <tbody>
            {rows.map(x => (
              <tr key={x.run_id} className="cursor-pointer" onClick={() => open(x.run_id)}>
                <td onClick={e => { e.stopPropagation(); toggleSel(x.run_id) }}><input type="checkbox" readOnly checked={sel.includes(x.run_id)} className="cursor-pointer" /></td>
                <td><span className="w-2 h-2 rounded-full inline-block" style={{ background: x.hidden_pass ? STATUS.good : STATUS.critical }} /></td>
                <td className="mono text-[12px]">{x.task_id}<span className="text-ink3"> r{x.repeat_index}</span></td>
                <td className="text-s7">{x.harness_id}</td>
                <td className="text-ink2">{x.model.split('/').pop()}</td>
                <td className="text-right">{x.steps}</td>
                <td className="text-right text-ink2">{fmt.int(x.input_tokens + x.output_tokens)}</td>
                <td className="text-right text-ink2">{fmt.usd(x.cost_usd)}</td>
                <td className="mono text-[11.5px]">{x.exit_reason}</td>
                <td className="text-right">{x.boundary_events ? <Badge tone="critical">{x.boundary_events}</Badge> : <span className="text-ink3">0</span>}</td>
                <td className="text-right">{x.sentinel_interventions ? <Badge tone="violet">{x.sentinel_interventions}</Badge> : <span className="text-ink3">0</span>}</td>
                <td>{x.sentinel_max_risk ? <RiskBar risk={x.sentinel_max_risk} width={60} /> : <span className="text-ink3 text-[11px]">no hook</span>}</td>
                <td>{x.ran_tests_before_submit ? <span className="text-good-ink">yes</span> : <span className="text-warn">no</span>}</td>
                <td><span className="text-ink3 text-[11px]">vis {x.visible_pass ? '✓' : '✗'} · hid {x.hidden_pass ? '✓' : '✗'} · strong {x.strong_pass ? '✓' : '✗'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    </div>
  )
}

const PAIR_KINDS = [
  { id: 'twin', label: 'seed-paired twins', hint: 'X vs X+sentinel, same task, same seed — the hook is the only difference' },
  { id: 'repeat', label: 'repeats', hint: 'same task, harness and model — anything that differs is sampling' },
  { id: 'harness', label: 'across harnesses', hint: 'same task and model, different harness — the hidden variable' },
]

/** Candidate pairs to fork, straight from /api/fork/{dir}/pairs. */
function PairPicker({ dir, fork, close }) {
  const [kind, setKind] = useState('twin')
  const p = useFetch(dir ? `/fork/${dir}/pairs?limit=80` : null, [dir])
  const counts = p.data?.counts || {}
  useEffect(() => { if (p.data && !counts.twin) setKind(counts.repeat ? 'repeat' : 'harness') }, [p.data]) // eslint-disable-line
  const list = p.data?.pairs?.[kind] || []
  return (
    <Card title="Pick a pair to fork" pad={false} right={<>
      {PAIR_KINDS.map(k => <button key={k.id} className={`px-2 py-0.5 rounded ${kind === k.id ? 'bg-panel2 text-ink' : 'hover:text-ink'}`} onClick={() => setKind(k.id)}>{k.label} <span className="text-ink3">{counts[k.id] ?? '·'}</span></button>)}
      <button className="hover:text-ink ml-2" onClick={close}>close</button>
    </>}>
      <div className="px-4 pt-2 text-[12px] text-ink3">{PAIR_KINDS.find(k => k.id === kind).hint}</div>
      {p.loading && !p.data && <Spinner />}
      {p.error && <div className="p-4"><Empty>{p.error.message}</Empty></div>}
      {p.data && list.length === 0 && <div className="p-4"><Empty>no {kind} pairs in {dir}{kind === 'twin' ? ' — run a job with the A/B toggle to make some' : ''}</Empty></div>}
      {list.length > 0 && (
        <div className="max-h-[38vh] overflow-auto mt-2">
          <Tbl nowrap><thead className="sticky top-0 bg-panel"><tr><th>task</th><th>model</th><th>A</th><th>B</th><th className="text-right">seed</th><th className="text-right">steps</th><th>outcome</th><th>interv.</th><th></th></tr></thead>
            <tbody>
              {list.map((x, i) => (
                <tr key={i} className="cursor-pointer" onClick={() => fork(x.a, x.b)}>
                  <td className="mono text-[11.5px]">{x.task}</td>
                  <td className="text-ink2">{String(x.model).split('/').pop()}</td>
                  <td className="text-s7">{x.harness_a}<span className="text-ink3"> r{x.repeat_a}</span></td>
                  <td className="text-s7">{x.harness_b}<span className="text-ink3"> r{x.repeat_b}</span></td>
                  <td className="text-right mono text-[11px]">{x.seed_matched ? <span className="text-good-ink">matched</span> : <span className="text-ink3">{x.seed_a == null ? 'none' : 'differ'}</span>}</td>
                  <td className="text-right text-ink2">{x.steps_a} / {x.steps_b}</td>
                  <td>{x.flip ? <Badge tone="warn">flip {x.pass_a ? 'PASS→fail' : 'fail→PASS'}</Badge> : <span className="text-ink3 text-[11px]">both {x.pass_a ? 'pass' : 'fail'}</span>}</td>
                  <td>{(x.interventions_a + x.interventions_b) ? <Badge tone="violet">{x.interventions_a + x.interventions_b}</Badge> : <span className="text-ink3">0</span>}</td>
                  <td className="text-accent-ink">fork →</td>
                </tr>
              ))}
            </tbody></Tbl>
        </div>
      )}
      {p.data && <div className="px-4 pb-3"><Note>{p.data.seeds_present} of {p.data.runs} runs record a seed in their <span className="mono">invoke_agent</span> start span. A twin pair only counts as a controlled comparison when the seeds match <i>and</i> the provider is deterministic; the fork view says so for the pair you pick.</Note></div>}
    </Card>
  )
}

const SPAN_TONE = { chat: 'text-ink', execute_tool: 'text-ink2', edit: 'text-s3-ink', boundary_event: 'text-critical-ink', sentinel: 'text-s7', grade: 'text-ink', invoke_agent: 'text-ink3' }

function RunDetail({ dir, runId, back }) {
  const d = useFetch(`/results/${dir}/runs/${runId}`)
  const fk = useFetch(`/fork/${dir}/state/${runId}`, [dir, runId])
  const [tab, setTab] = useState('timeline')
  const [cursor, setCursor] = useState(null)
  const [showIssue, setShowIssue] = useState(false)
  const { TT, AX, GRID, SERIES, STATUS, riskColor, ink, ink3, panel } = useChartTheme()
  if (d.loading && !d.data) return <Spinner label="loading ledger" />
  if (d.error) return <Empty>{d.error.message}</Empty>
  const { summary: s, spans, patch, messages, replay, issue } = d.data
  const harness = spans[0]?.harness || {}
  const steps = spans.filter(x => x.span === 'chat')
  const curve = replay.map(r => ({ step: r.step, risk: r.risk, pats: r.patterns, pending: r.pending.join(','), recorded: r.recorded, rec: r.recorded ? r.recorded.risk : null }))
  const interventions = spans.filter(x => x.span === 'sentinel' && x.action && x.action !== 'none')
  const lastEdit = Math.max(-1, ...spans.filter(x => x.span === 'edit').map(x => stepOf(spans, x)))
  const lastTest = Math.max(-1, ...spans.filter(x => x.span === 'execute_tool' && (x['gen_ai.tool.name'] === 'run_tests' || /pytest|unittest/.test(x.args?.command || ''))).map(x => stepOf(spans, x)))
  const unverified = lastEdit >= 0 && lastEdit >= lastTest
  const thr = harness.sentinel?.threshold ?? 0.6

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn" onClick={back}>← all trajectories</button>
        <span className="mono text-[12px] text-ink3">{dir}/{runId}</span>
        <span className="font-semibold">{s.task_id}</span>
        <Badge tone="violet">{s.harness_id}</Badge>
        <span className="text-ink2">{s.model}</span>
        <span className="ml-auto" />
        <Badge tone={s.hidden_pass ? 'good' : 'critical'}>hidden {s.hidden_pass ? 'PASS' : 'fail'}</Badge>
        <Badge tone={s.visible_pass ? 'good' : 'critical'}>visible {s.visible_pass ? 'pass' : 'fail'}</Badge>
        <Badge tone={s.strong_pass ? 'good' : 'warn'}>strong {s.strong_pass ? 'pass' : 'fail'}</Badge>
        <span className="mono text-[12px]">{s.exit_reason}</span>
      </div>
      <div className="stats">
        <Stat small label="steps" value={s.steps} sub={`${s.tool_calls} tool calls`} />
        <Stat small label="tokens" value={fmt.int(s.input_tokens + s.output_tokens)} sub={`${fmt.int(s.input_tokens)} in · ${fmt.int(s.output_tokens)} out`} />
        <Stat small label="cost" value={fmt.usd(s.cost_usd)} sub={fmt.ms(s.wall_ms)} />
        <Stat small label="edits" value={s.edits} sub={`+${s.lines_added} −${s.lines_removed} · ${s.files_touched.length} file${s.files_touched.length === 1 ? '' : 's'}`} />
        <Stat small label="verified after last edit" value={unverified ? 'no' : 'yes'} tone={unverified ? 'warn' : 'good'} sub={`edit@${lastEdit} · test@${lastTest}`} />
        <Stat small label="boundary events" value={s.boundary_events} tone={s.boundary_events ? 'critical' : undefined} sub={[...new Set(s.boundary_kinds)].join(', ') || 'none'} />
        <Stat small label="sentinel" value={interventions.length ? `${interventions.length} interv.` : (spans.some(x => x.span === 'sentinel') ? 'watched' : 'replay only')} tone={interventions.length ? 'serious' : undefined} sub={`max risk ${fmt.num(Math.max(0, ...curve.map(c => c.risk)), 2)}`} />
      </div>

      <Card title="Risk over the trajectory" right={<span>{spans.some(x => x.span === 'sentinel') ? 'solid = recorded live verdicts; ' : ''}replay = what the current sentinel would have said at each step, before that step's tools ran</span>}>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <ComposedChart data={curve} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="step" {...AX} label={{ value: 'step (model call)', fill: ink3, fontSize: 11, position: 'insideBottomRight', dy: 8 }} />
              <YAxis domain={[0, 1]} {...AX} />
              <Tooltip {...TT} content={({ active, payload }) => active && payload?.length ? (
                <div style={TT.contentStyle} className="p-2">
                  <div className="text-ink3">step {payload[0].payload.step} · pending: <span className="mono">{payload[0].payload.pending || 'none'}</span></div>
                  <div>risk <b>{payload[0].payload.risk.toFixed(2)}</b></div>
                  {payload[0].payload.pats.length > 0 && <div className="text-s7">{payload[0].payload.pats.join(', ')}</div>}
                  {payload[0].payload.recorded?.action && payload[0].payload.recorded.action !== 'none' && <div className="text-serious">live: {payload[0].payload.recorded.action}</div>}
                </div>) : null} />
              <ReferenceArea y1={thr} y2={1} fill={STATUS.critical} fillOpacity={0.06} />
              <ReferenceLine y={thr} stroke={STATUS.serious} strokeDasharray="3 3" label={{ value: `nudge ≥ ${thr}`, fill: STATUS.serious, fontSize: 10, position: 'insideBottomRight' }} />
              {lastEdit >= 0 && <ReferenceLine x={lastEdit} stroke={SERIES[2]} label={{ value: 'last edit', fill: SERIES[2], fontSize: 10, position: 'top' }} />}
              {lastTest >= 0 && <ReferenceLine x={lastTest} stroke={SERIES[0]} label={{ value: 'last test', fill: SERIES[0], fontSize: 10, position: 'insideTop' }} />}
              <Line type="monotone" dataKey="risk" stroke={SERIES[6]} strokeWidth={2} dot={(p) => <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload.pats.length ? 5 : 3} fill={riskColor(p.payload.risk)} stroke={panel} strokeWidth={2} />} isAnimationActive={false} />
              {curve.some(c => c.recorded) && <Line type="monotone" dataKey="rec" name="recorded live" stroke={ink} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 3, fill: ink, strokeWidth: 0 }} isAnimationActive={false} connectNulls />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {interventions.length > 0 && (
          <div className="mt-2 space-y-1">
            {interventions.map((iv, i) => <div key={i} className="text-[12px] flex gap-2 items-start"><Badge tone="violet">step {iv.step} · {iv.action}</Badge><span className="text-ink2">{iv.reason}</span><span className="text-ink3 italic">"{iv.text}"</span>{iv.llm && !iv.llm.error && <Badge tone="accent">LLM {iv.llm.model?.split('/').pop()} risk {iv.llm.risk}</Badge>}</div>)}
          </div>
        )}
      </Card>

      {fk.data && fk.data.state.length > 0 && <TimeTravel data={fk.data} cursor={cursor} setCursor={setCursor} />}

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-7" title="Ledger" right={<div className="flex gap-1">{cursor != null && <button className="hover:text-ink text-ink3" onClick={() => setCursor(null)}>clear step focus</button>}{['timeline', 'messages', 'raw'].map(t => <button key={t} className={`px-2 py-0.5 rounded ${tab === t ? 'bg-panel2 text-ink' : 'hover:text-ink'}`} onClick={() => setTab(t)}>{t}</button>)}</div>} pad={false}>
          <div className="max-h-[70vh] overflow-auto">
            {tab === 'timeline' && <Timeline spans={spans} focusStep={cursor} />}
            {tab === 'messages' && <pre className="mono text-[11px] p-4 whitespace-pre-wrap text-ink2">{JSON.stringify(messages, null, 1)}</pre>}
            {tab === 'raw' && <pre className="mono text-[11px] p-4 whitespace-pre-wrap text-ink2">{spans.map(x => JSON.stringify(x)).join('\n')}</pre>}
          </div>
        </Card>
        <div className="col-span-12 xl:col-span-5 space-y-4">
          <Card title="Patch" right={<span>{s.patch_bytes} bytes {s.tests_modified && <Badge tone="critical">tests modified</Badge>}</span>} pad={false}>
            <pre className="mono text-[11.5px] p-3 max-h-[40vh] overflow-auto leading-[1.5]">
              {(patch || '(empty patch)').split('\n').map((l, i) => <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'text-good-ink bg-good/10' : l.startsWith('-') && !l.startsWith('---') ? 'text-critical-ink bg-critical/10' : l.startsWith('@@') ? 'text-s1' : 'text-ink3'}>{l || ' '}</div>)}
            </pre>
          </Card>
          <Card title="Issue as the agent saw it" right={<button className="hover:text-ink" onClick={() => setShowIssue(v => !v)}>{showIssue ? 'hide' : 'show'}</button>}>
            {showIssue ? <pre className="text-[12px] whitespace-pre-wrap text-ink2 leading-relaxed">{issue}</pre> : <div className="text-[12px] text-ink3">{issue.split('\n')[0]}</div>}
            <Note>Harness for this run: tools {harness.tools?.join(', ')}; policy {harness.policy}; max_steps {harness.max_steps}; context_window {harness.context_window || 'full'}; sentinel {harness.sentinel?.enabled ? 'on' : 'off'}. All of it is in span 0.</Note>
          </Card>
        </div>
      </div>
    </div>
  )
}

function stepOf(spans, x) {
  // the step of the chat span preceding this span
  let st = -1
  for (const s of spans) { if (s.span === 'chat') st = s.step; if (s === x) return st }
  return st
}

function Timeline({ spans, focusStep = null }) {
  const [open, setOpen] = useState(null)
  const { riskColor } = useChartTheme()
  const anchor = useRef(null)
  // the step each span belongs to, so the scrubber can highlight a whole step's worth of spans
  const owner = useMemo(() => spans.reduce((acc, s) => {
    if (s.span === 'chat') acc.chat = s.step ?? acc.chat + 1
    acc.out.push(s.span === 'sentinel' && s.step != null ? s.step : acc.chat)
    return acc
  }, { chat: -1, out: [] }).out, [spans])
  const firstLit = useMemo(() => focusStep == null ? -1 : owner.indexOf(focusStep), [owner, focusStep])
  useEffect(() => { if (firstLit >= 0 && anchor.current) anchor.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [firstLit])
  return (
    <ol className="divide-y divide-line/60">
      {spans.map((x, i) => {
        const k = x.span
        const lit = focusStep != null && owner[i] === focusStep
        const ref = i === firstLit ? anchor : null
        const name = x['gen_ai.tool.name']
        const head = k === 'chat' ? <span>step {x.step} · <span className="text-ink2">{x.text?.slice(0, 120) || <i className="text-ink3">(no text)</i>}</span> → <span className="mono text-s1">{(x.tool_calls || []).map(t => t.name).join(', ') || <span className="text-critical">no tool call</span>}</span></span>
          : k === 'execute_tool' ? <span><span className="mono text-s1">{name}</span> <span className="mono text-ink3">{JSON.stringify(x.args || {}).slice(0, 90)}</span> <Badge tone={x.status === 'ok' ? 'neutral' : x.status === 'sentinel_blocked' ? 'violet' : 'critical'}>{x.status}</Badge>{x.tests_passed != null && <Badge tone={x.tests_passed ? 'good' : 'warn'}>tests {x.tests_passed ? 'passed' : 'failed'}</Badge>}</span>
            : k === 'edit' ? <span>edited <span className="mono">{x.path}</span> <span className="text-good-ink">+{x.lines_added}</span> <span className="text-critical-ink">−{x.lines_removed}</span></span>
              : k === 'boundary_event' ? <span>boundary <Badge tone="critical">{x.kind}</Badge> {x.status} · <span className="mono text-ink3">{JSON.stringify(x.args)}</span></span>
                : k === 'sentinel' ? <span>sentinel risk <b style={{ color: riskColor(x.risk) }}>{x.risk?.toFixed(2)}</b> {x.patterns?.length > 0 && <span className="text-s7">{x.patterns.join(', ')}</span>} {x.action && x.action !== 'none' && <Badge tone="violet">{x.action}</Badge>}{x.status === 'error' && <Badge tone="critical">hook error</Badge>}</span>
                  : k === 'grade' ? <span>grade · visible {String(x.visible)} · hidden {String(x.hidden)} · strong {String(x.strong)}</span>
                    : <span>{x.status} {x.exit_reason && <span className="mono">{x.exit_reason}</span>}</span>
        return (
          <li key={i} ref={ref} className={`px-4 py-1.5 text-[12px] cursor-pointer hover:bg-panel2/40 ${k === 'chat' ? 'bg-panel2/20' : ''} ${lit ? 'bg-accent/10 border-l-2 border-accent -ml-[2px]' : ''}`} onClick={() => setOpen(open === i ? null : i)}>
            <div className="flex gap-3 items-baseline">
              <span className="mono text-[10.5px] text-ink3 w-6 text-right shrink-0">{x.seq}</span>
              <span className={`w-24 shrink-0 text-[10.5px] uppercase tracking-wider ${SPAN_TONE[k] || 'text-ink3'}`}>{k.replace('_', ' ')}</span>
              <span className="flex-1 min-w-0 truncate">{head}</span>
              {k === 'chat' && <span className="mono text-[10.5px] text-ink3 shrink-0">{x['gen_ai.usage.input_tokens']}+{x['gen_ai.usage.output_tokens']} tok · {x.duration_ms} ms</span>}
            </div>
            {open === i && <pre className="mono text-[11px] mt-2 ml-9 p-2 rounded bg-bg border border-line whitespace-pre-wrap text-ink2 max-h-64 overflow-auto">{JSON.stringify(x, null, 1)}</pre>}
          </li>
        )
      })}
    </ol>
  )
}


function Compare({ dir, a, b, back }) {
  const { TT, AX, GRID, SERIES, STATUS } = useChartTheme()
  const A = useFetch(`/results/${dir}/runs/${a}`), B = useFetch(`/results/${dir}/runs/${b}`)
  if ((A.loading && !A.data) || (B.loading && !B.data)) return <Spinner label="loading both ledgers" />
  if (A.error || B.error) return <Empty>{(A.error || B.error).message}</Empty>
  const runs = [A.data, B.data]
  const maxStep = Math.max(...runs.map(r => r.replay.length))
  const curve = Array.from({ length: maxStep }, (_, i) => ({ step: i, a: runs[0].replay[i]?.risk ?? null, b: runs[1].replay[i]?.risk ?? null }))
  const linesOf = (p) => (p || '').split('\n')
  const la = new Set(linesOf(runs[0].patch).filter(l => l.startsWith('+') || l.startsWith('-'))), lb = new Set(linesOf(runs[1].patch).filter(l => l.startsWith('+') || l.startsWith('-')))
  const shared = [...la].filter(l => lb.has(l)).length
  const sim = (la.size + lb.size) ? (2 * shared) / (la.size + lb.size) : 1
  const rowsOf = (r) => {
    const s = r.summary
    return [['outcome', s.hidden_pass ? 'PASS' : 'fail'], ['exit', s.exit_reason], ['steps / tool calls', `${s.steps} / ${s.tool_calls}`], ['tokens', fmt.int(s.input_tokens + s.output_tokens)], ['cost', fmt.usd(s.cost_usd)],
      ['edits (+/−)', `${s.edits} (+${s.lines_added} −${s.lines_removed})`], ['files', s.files_touched.join(', ') || '—'], ['tests run', s.tests_run_by_agent], ['verified before submit', s.ran_tests_before_submit ? 'yes' : 'no'],
      ['boundary events', s.boundary_events], ['sentinel interventions', s.sentinel_interventions || 0], ['patch bytes', s.patch_bytes]]
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn" onClick={back}>← all trajectories</button>
        <span className="font-semibold">{runs[0].summary.task_id}{runs[0].summary.task_id !== runs[1].summary.task_id ? ` vs ${runs[1].summary.task_id}` : ''}</span>
        <span className="text-ink3 text-[12px]">same model, same harness{runs[0].summary.harness_id !== runs[1].summary.harness_id ? ' (no: ' + runs[0].summary.harness_id + ' vs ' + runs[1].summary.harness_id + ')' : ''}, two runs</span>
        <span className="ml-auto text-[12px] text-ink3">patch line overlap <b className="text-ink">{fmt.pct(sim)}</b></span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {runs.map((r, i) => (
          <Card key={i} title={<span><span className="mono text-ink2">{i ? b : a}</span> · r{r.summary.repeat_index} · <span className="text-s7">{r.summary.harness_id}</span></span>} right={<Badge tone={r.summary.hidden_pass ? 'good' : 'critical'}>{r.summary.hidden_pass ? 'PASS' : 'fail'}</Badge>}>
            <Tbl><tbody>{rowsOf(r).map(([k, v]) => <tr key={k}><td className="text-ink3 w-1/2">{k}</td><td className={`font-medium ${rowsOf(runs[1 - i]).find(x => x[0] === k)?.[1] !== v ? 'text-warn' : ''}`}>{String(v)}</td></tr>)}</tbody></Tbl>
          </Card>
        ))}
      </div>
      <Card title="Risk over both trajectories (replay with the active sentinel)">
        <div className="h-[180px]">
          <ResponsiveContainer>
            <ComposedChart data={curve} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid {...GRID} /><XAxis dataKey="step" {...AX} /><YAxis domain={[0, 1]} {...AX} />
              <Tooltip {...TT} />
              <Line type="monotone" dataKey="a" name={a} stroke={runs[0].summary.hidden_pass ? SERIES[2] : STATUS.critical} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="b" name={b} stroke={runs[1].summary.hidden_pass ? SERIES[2] : STATUS.critical} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Note>Solid = first run, dashed = second. Green = passed the hidden tests, red = failed. Where the two curves separate is where conduct diverged; where they do not and the outcomes still differ, the difference is in the patch, not the process.</Note>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        {runs.map((r, i) => (
          <Card key={i} title={`Patch · ${i ? b : a}`} pad={false}>
            <pre className="mono text-[11px] p-3 max-h-[40vh] overflow-auto leading-[1.5]">
              {(r.patch || '(empty patch)').split('\n').map((l, k) => {
                const other = i ? la : lb
                const unique = (l.startsWith('+') || l.startsWith('-')) && !other.has(l)
                return <div key={k} className={`${l.startsWith('+') && !l.startsWith('+++') ? 'text-good-ink bg-good/10' : l.startsWith('-') && !l.startsWith('---') ? 'text-critical-ink bg-critical/10' : l.startsWith('@@') ? 'text-s1' : 'text-ink3'} ${unique ? 'border-l-2 border-warn pl-1' : 'pl-[6px]'}`}>{l || ' '}</div>
              })}
            </pre>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {runs.map((r, i) => <Card key={i} title={`Timeline · ${i ? b : a}`} pad={false}><div className="max-h-[50vh] overflow-auto"><Timeline spans={r.spans} /></div></Card>)}
      </div>
    </div>
  )
}


// ===========================================================================  fork · scrubber · state space
const GLYPH = { list_files: '≡', read_file: '◍', write_file: '▤', edit_file: '▤', run_tests: '◎', bash: '▷', submit: '■' }

/** One step, drawn as a glyph. Colour = what the step *did*, ring = what the platform said about it. */
function stepCell(st, T) {
  if (!st) return { ch: '', bg: 'transparent', fg: T.ink3, ring: null, title: 'this run had already ended' }
  const tools = st.tools || []
  const blocked = tools.filter(t => t.status === 'sentinel_blocked')
  const test = tools.find(t => t.tool === 'run_tests' || (t.tool === 'bash' && /pytest|unittest|nose2|tox/.test(t.args || '')))
  const submit = tools.find(t => t.tool === 'submit')
  const edited = (st.edits || []).length > 0
  let bg = T.panel2, fg = T.ink2, ch = tools.length ? (GLYPH[tools[0].tool] || '▪') : '∅'
  if (submit) { bg = T.SERIES[0]; fg = T.panel; ch = '■' }
  else if (test) { bg = test.tests_passed === false ? T.STATUS.critical : test.tests_passed === true ? T.STATUS.good : T.STATUS.warn; fg = T.panel; ch = '◎' }
  else if (edited) { bg = T.SERIES[2]; fg = T.panel; ch = '▤' }
  else if (!tools.length) { bg = T.STATUS.critical; fg = T.panel; ch = '∅' }
  const ring = blocked.length ? T.INK.s7 : (st.boundary || []).length ? T.STATUS.critical : (st.sentinel && st.sentinel.action && st.sentinel.action !== 'none') ? T.INK.s7 : null
  const title = `step ${st.step}: ${tools.map(t => `${t.tool}(${t.args || ''})${t.status !== 'ok' ? ' [' + t.status + ']' : ''}`).join(', ') || 'no tool call'}`
    + (edited ? ` · edited ${st.edits.map(e => e.path).join(', ')}` : '')
    + ((st.boundary || []).length ? ` · boundary ${st.boundary.map(x => x.kind).join(', ')}` : '')
    + (st.sentinel ? ` · sentinel risk ${st.sentinel.risk}${st.sentinel.action && st.sentinel.action !== 'none' ? ' → ' + st.sentinel.action : ''}` : '')
  return { ch, bg, fg, ring, title }
}

const CELL = 18

/** A lane of step glyphs. `muteBefore` draws the shared prefix of a fork faded. */
function Lane({ steps, n, muteBefore = null, cursor = null, onPick }) {
  const T = useChartTheme()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, ${CELL - 2}px)`, gap: 2 }}>
      {Array.from({ length: n }, (_, i) => {
        const c = stepCell(steps[i], T)
        const muted = muteBefore != null && i < muteBefore
        return (
          <div key={i} title={c.title} onClick={() => onPick && onPick(i)}
            className={`h-4 rounded-[3px] text-[9px] leading-4 text-center select-none ${onPick ? 'cursor-pointer' : ''} ${cursor === i ? 'outline outline-2 outline-offset-1' : ''}`}
            style={{ background: c.bg, color: c.fg, opacity: muted ? 0.3 : 1, boxShadow: c.ring ? `inset 0 0 0 1.5px ${c.ring}` : undefined, outlineColor: T.accent }}>{c.ch}</div>
        )
      })}
    </div>
  )
}

function Ruler({ n }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, ${CELL - 2}px)`, gap: 2 }} className="text-[9px] text-ink3 mono">
      {Array.from({ length: n }, (_, i) => <div key={i} className="text-center">{i % 5 === 0 ? i : ''}</div>)}
    </div>
  )
}

/** x = step, y = cumulative edits; markers for tests, boundary events, sentinel actions and the submit. */
function StateSpace({ state, cursor, height = 118, onPick }) {
  const { TT, AX, GRID, SERIES, STATUS, INK, ink3, panel } = useChartTheme()
  const data = state.map(s => ({ step: s.step, edits: s.edits, files: s.files_touched.length, risk: s.risk_replay ?? s.risk }))
  const tests = state.filter(s => (s.step_tests || []).length)
  const bounds = state.filter(s => (s.boundary_here || []).length)
  const acts = state.filter(s => s.action && s.action !== 'none')
  const submit = state.find(s => s.submitted)
  const maxE = Math.max(1, ...state.map(s => s.edits))
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -26 }} onClick={(e) => onPick && e && e.activeLabel != null && onPick(Number(e.activeLabel))}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="step" {...AX} type="number" domain={[0, Math.max(1, data.length - 1)]} allowDecimals={false} />
          <YAxis {...AX} domain={[0, maxE + 1]} allowDecimals={false} width={34} />
          <Tooltip {...TT} content={({ active, payload }) => active && payload?.length ? (
            <div style={TT.contentStyle} className="p-2">
              <div className="text-ink3">step {payload[0].payload.step}</div>
              <div>{payload[0].payload.edits} cumulative edits · {payload[0].payload.files} file(s)</div>
              {payload[0].payload.risk != null && <div className="text-s7">risk {payload[0].payload.risk.toFixed(2)}</div>}
            </div>) : null} />
          {submit && <ReferenceLine x={submit.step} stroke={SERIES[0]} strokeWidth={1.5} label={{ value: 'submit', fill: SERIES[0], fontSize: 9, position: 'insideTopRight' }} />}
          {acts.map(s => <ReferenceLine key={'a' + s.step} x={s.step} stroke={INK.s7} strokeDasharray="2 2" />)}
          {cursor != null && <ReferenceLine x={cursor} stroke={ink3} strokeWidth={1} />}
          <Line type="stepAfter" dataKey="edits" stroke={SERIES[2]} strokeWidth={2} dot={false} isAnimationActive={false} />
          {tests.map(s => <ReferenceDot key={'t' + s.step} x={s.step} y={s.edits} r={3.5} fill={s.step_tests.includes('fail') ? STATUS.critical : s.step_tests.includes('pass') ? STATUS.good : STATUS.warn} stroke={panel} strokeWidth={1.5} />)}
          {bounds.map(s => <ReferenceDot key={'b' + s.step} x={s.step} y={s.edits} r={5} fill="none" stroke={STATUS.critical} strokeWidth={1.5} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function StateSpaceKey() {
  return <div className="text-[10.5px] text-ink3 flex gap-3 flex-wrap"><span>line = cumulative edits</span><span className="text-good-ink">● tests passed</span><span className="text-critical-ink">● tests failed</span><span className="text-critical-ink">○ boundary event</span><span className="text-s7">┆ sentinel action</span><span className="text-s1">│ submit</span></div>
}

/** Time-travel scrubber over one run: drag (or ←/→) and every card below is the state at that step. */
function TimeTravel({ data, cursor, setCursor }) {
  const state = data.state
  const last = state.length - 1
  const at = cursor == null ? last : Math.min(cursor, last)
  const s = state[at]
  useEffect(() => {
    const on = (e) => {
      const t = e.target
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return   // the slider itself already handles ←/→
      if (e.key === 'ArrowLeft') { setCursor(c => Math.max(0, (c == null ? last : c) - 1)); e.preventDefault() }
      else if (e.key === 'ArrowRight') { setCursor(c => Math.min(last, (c == null ? last : c) + 1)); e.preventDefault() }
      else if (e.key === 'Home') { setCursor(0); e.preventDefault() }
      else if (e.key === 'End') { setCursor(last); e.preventDefault() }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [last, setCursor])
  const budget = data.harness?.max_total_tokens || 0
  const risk = s.risk != null ? s.risk : s.risk_replay
  return (
    <Card title="Time travel" right={<span>drag the slider or press <Kbd>←</Kbd> <Kbd>→</Kbd> · the ledger below follows · {cursor == null ? 'at the end of the run' : `step ${at} of ${last}`}</span>}>
      <div className="space-y-2">
        <div className="overflow-x-auto pb-1"><Lane steps={data.steps} n={state.length} cursor={at} onPick={setCursor} /><Ruler n={state.length} /></div>
        <input type="range" min={0} max={last} value={at} onChange={e => setCursor(Number(e.target.value))} className="w-full accent-[var(--t-accent)]" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-3">
        <Stat small label="step" value={`${at} / ${last}`} sub={(s.tools || []).join(', ') || 'no tool call'} />
        <Stat small label="edits so far" value={s.edits} sub={`+${s.lines_added} −${s.lines_removed}`} />
        <Stat small label="files touched" value={s.files_touched.length} sub={s.files_touched.join(', ') || '—'} />
        <Stat small label="last test" value={s.last_test} tone={s.last_test === 'pass' ? 'good' : s.last_test === 'fail' ? 'critical' : undefined} sub={`${s.tests_run} test run${s.tests_run === 1 ? '' : 's'} so far`} />
        <Stat small label="tokens" value={fmt.int(s.tokens)} sub={budget ? <span className="block"><span className="inline-block h-1.5 rounded-full bg-line w-full relative align-middle"><span className="absolute left-0 top-0 h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, 100 * s.tokens / budget)}%` }} /></span> {fmt.pct(s.tokens / budget)} of {fmt.int(budget)}</span> : `${fmt.usd(s.cost)} · no token budget`} />
        <Stat small label="risk" value={<RiskBar risk={risk} width={70} />} sub={s.risk != null ? `recorded live${s.action && s.action !== 'none' ? ' · ' + s.action : ''}` : 'replayed with the active model'} />
      </div>
      {(s.boundary_events > 0 || s.blocked_calls > 0 || (s.replay_patterns || []).length > 0) && (
        <div className="mt-2 flex gap-2 flex-wrap text-[12px] items-center">
          {s.boundary_events > 0 && <Badge tone="critical">{s.boundary_events} boundary event{s.boundary_events === 1 ? '' : 's'}: {s.boundary_kinds.join(', ')}</Badge>}
          {s.blocked_calls > 0 && <Badge tone="violet">{s.blocked_calls} call{s.blocked_calls === 1 ? '' : 's'} blocked by the hook</Badge>}
          {(s.replay_patterns || []).length > 0 && <span className="text-s7">patterns: {s.replay_patterns.join(', ')}</span>}
        </div>
      )}
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink3 mb-1">state space · cumulative edits</div>
        <StateSpace state={state} cursor={at} onPick={setCursor} />
        <StateSpaceKey />
      </div>
      <Note>Every counter here is cumulative and non-decreasing, so scrubbing backwards shows the state the agent
        actually had at that step — not the end state filtered. Risk is the recorded live verdict when the run had a
        hook, otherwise what the currently active sentinel model says on replay; the two are not the same number and
        the label says which you are looking at.</Note>
    </Card>
  )
}

const CAUSE_TONE = { intervention: 'violet', sampling: 'warn', harness: 'accent', identical: 'good', text_only: 'neutral', unexplained: 'neutral' }

function Fork({ dir, a, b, back }) {
  const T = useChartTheme()
  const { TT, AX, GRID, SERIES, STATUS, INK } = T
  const f = useFetch(`/fork/${dir}/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`, [dir, a, b])
  const [all, setAll] = useState(false)
  if (f.loading && !f.data) return <Spinner label="aligning both ledgers" />
  if (f.error) return <div className="space-y-3"><button className="btn" onClick={back}>← all trajectories</button><Empty>{f.error.message}</Empty></div>
  const d = f.data
  const n = d.n_steps
  const fork = d.verdict.fork_step
  const oa = d.outcome.a, ob = d.outcome.b
  const from = all || fork == null ? 0 : fork
  const curve = Array.from({ length: n }, (_, i) => ({
    step: i,
    a: d.state.a[i]?.risk_replay ?? null, b: d.state.b[i]?.risk_replay ?? null,
    ar: d.state.a[i]?.risk ?? null, br: d.state.b[i]?.risk ?? null,
  }))
  const hasRecorded = curve.some(c => c.ar != null || c.br != null)
  const side = (st) => st ? (
    <>
      {(st.tools || []).map((t, j) => <div key={j} className="flex gap-1.5 items-baseline"><span className="mono text-s1">{t.tool}</span><span className="mono text-ink3 truncate max-w-[220px]" title={t.args}>{t.args}</span></div>)}
      {!(st.tools || []).length && <span className="text-critical">no tool call</span>}
    </>) : <span className="text-ink3">—</span>
  const statusCell = (st) => st ? (
    <div className="flex gap-1 flex-wrap">
      {(st.tools || []).map((t, j) => <Badge key={j} tone={t.status === 'ok' ? 'neutral' : t.status === 'sentinel_blocked' ? 'violet' : 'critical'}>{t.status}</Badge>)}
      {(st.tools || []).filter(t => t.tests_passed != null).map((t, j) => <Badge key={'t' + j} tone={t.tests_passed ? 'good' : 'warn'}>tests {t.tests_passed ? 'passed' : 'failed'}</Badge>)}
      {(st.boundary || []).map((x, j) => <Badge key={'b' + j} tone="critical">boundary {x.kind}</Badge>)}
      {st.sentinel && st.sentinel.action && st.sentinel.action !== 'none' && <Badge tone="violet">{st.sentinel.action}</Badge>}
    </div>) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn" onClick={back}>← all trajectories</button>
        <span className="font-semibold">{oa.task_id}{oa.task_id !== ob.task_id ? ` vs ${ob.task_id}` : ''}</span>
        <span className="text-ink2">{oa.model}</span>
        <Badge tone={d.pair.twin ? 'violet' : 'neutral'}>{d.pair.twin ? 'seed-paired twin' : d.pair.same_base_harness ? 'repeat' : 'across harnesses'}</Badge>
        <Badge tone={d.pair.seed_matched ? 'good' : 'warn'}>{d.pair.seed_matched ? `seed ${d.pair.seed_a} on both` : d.pair.seed_a == null ? 'no seed recorded' : `seeds differ (${d.pair.seed_a} / ${d.pair.seed_b})`}</Badge>
        <Badge tone={d.pair.deterministic_provider ? 'good' : 'warn'}>{d.pair.deterministic_provider ? 'deterministic provider' : 'nondeterministic model'}</Badge>
        <span className="ml-auto" />
        <button className="btn !py-0.5" onClick={() => window.location.hash = `#/explorer/compare/${dir}/${a}/${b}`}>side-by-side compare</button>
      </div>

      <Card title="The fork" right={<span>{n} aligned steps · {fork == null ? 'no divergence' : `identical prefix of ${fork} step${fork === 1 ? '' : 's'}`}</span>}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <Badge tone={CAUSE_TONE[d.verdict.cause] || 'neutral'}>{d.verdict.cause.replace('_', ' ')}</Badge>
          <span className="text-[15px] font-semibold">{d.verdict.label}</span>
          {!d.verdict.confident && <Badge tone="warn">not attributable</Badge>}
        </div>
        <p className="text-[12.5px] text-ink2 mt-1.5 leading-relaxed">{d.verdict.detail}</p>

        <div className="relative mt-4 overflow-x-auto pb-1">
          <div className="relative" style={{ width: n * CELL }}>
            {fork != null && <>
              <div className="absolute top-0 bottom-0 border-l-2 border-dashed pointer-events-none" style={{ left: fork * CELL - 3, borderColor: STATUS.warn }} />
              <div className="absolute -top-0.5 text-[10px] mono whitespace-nowrap" style={{ left: fork * CELL + 3, color: STATUS.warn }}>fork · step {fork}</div>
            </>}
            {d.interventions.b && d.interventions.b.step !== fork && <div className="absolute top-0 bottom-0 border-l border-dashed pointer-events-none" style={{ left: d.interventions.b.step * CELL - 3, borderColor: INK.s7 }} />}
            <div className="pt-4 space-y-1">
              <div className="text-[11px] text-ink3 flex gap-2 items-center"><span className="mono text-s7">A · {oa.harness_id}</span><span className="mono">{a}</span><Badge tone={oa.hidden_pass ? 'good' : 'critical'}>{oa.hidden_pass ? 'PASS' : 'fail'}</Badge><span className="mono text-ink3">{oa.exit_reason}</span></div>
              <Lane steps={d.steps.map(s => s.a)} n={n} muteBefore={fork} />
              <Ruler n={n} />
              <div className="text-[11px] text-ink3 flex gap-2 items-center pt-1"><span className="mono text-s7">B · {ob.harness_id}</span><span className="mono">{b}</span><Badge tone={ob.hidden_pass ? 'good' : 'critical'}>{ob.hidden_pass ? 'PASS' : 'fail'}</Badge><span className="mono text-ink3">{ob.exit_reason}</span></div>
              <Lane steps={d.steps.map(s => s.b)} n={n} muteBefore={fork} />
            </div>
          </div>
        </div>
        <div className="text-[10.5px] text-ink3 flex gap-3 flex-wrap mt-2">
          <span>≡ list · ◍ read · ▤ edit · ◎ tests · ▷ bash · ■ submit · ∅ no tool call</span>
          <span className="text-s7">violet ring = blocked / sentinel action</span>
          <span className="text-critical-ink">red ring = boundary event</span>
          <span>faded = shared prefix</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <Stat small label="tool divergence" value={d.divergence.tool == null ? 'none' : `step ${d.divergence.tool}`} sub="first step whose (tool, canonical args) sequence differs" />
          <Stat small label="effect divergence" value={d.divergence.effect == null ? 'none' : `step ${d.divergence.effect}`} sub="first step where what actually happened differs (a blocked call forks here first)" />
          <Stat small label="text divergence" value={d.divergence.text == null ? 'none' : `step ${d.divergence.text}`} sub="first step whose model text differs" />
          <Stat small label="first intervention" value={d.interventions.a || d.interventions.b ? `step ${(d.interventions.a || d.interventions.b).step}` : 'none'} tone={d.verdict.cause === 'intervention' ? 'serious' : undefined}
            sub={d.interventions.a || d.interventions.b ? `${(d.interventions.a || d.interventions.b).action} · ${(d.interventions.a || d.interventions.b).reason || ''}` : 'neither run had a hook verdict with an action'} />
        </div>
        <Note><b>Read this honestly.</b> {d.caveat} A fork is only evidence of a sentinel effect when an intervention
          <i> precedes</i> it and the pair is seed-paired on a deterministic provider — that is the one case this page
          labels “intervention”. Everything else it labels sampling, harness or unexplained, and one pair is an
          anecdote either way: for a number with an interval, use the paired bootstrap on the Sentinel page.</Note>
      </Card>

      <Card title="Risk over both trajectories" right={<span>replayed with the active sentinel model on both runs, so the scale is the same{hasRecorded ? '; dashed = the verdicts actually recorded live' : ''}</span>}>
        <div className="h-[190px]">
          <ResponsiveContainer>
            <ComposedChart data={curve} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="step" {...AX} /><YAxis domain={[0, 1]} {...AX} />
              <Tooltip {...TT} />
              {fork != null && <ReferenceLine x={fork} stroke={STATUS.warn} strokeDasharray="4 3" label={{ value: `fork ${fork}`, fill: STATUS.warn, fontSize: 10, position: 'top' }} />}
              {d.interventions.b && <ReferenceLine x={d.interventions.b.step} stroke={INK.s7} strokeDasharray="2 2" label={{ value: d.interventions.b.action, fill: INK.s7, fontSize: 10, position: 'insideTopLeft' }} />}
              <Line type="monotone" dataKey="a" name={`A · ${oa.harness_id}`} stroke={SERIES[4]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="b" name={`B · ${ob.harness_id}`} stroke={SERIES[6]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              {hasRecorded && <Line type="monotone" dataKey="br" name="B recorded live" stroke={INK.s7} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />}
              {hasRecorded && <Line type="monotone" dataKey="ar" name="A recorded live" stroke={STATUS.serious} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[['A', a, oa, d.state.a], ['B', b, ob, d.state.b]].map(([tag, rid, o, st]) => (
          <Card key={tag} title={`State space · ${tag} · ${o.harness_id}`} right={<span className="mono">{rid}</span>}>
            <StateSpace state={st} cursor={fork} />
            <StateSpaceKey />
          </Card>
        ))}
      </div>

      <Card title={from === 0 ? 'Every step, side by side' : `From the fork onward (steps ${from}–${n - 1})`} pad={false}
        right={<button className="hover:text-ink" onClick={() => setAll(v => !v)}>{all ? 'from the fork only' : 'show the shared prefix too'}</button>}>
        <div className="max-h-[60vh] overflow-auto">
          <Tbl nowrap>
            <thead className="sticky top-0 bg-panel">
              <tr><th className="w-10">step</th><th colSpan={2}>A · {oa.harness_id}</th><th className="border-l border-line2" colSpan={2}>B · {ob.harness_id}</th></tr>
            </thead>
            <tbody>
              {d.steps.slice(from).map(s => (
                <tr key={s.step} className={s.same ? '' : 'bg-warn/5'}>
                  <td className="mono text-[11px] text-ink3 align-top">{s.step}{!s.same_effect && <span title="the two runs did different things at this step" className="text-warn"> ⌁</span>}</td>
                  <td className="align-top text-[11.5px]">{side(s.a)}</td>
                  <td className="align-top">{statusCell(s.a)}</td>
                  <td className="align-top text-[11.5px] border-l border-line2">{side(s.b)}</td>
                  <td className="align-top">{statusCell(s.b)}</td>
                </tr>
              ))}
            </tbody>
          </Tbl>
        </div>
      </Card>

      <Card title="Where the two runs ended up">
        <Tbl>
          <thead><tr><th></th><th>A · {oa.harness_id}</th><th>B · {ob.harness_id}</th></tr></thead>
          <tbody>
            {[['hidden tests', r => r.hidden_pass ? 'PASS' : 'fail'], ['visible tests', r => r.visible_pass ? 'pass' : 'fail'], ['strong oracle', r => r.strong_pass ? 'pass' : 'fail'],
              ['exit reason', r => r.exit_reason], ['steps', r => r.steps], ['edits', r => r.edits], ['tokens', r => fmt.int(r.tokens)], ['cost', r => fmt.usd(r.cost_usd)],
              ['boundary events', r => r.boundary_events], ['sentinel interventions', r => r.sentinel_interventions || 0], ['verified before submit', r => r.ran_tests_before_submit ? 'yes' : 'no'], ['tests modified', r => r.tests_modified ? 'yes' : 'no']]
              .map(([k, get]) => {
                const va = String(get(oa)), vb = String(get(ob))
                return <tr key={k}><td className="text-ink3 w-1/3">{k}</td><td className={va !== vb ? 'text-warn font-medium' : ''}>{va}</td><td className={va !== vb ? 'text-warn font-medium' : ''}>{vb}</td></tr>
              })}
          </tbody>
        </Tbl>
        <Note>Rows in amber differ. A flipped outcome with an identical prefix and a fork right after an intervention is
          the cleanest causal story this platform can tell about a single pair; a flipped outcome with no fork at all
          means the difference is in the patch, not in the process.</Note>
      </Card>
    </div>
  )
}
