import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ScatterChart, Scatter, ReferenceLine } from 'recharts'
import { useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Stat, Badge, Empty, Spinner, Note, Tbl, useChartTheme } from '../ui'

export default function Integrity() {
  const { results, harness, events } = useApp()
  const { TT, AX, GRID, SERIES, STATUS, ink2 } = useChartTheme()
  const d = useFetch(results ? `/results/${results}/integrity?harness=${harness}` : null, [results, harness, events.tick])
  if (!results) return <Empty>No results directory yet.</Empty>
  if (d.loading && !d.data) return <Spinner label="re-grading and diffing patches" />
  if (d.error) return <Empty>{d.error.message}</Empty>
  const { leakage, weak_tests: wt, self_report: sr, ochiai, ochiai_harness } = d.data
  const leak = leakage.find(l => l.probe === 'solution_leak')
  const others = leakage.filter(l => l.probe !== 'solution_leak')
  const avg = (k) => others.length ? others.reduce((n, l) => n + (l[k] || 0), 0) / others.length : null
  const rankMoved = wt.per_harness.filter(h => h.rank_hidden !== h.rank_strong).length
  const srH = sr.find(x => x.harness === harness) || sr[0]

  return (
    <div className="space-y-4">
      <div className="stats">
        <Stat label="leak probe pass@1" value={leak ? fmt.pct(leak.pass1) : '—'} sub={others.length ? `other tasks ${fmt.pct(avg('pass1'))}` : ''} tone={leak && leak.pass1 - (avg('pass1') || 0) > 0.2 ? 'serious' : undefined} />
        <Stat label="patch ~ issue similarity" value={leak ? fmt.num(leak.patch_issue_similarity, 2) : '—'} sub={`others ${fmt.num(avg('patch_issue_similarity'), 2)} · added lines vs issue text`} />
        <Stat label="harness ranks that move" value={`${rankMoved} / ${wt.per_harness.length}`} sub="hidden oracle → strengthened oracle" tone={rankMoved ? 'warn' : 'good'} />
        <Stat label="agent says pass" value={fmt.pct(srH?.agent_says_pass)} sub={`oracle ${fmt.pct(srH?.oracle_pass)} · ${harness}`} />
        <Stat label="overclaim" value={fmt.pct(srH?.overclaim)} tone={srH?.overclaim > 0.15 ? 'serious' : undefined} sub="visible tests passed, hidden failed" />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-6" title="(a) Solution leakage" right={<span>{harness} · t05's issue contains the fix</span>}>
          <Tbl>
            <thead><tr><th>task</th><th className="text-right">pass@1</th><th className="text-right">steps</th><th className="text-right">tokens</th><th className="text-right">patch~issue</th></tr></thead>
            <tbody>{leakage.map(l => (
              <tr key={l.task} className={l.probe === 'solution_leak' ? 'bg-serious/10' : ''}>
                <td className="mono text-[12px]">{l.task} {l.probe && l.probe !== 'none' && <Badge tone={l.probe === 'solution_leak' ? 'serious' : 'neutral'}>{l.probe.replace(/_/g, ' ')}</Badge>}</td>
                <td className="text-right font-medium">{fmt.pct(l.pass1)}</td><td className="text-right">{fmt.num(l.steps, 1)}</td><td className="text-right">{fmt.int(l.tokens)}</td><td className="text-right">{fmt.num(l.patch_issue_similarity, 2)}</td>
              </tr>))}</tbody>
          </Tbl>
          <Note>SWE-bench+ (Aleithan et al. 2024): 32.67% of passed patches had the solution in the issue text or comments. Leakage inflates pass rate <em>and</em> deflates cost, so it distorts cost-of-pass comparisons twice.</Note>
        </Card>

        <Card className="col-span-12 xl:col-span-6" title="(b) Same patches, two oracles" right={<span>hidden vs strengthened suite · all harnesses</span>}>
          <div className="h-[210px]">
            <ResponsiveContainer>
              <BarChart data={wt.per_harness} margin={{ top: 10, right: 10, bottom: 0, left: -10 }} barGap={2}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="harness" {...AX} interval={0} />
                <YAxis domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} {...AX} />
                <Tooltip {...TT} formatter={(v) => fmt.pct(v, 1)} />
                <Legend wrapperStyle={{ fontSize: 12, color: ink2 }} />
                <Bar dataKey="hidden" name="hidden tests" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="strong" name="strengthened tests" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">{wt.per_harness.map(h => <Badge key={h.harness} tone={h.rank_hidden === h.rank_strong ? 'neutral' : 'warn'}>{h.harness} #{h.rank_hidden}→#{h.rank_strong} · survive {fmt.pct(h.survive)}</Badge>)}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">{wt.per_task.map(t => <Badge key={t.task} tone={t.lost > 0.3 ? 'serious' : t.lost > 0 ? 'warn' : 'good'}>{t.task.slice(0, 3)} lost {fmt.pct(t.lost)}</Badge>)}</div>
          <Note>UTBoost (Yu et al. 2025): 345 SWE-bench patches mislabelled as passing; 24.4% of Verified leaderboard entries affected. Then read <span className="mono">tasks/t01_slugify/hidden_tests_strong/test_strong.py</span>: do you accept its unicode test as the issue's intent? Strengthened oracles can be wrong too.</Note>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-5" title="(c) Self-report versus oracle" right={<span>the agent's own last test run</span>}>
          <div className="h-[200px]">
            <ResponsiveContainer>
              <BarChart data={sr} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="harness" {...AX} interval={0} />
                <YAxis domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} {...AX} />
                <Tooltip {...TT} formatter={(v) => fmt.pct(v, 1)} />
                <Legend wrapperStyle={{ fontSize: 12, color: ink2 }} />
                <Bar dataKey="agent_says_pass" name="agent says pass" fill={SERIES[3]} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="oracle_pass" name="oracle pass" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="overclaim" name="overclaim" fill={STATUS.critical} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Note>Visible tests are part of the task presentation, and therefore part of the cell. The overclaim column is also the ceiling on what any trajectory sentinel can catch.</Note>
        </Card>

        <Card className="col-span-12 xl:col-span-7" title="Spectrum-based attribution over runs (Ochiai)" right={<span>rows = runs, columns = binary trajectory features · {harness} and all</span>} pad={false}>
          <div className="px-2 pb-2 overflow-x-auto">
            <Tbl>
              <thead><tr><th>feature</th><th className="text-right">Ochiai ({harness})</th><th className="text-right">in failures</th><th className="text-right">in successes</th><th className="text-right">Ochiai (all)</th></tr></thead>
              <tbody>{(ochiai_harness.length ? ochiai_harness : ochiai).map(f => {
                const all = ochiai.find(x => x.feature === f.feature)
                const baseRate = f.rate_in_failures > 0.9 && f.rate_in_successes > 0.9
                return (
                  <tr key={f.feature}>
                    <td className="mono text-[12px]">{f.feature} {baseRate ? <Badge tone="warn">base rate</Badge> : f.rate_in_failures - (f.rate_in_successes || 0) > 0.15 ? <Badge tone="serious">discriminates</Badge> : null}</td>
                    <td className="text-right font-medium">{fmt.num(f.ochiai, 3)}</td>
                    <td className="text-right"><span className="inline-block h-2 rounded-full mr-1.5 align-middle" style={{ width: f.rate_in_failures * 60, background: STATUS.critical }} />{fmt.pct(f.rate_in_failures)}</td>
                    <td className="text-right"><span className="inline-block h-2 rounded-full mr-1.5 align-middle" style={{ width: (f.rate_in_successes || 0) * 60, background: SERIES[2] }} />{fmt.pct(f.rate_in_successes)}</td>
                    <td className="text-right text-ink2">{fmt.num(all?.ochiai, 3)}</td>
                  </tr>)
              })}</tbody>
            </Tbl>
          </div>
          <div className="px-4 pb-3"><Note>susp(f) = ef / √(F · (ef + ep)) — the same formula fault localisation uses on statements. Read the two rate columns, not only the score: a feature common in failures <em>and</em> successes ranks high from base rate alone. That is SBFL's coincidental-coverage weakness, inherited intact. Exercise 7 runs this on 500 real SWE-agent trajectories.</Note></div>
        </Card>
      </div>
    </div>
  )
}
