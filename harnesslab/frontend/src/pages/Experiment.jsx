import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, BarChart, Bar, Cell,
} from 'recharts'
import { useFetch, fmt, IS_STATIC } from '../api'
import { useApp } from '../App'
import { Card, Stat, Empty, Spinner, Note, Badge, Tbl, useChartTheme } from '../ui'

/** Exercise 8. A leaderboard reports one number per arm; this page reports where the variance
 *  actually lives, whether the effect transfers across models, and how often the ranking inverts. */
export default function Experiment() {
  const { results, overview, events, oracle } = useApp()
  const { TT, AX, GRID, SERIES, ink3 } = useChartTheme()
  const [aKey, setAKey] = useState('model')
  const [bKey, setBKey] = useState('harness_id')
  const [also, setAlso] = useState([])
  const [pick, setPick] = useState({ a: null, b: null })

  const dirs = (overview?.results || []).map(d => d.name).filter(n => n !== results)
  const qs = new URLSearchParams({ a: aKey, b: bKey, outcome: oracle })
  if (also.length) qs.set('also', also.join(','))
  if (pick.a) qs.set('a_cell', pick.a)
  if (pick.b) qs.set('b_cell', pick.b)
  const e = useFetch(results ? `/results/${results}/experiment?${qs}` : null,
    [results, aKey, bKey, oracle, also.join(), pick.a, pick.b, events.tick])

  if (!results) return <Empty>No results directory yet.</Empty>
  if (e.loading && !e.data) return <Spinner label="fitting the design" />
  if (e.error) return <Empty>{e.error.message}</Empty>
  if (e.data?.error) return <Empty>{e.data.error}</Empty>

  const d = e.data
  const F = d.factors
  const cellOf = (a, b) => d.cells.find(c => c.a === a && c.b === b)
  const anova = d.anova
  const h2h = d.head_to_head

  const inter = d.b_levels.map(b => {
    const row = { b }
    d.a_levels.forEach(a => { const c = cellOf(a, b); if (c) row[a] = c.pass1 })
    return row
  })

  const shareData = anova ? anova.table.map(t => ({ term: t.term, share: t.share })) : []
  const treatmentShare = anova
    ? anova.table.filter(t => /\(A\)|\(B\)|AB/.test(t.term)).reduce((s, t) => s + (t.share || 0), 0)
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[12px] text-ink2">factor A
          <select className="input !w-auto !py-0.5 ml-1.5" value={aKey} onChange={ev => setAKey(ev.target.value)}>
            {Object.entries(F).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-ink2">factor B
          <select className="input !w-auto !py-0.5 ml-1.5" value={bKey} onChange={ev => setBKey(ev.target.value)}>
            {Object.entries(F).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {dirs.length > 0 && !IS_STATIC && (
          <span className="flex items-center gap-1.5 text-[12px] text-ink3">
            add as levels:
            {dirs.map(n => (
              <button key={n} onClick={() => setAlso(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n])}
                className={`px-2 py-0.5 rounded border text-[11px] mono ${also.includes(n) ? 'border-accent text-accent' : 'border-line text-ink3 hover:text-ink2'}`}>
                {n}
              </button>
            ))}
          </span>
        )}
        <span className="text-[12px] text-ink3 ml-auto">tasks are the block · {d.cells.reduce((s, c) => s + c.n, 0)} runs</span>
      </div>

      <Note>
        Y<sub>ijk</sub> = μ + α<sub>i</sub> + β<sub>j</sub> + (αβ)<sub>ij</sub> + u<sub>k</sub><sup>task</sup> + ε<sub>ijk</sub>.
        The interaction term is the question “does this factor help everywhere, or only here?”
        A benchmark row cannot answer it; a factorial design can.
      </Note>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-6" title={`Cell means · ${F[aKey]} × ${F[bKey]}`}
          right={<span>click a rate to set A, the B tag to set B</span>}>
          <Tbl>
            <thead>
              <tr><th>{F[aKey]} \ {F[bKey]}</th>{d.b_levels.map(b => <th key={b} className="text-right">{b}</th>)}</tr>
            </thead>
            <tbody>
              {d.a_levels.map(a => (
                <tr key={a}>
                  <td className="mono text-[12px]">{a}</td>
                  {d.b_levels.map(b => {
                    const c = cellOf(a, b)
                    if (!c) return <td key={b} className="text-right text-ink3">—</td>
                    const k = `${a}|${b}`
                    return (
                      <td key={b} className="text-right">
                        <button onClick={() => setPick(p => ({ ...p, a: k }))}
                          className={`px-1 rounded ${pick.a === k ? 'bg-accent/20 text-accent' : 'hover:bg-panel2'}`}>
                          {fmt.pct(c.pass1, 0)}
                        </button>
                        <button onClick={() => setPick(p => ({ ...p, b: k }))}
                          className={`ml-1 px-1 rounded text-[10px] ${pick.b === k ? 'bg-accent/20 text-accent' : 'text-ink3 hover:text-ink2'}`}>B</button>
                        <div className="text-[10px] text-ink3">
                          n={c.n} · {fmt.pct(c.ci95[0])}–{fmt.pct(c.ci95[1])}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </Tbl>
        </Card>

        <Card className="col-span-12 xl:col-span-6" title="Interaction plot"
          right={<span>parallel = additive · crossing = level-specific</span>}>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <LineChart data={inter} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="b" {...AX} />
                <YAxis domain={[0, 1]} tickFormatter={v => fmt.pct(v, 0)} {...AX} />
                <Tooltip {...TT} formatter={v => fmt.pct(v, 1)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {d.a_levels.map((a, i) => (
                  <Line key={a} type="linear" dataKey={a} stroke={SERIES[i % SERIES.length]}
                    strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Note>
            Lines that stay parallel mean the effect of {F[bKey]} transfers across {F[aKey]}. Lines that cross mean a
            single-level ablation would have misled you.
          </Note>
        </Card>

        {anova && (
          <Card className="col-span-12 xl:col-span-7" title="Variance decomposition"
            right={<span>n = {anova.n} · grand mean {fmt.num(anova.grand_mean, 3)}</span>}>
            <Tbl>
              <thead><tr><th>term</th><th className="text-right">SS</th><th className="text-right">df</th><th className="text-right">MS</th><th className="text-right">F</th><th className="text-right">share of SS</th></tr></thead>
              <tbody>
                {anova.table.map(t => (
                  <tr key={t.term}>
                    <td>{t.term}</td>
                    <td className="text-right">{fmt.num(t.SS, 2)}</td>
                    <td className="text-right text-ink2">{t.df}</td>
                    <td className="text-right text-ink2">{fmt.num(t.MS, 4)}</td>
                    <td className="text-right text-ink2">{t.F == null ? '—' : fmt.num(t.F, 2)}</td>
                    <td className="text-right"><b>{fmt.pct(t.share, 1)}</b></td>
                  </tr>
                ))}
              </tbody>
            </Tbl>
            {anova.dropped?.length > 0 && (
              <Note>
                Fitted on the balanced subset ({anova.balanced_a.join(', ')} × {anova.balanced_b.join(', ')}).
                Dropped for imbalance: {anova.dropped.join(', ')}.
              </Note>
            )}
            {treatmentShare != null && (
              <Note>
                The two treatments together explain <b>{fmt.pct(treatmentShare, 1)}</b> of the total sum of squares.
                The task block is difficulty spread; the residual is run-to-run noise inside one cell. A leaderboard
                reports the treatment share as if it were everything.
              </Note>
            )}
          </Card>
        )}

        {shareData.length > 0 && (
          <Card className="col-span-12 xl:col-span-5" title="Where the variance lives">
            <div className="h-[240px]">
              <ResponsiveContainer>
                <BarChart data={shareData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 96 }}>
                  <CartesianGrid {...GRID} horizontal={false} />
                  <XAxis type="number" domain={[0, 1]} tickFormatter={v => fmt.pct(v, 0)} {...AX} />
                  <YAxis type="category" dataKey="term" width={92} {...AX} />
                  <Tooltip {...TT} formatter={v => fmt.pct(v, 1)} />
                  <Bar dataKey="share" radius={[0, 3, 3, 0]}>
                    {shareData.map((s, i) => (
                      <Cell key={i} fill={/\(A\)|\(B\)|AB/.test(s.term) ? SERIES[0] : SERIES[(i % 4) + 3]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card className="col-span-12" title={`Every pairwise contrast of ${F[bKey]}, paired over tasks`}
          right={<span>{d.multiplicity.n} contrasts</span>}>
          {d.contrasts.length === 0
            ? <Empty>Needs two levels of {F[bKey]} sharing tasks.</Empty>
            : (
              <Tbl>
                <thead><tr><th>{F[aKey]}</th><th>contrast</th><th className="text-right">Δ</th><th className="text-right">95% task-bootstrap</th><th className="text-right">tasks</th><th>verdict</th></tr></thead>
                <tbody>
                  {d.contrasts.map((c, i) => (
                    <tr key={i}>
                      <td className="mono text-[12px]">{c.a}</td>
                      <td className="text-ink2">{c.to} − {c.from}</td>
                      <td className="text-right">{c.delta >= 0 ? '+' : ''}{fmt.pct(c.delta, 1)}</td>
                      <td className="text-right text-ink2">{fmt.pct(c.ci95[0], 1)} – {fmt.pct(c.ci95[1], 1)}</td>
                      <td className="text-right text-ink2">{c.tasks}</td>
                      <td>{c.covers_zero
                        ? <Badge tone="neutral">covers zero</Badge>
                        : <Badge tone={c.delta > 0 ? 'good' : 'serious'}>{c.delta > 0 ? 'higher' : 'lower'}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </Tbl>
            )}
          {d.multiplicity.n > 1 && (
            <Note>
              With {d.multiplicity.n} comparisons at 95%, expect about {fmt.num(d.multiplicity.expected_false, 1)} to
              exclude zero by chance alone. A Bonferroni-adjusted interval would sit at {fmt.num(d.multiplicity.bonferroni_pct, 1)}%.
            </Note>
          )}
        </Card>

        <Card className="col-span-12" title="Can we conclude A > B?"
          right={h2h ? <span className="mono text-[11px]">{h2h.a.key} vs {h2h.b.key}</span> : null}>
          {!h2h
            ? <Empty>Pick a cell as A and another as B in the table above.</Empty>
            : (
              <>
                <div className="stats">
                  <Stat label={`A · ${h2h.a.key}`} value={fmt.pct(h2h.a.pass1, 1)} sub={`n = ${h2h.a.n}`} />
                  <Stat label={`B · ${h2h.b.key}`} value={fmt.pct(h2h.b.pass1, 1)} sub={`n = ${h2h.b.n}`} />
                  <Stat label="B − A, paired over tasks"
                    value={`${h2h.paired_delta >= 0 ? '+' : ''}${fmt.pct(h2h.paired_delta, 1)}`}
                    sub={h2h.paired_tasks ? `95% ${fmt.pct(h2h.paired_ci95[0], 1)} – ${fmt.pct(h2h.paired_ci95[1], 1)} · ${h2h.paired_tasks} tasks` : 'no shared tasks'}
                    tone={h2h.paired_ci95 && h2h.paired_ci95[0] <= 0 && h2h.paired_ci95[1] >= 0 ? 'warn' : 'good'} />
                  <Stat label="runs needed per arm"
                    value={h2h.n_needed_per_arm == null ? '∞' : fmt.int(h2h.n_needed_per_arm)}
                    sub={`you have ${h2h.have_per_arm} · α 0.05, power 0.8`}
                    tone={h2h.n_needed_per_arm != null && h2h.n_needed_per_arm > h2h.have_per_arm ? 'serious' : 'good'} />
                </div>

                <div className="grid grid-cols-12 gap-4 mt-3">
                  <div className="col-span-12 lg:col-span-7">
                    <div className="text-[12px] text-ink2 mb-1">Runs per arm needed, by the difference you want to detect</div>
                    <div className="h-[220px]">
                      <ResponsiveContainer>
                        <LineChart data={h2h.power_curve} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                          <CartesianGrid {...GRID} />
                          <XAxis dataKey="delta" tickFormatter={v => fmt.pct(v, 0)} {...AX} />
                          <YAxis scale="log" domain={['auto', 'auto']} tickFormatter={v => fmt.int(v)} {...AX} />
                          <Tooltip {...TT} formatter={v => fmt.int(v)} labelFormatter={v => `detect ${fmt.pct(v, 1)}`} />
                          <ReferenceLine y={h2h.have_per_arm} stroke={ink3} strokeDasharray="4 3"
                            label={{ value: `you have ${h2h.have_per_arm}`, fill: ink3, fontSize: 10, position: 'insideTopRight' }} />
                          <Line type="monotone" dataKey="n_per_arm" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <Note>Everything left of where the curve crosses the dashed line is invisible to this experiment.</Note>
                  </div>

                  <div className="col-span-12 lg:col-span-5">
                    <div className="text-[12px] text-ink2 mb-1">
                      How often does the wrong arm win? <span className="text-ink3">Monte-Carlo over {h2h.shared_tasks} shared tasks</span>
                    </div>
                    {h2h.wrong_winner.length === 0
                      ? <Empty>Needs at least two shared tasks.</Empty>
                      : (
                        <Tbl>
                          <thead><tr><th className="text-right">repeats / task</th><th className="text-right">wrong winner</th><th className="text-right">tie</th></tr></thead>
                          <tbody>
                            {h2h.wrong_winner.map(s => (
                              <tr key={s.k}>
                                <td className="text-right">{s.k}</td>
                                <td className="text-right"><b>{fmt.pct(s.wrong, 1)}</b></td>
                                <td className="text-right text-ink2">{fmt.pct(s.ties, 1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Tbl>
                      )}
                    <Note>
                      Draw Bernoulli outcomes per task at each arm's observed rate, k repeats, {h2h.wrong_winner[0]?.sims ?? 2000} simulations,
                      and count how often the arm with the lower true mean finishes ahead. At k = 1 that is a
                      leaderboard's error rate on this pair.
                    </Note>
                  </div>
                </div>
              </>
            )}
        </Card>
      </div>
    </div>
  )
}
