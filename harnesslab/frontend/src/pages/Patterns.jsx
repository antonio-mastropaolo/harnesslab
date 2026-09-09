import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { useFetch, fmt, IS_STATIC } from '../api'
import { useApp } from '../App'
import { Card, Stat, Empty, Spinner, Note, Badge, Tbl, useChartTheme } from '../ui'

const EXAMPLES = [
  ['^LRW', 'writes before ever running the tests'],
  ['T{3,}', 'three or more test runs in a row'],
  ['[WE]S$', 'submits straight after an edit, no verification'],
  ['^[^WE]*S', 'submits without editing anything'],
  ['(RB){3,}', 'read/bash ping-pong — flailing'],
]

/** Exercise 3, one level up from a single trajectory: what do SETS of runs have in common,
 *  and which shapes are associated with failure. Everything is over the action alphabet. */
export default function Patterns() {
  const { results, harness, events, oracle } = useApp()
  const { TT, AX, GRID, SERIES, ink3 } = useChartTheme()
  const [task, setTask] = useState('')
  const [pattern, setPattern] = useState('')
  const [draft, setDraft] = useState('')
  const [showTest, setShowTest] = useState(false)

  const p = useFetch(results ? `/results/${results}/patterns?harness=${encodeURIComponent(harness)}${task ? '&task=' + encodeURIComponent(task) : ''}&outcome=${oracle}` : null,
    [results, harness, task, oracle, events.tick])
  const q = useFetch(results && pattern ? `/results/${results}/query?pattern=${encodeURIComponent(pattern)}&harness=${encodeURIComponent(harness)}&outcome=${oracle}` : null,
    [results, harness, pattern, oracle])

  if (!results) return <Empty>No results directory yet.</Empty>
  if (p.loading && !p.data) return <Spinner label="reading trajectories" />
  if (p.error) return <Empty>{p.error.message}</Empty>
  if (p.data?.error) return <Empty>{p.data.error}</Empty>

  const d = p.data
  const A = d.alphabet.map(a => a.code)
  const tasks = d.divergence.map(x => x.task)
  const submit = (e) => { e.preventDefault(); setPattern(draft) }

  const heat = (m, title) => (
    <div>
      <div className="text-[12px] text-ink2 mb-1">{title}</div>
      <Tbl nowrap>
        <thead><tr><th></th>{A.map(b => <th key={b} className="text-right mono">{b}</th>)}</tr></thead>
        <tbody>
          {A.map(a => (
            <tr key={a}>
              <td className="mono text-ink2">{a}</td>
              {A.map(b => {
                const v = m.probs[a][b]
                return (
                  <td key={b} className="text-right mono text-[11px]"
                    style={v > 0.01 ? { background: `color-mix(in srgb, var(--t-accent) ${Math.round(v * 70)}%, transparent)` } : undefined}>
                    {v > 0.01 ? Math.round(v * 100) : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </Tbl>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[12px] text-ink2">task
          <select className="input !w-auto !py-0.5 ml-1.5" value={task} onChange={e => setTask(e.target.value)}>
            <option value="">all tasks</option>
            {tasks.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <span className="text-[12px] text-ink3">
          {d.n_runs} runs · {d.n_pass} passing / {d.n_fail} failing · harness <span className="mono">{harness}</span>
        </span>
        <span className="text-[12px] text-ink3 ml-auto">
          {d.alphabet.map(a => <span key={a.code} className="ml-2"><b className="mono">{a.code}</b> {a.label}</span>)}
        </span>
      </div>

      <Card title="Query the shape of a run"
        right={<span>{IS_STATIC ? 'live app only' : 'regex over the action string'}</span>}>
        {IS_STATIC && <Note>Queries run against the ledgers, so they need the live app: <span className="mono">python -m harnesslab</span>.</Note>}
        {!IS_STATIC && <><form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <input className="input flex-1 min-w-[220px] mono text-[12px]" value={draft} placeholder="^LRW"
            onChange={e => setDraft(e.target.value)} />
          <button className="btn" type="submit">run</button>
          {pattern && <button className="btn !py-0.5" type="button" onClick={() => { setPattern(''); setDraft('') }}>clear</button>}
        </form>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {EXAMPLES.map(([re, label]) => (
            <button key={re} onClick={() => { setDraft(re); setPattern(re) }}
              className="px-2 py-0.5 rounded border border-line text-[11px] text-ink3 hover:text-ink2" title={label}>
              <span className="mono">{re}</span> <span className="text-ink3">· {label}</span>
            </button>
          ))}
        </div></>}

        {pattern && q.loading && <Spinner label="matching" />}
        {pattern && q.data?.error && <Note>{q.data.error}</Note>}
        {pattern && q.data && !q.data.error && (
          <div className="mt-3">
            <div className="stats">
              <Stat label="runs matched" value={`${q.data.matched} / ${q.data.total}`} sub={`${fmt.pct(q.data.matched / q.data.total)} of the selection`} />
              <Stat label="pass rate inside" value={fmt.pct(q.data.pass_in, 1)} tone={q.data.pass_in != null && q.data.pass_out != null && q.data.pass_in < q.data.pass_out ? 'serious' : 'good'} />
              <Stat label="pass rate outside" value={fmt.pct(q.data.pass_out, 1)} />
              <Stat label="risk ratio" value={fmt.num(q.data.risk_ratio, 2)}
                sub="failure rate inside ÷ outside" tone={q.data.risk_ratio > 1.5 ? 'serious' : undefined} />
              <Stat label="Ochiai" value={fmt.num(q.data.ochiai, 3)} sub="suspiciousness" />
            </div>
            {q.data.matched > 0 && (
              <>
                <Note>
                  A risk ratio above 1 means runs of this shape fail more often than the rest. It is an
                  association over {q.data.total} runs, not a cause — but it is the right size of evidence to turn
                  into an assertion.
                </Note>
                <div className="mt-2">
                  <button className="btn !py-0.5 text-[12px]" onClick={() => setShowTest(s => !s)}>
                    {showTest ? 'hide' : 'export as a unittest'}
                  </button>
                  {showTest && (
                    <pre className="mt-2 p-3 rounded bg-panel2 text-[11px] overflow-x-auto mono whitespace-pre">{q.data.unittest}</pre>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-7" title="Distinct action sequences"
          right={<span>{d.sequences.length} shapes over {d.n_runs} runs</span>}>
          <Tbl>
            <thead><tr><th>sequence</th><th className="text-right">runs</th><th className="text-right">pass rate</th><th className="text-right">Wilson 95%</th><th className="text-right">mean cost</th></tr></thead>
            <tbody>
              {d.sequences.map(s => (
                <tr key={s.sequence}>
                  <td className="mono text-[12px]">{s.sequence || <span className="text-ink3">(no actions)</span>}</td>
                  <td className="text-right">{s.n}</td>
                  <td className="text-right">{fmt.pct(s.pass_rate, 0)}</td>
                  <td className="text-right text-ink2 text-[11px]">{fmt.pct(s.ci95[0])} – {fmt.pct(s.ci95[1])}</td>
                  <td className="text-right text-ink2">{s.mean_cost ? fmt.usd(s.mean_cost) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Tbl>
          <Note>
            The repeated shapes are the agent's habits. Read the Wilson interval, not the point estimate — a
            shape seen three times tells you almost nothing, and the interval says so.
          </Note>
        </Card>

        <Card className="col-span-12 xl:col-span-5" title="What follows what"
          right={<span>row → column, %</span>}>
          <div className="space-y-3">
            {heat(d.transitions.pass, `passing runs (n=${d.n_pass})`)}
            {heat(d.transitions.fail, `failing runs (n=${d.n_fail})`)}
          </div>
          <Note>Compare the two grids. A transition that is common in failures and rare in passes is a lead.</Note>
        </Card>

        <Card className="col-span-12 xl:col-span-7" title="What happens at step k"
          right={<span>share of runs still alive at each step</span>}>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={d.step_positions} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="step" {...AX} />
                <YAxis domain={[0, 1]} tickFormatter={v => fmt.pct(v, 0)} {...AX} />
                <Tooltip {...TT} formatter={(v, n) => [fmt.pct(v, 1), n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {A.map((a, i) => (
                  <Bar key={a} dataKey={a} stackId="s" fill={SERIES[i % SERIES.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Note>The shape of a typical run over time: orientation first, then the edit/test loop, then submit.</Note>
        </Card>

        <Card className="col-span-12 xl:col-span-5" title="Trajectory clusters"
          right={<span>average linkage on edit distance</span>}>
          {d.clusters.length === 0
            ? <Empty>Needs at least two runs.</Empty>
            : (
              <Tbl>
                <thead><tr><th className="text-right">size</th><th>medoid (a real run, not an average)</th></tr></thead>
                <tbody>
                  {d.clusters.map((c, i) => (
                    <tr key={i}>
                      <td className="text-right">{c.size}</td>
                      <td className="mono text-[12px] break-all">{c.medoid || <span className="text-ink3">(empty)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </Tbl>
            )}
          <Note>A medoid is an actual trajectory, so “the typical failing shape” is something you can go and open.</Note>
        </Card>

        <Card className="col-span-12" title="Where runs of the same task diverge"
          right={<span>same task, same harness, temperature 0</span>}>
          <Tbl>
            <thead><tr><th>task</th><th className="text-right">runs</th><th className="text-right">distinct shapes</th><th className="text-right">diverge at</th><th>common prefix</th><th>then</th><th className="text-right">pass rate</th></tr></thead>
            <tbody>
              {d.divergence.map(x => (
                <tr key={x.task}>
                  <td className="mono text-[12px]">{x.task}</td>
                  <td className="text-right">{x.runs}</td>
                  <td className="text-right">{x.distinct_sequences}</td>
                  <td className="text-right"><Badge tone={x.diverge_at <= 2 ? 'warn' : 'neutral'}>step {x.diverge_at}</Badge></td>
                  <td className="mono text-[12px] text-ink2">{x.common_prefix || '—'}</td>
                  <td className="text-[12px] text-ink2">
                    {x.branches.map(([ch, n]) => <span key={ch} className="mr-2"><span className="mono">{ch}</span>×{n}</span>)}
                  </td>
                  <td className="text-right">{fmt.pct(x.pass_rate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </Tbl>
          <Note>
            The step where the strings part company is where run-to-run variance is born. If a task branches at
            step 2 into “run the tests” versus “start writing”, that single choice is most of its flip rate.
          </Note>
        </Card>
      </div>
    </div>
  )
}
