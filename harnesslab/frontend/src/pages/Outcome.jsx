import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, BarChart, Bar, Cell, ErrorBar } from 'recharts'
import { useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Stat, Empty, Spinner, OutcomeDots, Note, Badge, Tbl, useChartTheme } from '../ui'

export default function Outcome() {
  const { results, harness, dir, events } = useApp()
  const { TT, AX, GRID, SERIES, harnessColor, ink2, ink3 } = useChartTheme()
  const [model, setModel] = useState('')
  const m = useFetch(results ? `/results/${results}/metrics${model ? '?model=' + encodeURIComponent(model) : ''}` : null, [results, model, events.tick])
  if (!results) return <Empty>No results directory yet.</Empty>
  if (m.loading && !m.data) return <Spinner label="computing estimators" />
  if (m.error) return <Empty>{m.error.message}</Empty>
  const cells = m.data.cells
  const cell = cells.find(c => c.harness === harness && (!model || c.model === model)) || cells[0]
  if (!cell) return <Empty>No runs for this selection.</Empty>
  const tasks = Object.entries(cell.tasks)
  const models = [...new Set(cells.map(c => c.model))]
  const ciW = cell.ci95[1] - cell.ci95[0]

  return (
    <div className="space-y-4">
      <div className="stats">
        <Stat label="pass@1" value={fmt.pct(cell['pass@1'], 1)} sub={`95% task-bootstrap CI ${fmt.pct(cell.ci95[0])} – ${fmt.pct(cell.ci95[1])}`} />
        <Stat label={`pass^${Math.min(3, cell.repeats)}`} value={fmt.pct(cell['pass^3'] ?? cell.passk_curve[Math.min(2, cell.repeats - 1)]?.pass_pow_k, 1)} sub="what a user experiences" />
        <Stat label={`pass@${Math.min(3, cell.repeats)}`} value={fmt.pct(cell['pass@3'] ?? cell.passk_curve[Math.min(2, cell.repeats - 1)]?.pass_at_k, 1)} sub="what a leaderboard with retries reports" />
        <Stat label="flip rate" value={fmt.pct(cell.flip_rate)} tone={cell.flip_rate > 0.4 ? 'warn' : undefined} sub="tasks with mixed outcomes" />
        <Stat label="CI width" value={fmt.pct(ciW)} tone={ciW > 0.3 ? 'serious' : 'good'} sub={`${tasks.length} tasks × ${cell.repeats} repeats`} />
        <Stat label="strong-oracle pass@1" value={fmt.pct(cell.pass1_strong, 1)} sub={`Δ ${fmt.pct((cell.pass1_strong ?? 0) - cell['pass@1'], 1)} vs hidden`} tone={(cell.pass1_strong ?? 0) - cell['pass@1'] < -0.05 ? 'warn' : undefined} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-5" title="Outcome grid" right={<>
          {models.length > 1 && <select className="input !w-auto !py-0.5" value={model} onChange={e => setModel(e.target.value)}><option value="">all models</option>{models.map(x => <option key={x} value={x}>{x}</option>)}</select>}
          <span>{cell.model} · <span className="text-s7">{cell.harness}</span></span></>}>
          <Tbl>
            <thead><tr><th>task</th><th>repeats (in order)</th><th className="text-right">pass@1</th><th className="text-right">pass^n</th></tr></thead>
            <tbody>
              {tasks.map(([t, v]) => (
                <tr key={t}>
                  <td className="mono text-[12px]">{t}</td>
                  <td><OutcomeDots outcomes={v.outcomes} /></td>
                  <td className="text-right">{fmt.pct(v.pass1)}</td>
                  <td className="text-right text-ink2">{fmt.pct(Math.pow(v.pass1, v.n))}</td>
                </tr>
              ))}
            </tbody>
          </Tbl>
          <Note>Same model, same harness, same prompt, temperature {cell.tasks && '0'}: the rows still flip. A single run is one sample from this grid, not "the result".</Note>
        </Card>

        <Card className="col-span-12 xl:col-span-7" title="pass@k versus pass^k" right={<span>averaged over tasks · k up to {cell.repeats}</span>}>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <LineChart data={cell.passk_curve} margin={{ top: 10, right: 56, bottom: 0, left: -10 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="k" {...AX} />
                <YAxis domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} {...AX} />
                <Tooltip {...TT} formatter={(v, n) => [fmt.pct(v, 1), n]} />
                <Legend wrapperStyle={{ fontSize: 12, color: ink2 }} />
                <Line type="monotone" dataKey="pass_at_k" name="pass@k (any of k succeeds)" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="pass_pow_k" name="pass^k (all k succeed)" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 3 }} />
                <ReferenceLine y={cell['pass@1']} stroke={ink3} strokeDasharray="3 3" label={{ value: 'pass@1', fill: ink3, fontSize: 11, position: 'right' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Note>The gap between the two curves is the variance the point estimate hides. pass@k rewards retries; pass^k is what a user who runs the agent once per task actually gets (τ-bench's reading).</Note>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-7" title="pass@1 with 95% CI, every cell in this directory" right={<span>tasks are the unit of resampling</span>}>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={cells.map(c => ({ name: (models.length > 1 ? c.model.split('/').pop() + ' · ' : '') + c.harness, p: c['pass@1'], err: [c['pass@1'] - c.ci95[0], c.ci95[1] - c['pass@1']], harness: c.harness }))} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="name" {...AX} interval={0} angle={cells.length > 6 ? -18 : 0} height={cells.length > 6 ? 50 : 30} textAnchor={cells.length > 6 ? 'end' : 'middle'} />
                <YAxis domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} {...AX} />
                <Tooltip {...TT} formatter={(v) => fmt.pct(v, 1)} />
                <Bar dataKey="p" name="pass@1" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {cells.map((c, i) => <Cell key={i} fill={harnessColor(c.harness)} opacity={c.harness === harness ? 1 : 0.55} />)}
                  <ErrorBar dataKey="err" width={6} stroke={ink2} strokeWidth={1.5} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Note>With eight tasks the interval is wide on purpose. Two bars whose intervals overlap this much are not "ranked"; the paired test in the Harness lab is the honest comparison.</Note>
        </Card>
        <Card className="col-span-12 xl:col-span-5" title="Exit reasons and conduct" right={<span>{cell.runs} runs</span>}>
          <div className="space-y-2 text-[12.5px]">
            {Object.entries(cell.exit).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2"><span className="mono w-32 text-ink2">{k}</span>
                <div className="flex-1 h-2 bg-line rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: k === 'submitted' ? SERIES[2] : k === 'sentinel_abort' ? SERIES[6] : SERIES[7] }} /></div>
                <span className="w-12 text-right tabular-nums">{fmt.pct(v)}</span></div>
            ))}
            <div className="border-t border-line pt-2 grid grid-cols-2 gap-2 text-[12px]">
              <div><span className="text-ink3">verified before submit</span><div className="text-[16px] font-semibold">{fmt.pct(cell.ran_tests_before_submit)}</div></div>
              <div><span className="text-ink3">≥1 boundary event</span><div className="text-[16px] font-semibold">{fmt.pct(cell.boundary_any)}</div></div>
              <div><span className="text-ink3">tests modified</span><div className="text-[16px] font-semibold">{fmt.pct(cell.tests_modified)}</div></div>
              <div><span className="text-ink3">sentinel interventions / run</span><div className="text-[16px] font-semibold">{fmt.num(cell.sentinel_interventions, 2)}</div></div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(cell.boundary.by_kind).map(([k, v]) => <Badge key={k} tone="critical">{k} {fmt.pct(v)}</Badge>)}
            </div>
          </div>
        </Card>

        <Card className="col-span-12" title="Cost and efficiency, per cell"
          right={<span>the ledger is the instrument</span>}>
          <Tbl nowrap>
            <thead><tr>
              <th>cell</th><th className="text-right">runs</th><th className="text-right">pass@1</th>
              <th className="text-right">tok/run</th><th className="text-right">p95 tok</th><th className="text-right">tok/solve</th>
              <th className="text-right">$/run</th><th className="text-right">cost of pass</th><th className="text-right">vs baseline</th>
              <th className="text-right">calls/run</th><th className="text-right">in:out</th><th className="text-right">wall</th>
            </tr></thead>
            <tbody>
              {cells.map(c => (
                <tr key={c.model + c.harness} className={c === cell ? 'bg-panel2/60' : undefined}>
                  <td className="mono text-[12px]">{c.model} · <span className="text-s7">{c.harness}</span></td>
                  <td className="text-right">{c.runs}</td>
                  <td className="text-right">{fmt.pct(c['pass@1'], 1)}</td>
                  <td className="text-right text-ink2">{fmt.int(c.mean_tokens)}</td>
                  <td className="text-right text-ink2">{fmt.int(c.p95_tokens)}</td>
                  <td className="text-right text-ink2">{Number.isFinite(c.tokens_per_solve) ? fmt.int(c.tokens_per_solve) : '∞'}</td>
                  <td className="text-right text-ink2">{fmt.usd(c.mean_cost)}</td>
                  <td className="text-right"><b>{fmt.usd(c.cost_of_pass)}</b></td>
                  <td className="text-right">{c.agency_tax == null ? '—' : <Badge tone={c.agency_tax > 1.2 ? 'warn' : c.agency_tax < 0.85 ? 'good' : 'neutral'}>{fmt.num(c.agency_tax, 2)}×</Badge>}</td>
                  <td className="text-right text-ink2">{fmt.num(c.calls_per_run, 1)}</td>
                  <td className="text-right text-ink2">{c.in_out_ratio == null ? '—' : fmt.num(c.in_out_ratio, 1)}</td>
                  <td className="text-right text-ink2">{fmt.num(c.mean_wall_s, 1)}s</td>
                </tr>
              ))}
            </tbody>
          </Tbl>
          <Note>
            Cost of pass is spend divided by <em>solved</em> tasks, so a cheap cell that fails often is not cheap.
            The span names follow the OpenTelemetry GenAI conventions, so these columns map onto production traces;
            cost is the endpoint's reported charge where the provider returns one, and tokens × the price table otherwise.
          </Note>
        </Card>
      </div>
    </div>
  )
}
