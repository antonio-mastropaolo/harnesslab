import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, ErrorBar } from 'recharts'
import { api, useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Empty, Spinner, Note, Badge, Toggle, Tbl, useChartTheme } from '../ui'
import { SEQ_BLUE, seqText } from '../theme'

const COLS = [
  { k: 'pass@1', label: 'pass@1', f: v => fmt.pct(v), hi: true },
  { k: 'pass_pow_n', label: 'pass^n', f: v => fmt.pct(v), hi: true },
  { k: 'flip_rate', label: 'flip', f: v => fmt.pct(v) },
  { k: 'mean_steps', label: 'steps', f: v => fmt.num(v, 1) },
  { k: 'tokens_per_solve', label: 'tok / solve', f: v => fmt.int(v) },
  { k: 'cost_of_pass', label: '$ / pass', f: v => fmt.usd(v, 4) },
  { k: 'ran_tests_before_submit', label: 'verified', f: v => fmt.pct(v), hi: true },
  { k: 'boundary_any', label: 'boundary', f: v => fmt.pct(v) },
  { k: 'tests_modified', label: 'tests mod.', f: v => fmt.pct(v) },
  { k: 'sentinel_interventions', label: 'interv./run', f: v => fmt.num(v, 2) },
]

export default function HarnessLab() {
  const { results, harness, overview, events, reloadOverview } = useApp()
  const { TT, AX, GRID, SERIES, harnessColor, ink, ink2, ink3 } = useChartTheme()
  const [baseline, setBaseline] = useState('baseline')
  const m = useFetch(results ? `/results/${results}/metrics?baseline=${baseline}` : null, [results, baseline, events.tick])
  const cells = (m.data?.cells || []).map(c => ({ ...c, pass_pow_n: c.passk_curve?.[c.passk_curve.length - 1]?.pass_pow_k }))
  const harnesses = [...new Set(cells.map(c => c.harness))]
  useEffect(() => { if (harnesses.length && !harnesses.includes(baseline)) setBaseline(harnesses[0]) }, [harnesses.join()]) // eslint-disable-line
  const models = [...new Set(cells.map(c => c.model))]

  // which columns move: coefficient of variation across harness cells (same model)
  const spread = useMemo(() => {
    const out = {}
    for (const c of COLS) {
      const vals = cells.filter(x => x.model === (models[0] || x.model)).map(x => x[c.k]).filter(v => v != null && Number.isFinite(v))
      if (vals.length < 2) { out[c.k] = 0; continue }
      const mx = Math.max(...vals), mn = Math.min(...vals)
      out[c.k] = mx === 0 ? 0 : (mx - mn) / Math.max(Math.abs(mx), 1e-9)
    }
    return out
  }, [cells]) // eslint-disable-line

  if (!results) return <Empty>No results directory yet.</Empty>
  if (m.loading && !m.data) return <Spinner label="loading cells" />

  const cmp = m.data?.comparison || {}
  const cmpRows = Object.entries(cmp).filter(([, v]) => v.n_tasks > 0).map(([h, v]) => ({ h, d: v.mean_diff, err: [v.mean_diff - v.ci95[0], v.ci95[1] - v.mean_diff], lo: v.ci95[0], hi: v.ci95[1], n: v.n_tasks }))

  return (
    <div className="space-y-4">
      <Card title={`${harnesses.length} harness${harnesses.length === 1 ? "" : "es"}, ${models.length} model${models.length === 1 ? "" : "s"}: which columns move?`} right={<span>{cells.length} cells · shading = relative spread across harnesses</span>} pad={false}>
        <div className="overflow-x-auto px-2 pb-2">
          <Tbl>
            <thead><tr><th>model</th><th>harness</th><th className="text-right">runs</th>{COLS.map(c => <th key={c.k} className="text-right" style={{ background: `color-mix(in srgb, ${SERIES[1]} ${Math.round(Math.min(35, spread[c.k] * 50))}%, transparent)` }}>{c.label}<div className="text-[9px] font-normal text-ink3 normal-case tracking-normal">spread {fmt.pct(spread[c.k])}</div></th>)}</tr></thead>
            <tbody>
              {cells.map(c => (
                <tr key={c.model + c.harness} className={c.harness === harness ? 'bg-panel2/40' : ''}>
                  <td className="text-ink2 text-[12px]">{c.model.split('/').pop()}</td>
                  <td><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: harnessColor(c.harness) }} />{c.harness}</span></td>
                  <td className="text-right text-ink2">{c.runs}</td>
                  {COLS.map(col => <td key={col.k} className={`text-right ${col.hi ? 'font-medium' : 'text-ink2'}`}>{col.f(c[col.k])}</td>)}
                </tr>
              ))}
            </tbody>
          </Tbl>
        </div>
        <div className="px-4 pb-3"><Note>Vats &amp; Golev (2026) found a 40× spread in tokens per solved task across harnesses at equal pass rate. Look at the shading: pass@1 barely moves; cost, verification and conduct columns move a lot. A leaderboard row that says "model M: 67%" is missing this table.</Note></div>
      </Card>

      <VersionsStrip results={results} />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-6" title="Paired bootstrap vs baseline" right={<>
          <span>baseline</span><select className="input !w-auto !py-0.5" value={baseline} onChange={e => setBaseline(e.target.value)}>{harnesses.map(h => <option key={h}>{h}</option>)}</select></>}>
          {cmpRows.length === 0 ? <Empty>Need at least two harnesses sharing tasks.</Empty> : (
            <div className="h-[230px]">
              <ResponsiveContainer>
                <BarChart data={cmpRows} layout="vertical" margin={{ top: 4, right: 30, bottom: 0, left: 20 }}>
                  <CartesianGrid stroke={GRID.stroke} strokeDasharray="2 4" horizontal={false} />
                  <XAxis type="number" domain={[-0.6, 0.6]} tickFormatter={v => (v > 0 ? '+' : '') + (v * 100).toFixed(0) + 'pp'} {...AX} />
                  <YAxis type="category" dataKey="h" width={110} {...AX} />
                  <Tooltip {...TT} formatter={(v, n, p) => [`${(p.payload.d * 100).toFixed(1)}pp  CI [${(p.payload.lo * 100).toFixed(0)}, ${(p.payload.hi * 100).toFixed(0)}] over ${p.payload.n} tasks`, 'Δ pass@1']} />
                  <ReferenceLine x={0} stroke={ink2} />
                  <Bar dataKey="d" radius={4} maxBarSize={18}>
                    {cmpRows.map((r, i) => <Cell key={i} fill={r.lo > 0 ? SERIES[2] : r.hi < 0 ? SERIES[7] : ink3} />)}
                    <ErrorBar dataKey="err" direction="x" width={6} stroke={ink} strokeWidth={1.5} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <Note>Tasks are resampled, not runs, because the same tasks were run under both conditions. Grey = the interval crosses zero: no honest claim of a difference. This is the same test the exercise-2 script prints.</Note>
        </Card>

        <Card className="col-span-12 xl:col-span-6" title="Model family × harness" right={<span>{models.length} model{models.length === 1 ? '' : 's'} in this directory</span>}>
          {models.length < 2 ? (
            <Empty>Run the same harnesses on two or more OpenRouter models (Command center → pick several model chips) and this becomes a sensitivity heatmap: does the harness effect shrink or persist across families?</Empty>
          ) : <Heatmap cells={cells} models={models} harnesses={harnesses} />}
        </Card>
      </div>

      <DiffCard results={results} models={models} defaultA={harnesses.includes('baseline') ? 'baseline' : harnesses[0]} defaultB={harnesses.find(h => h !== (harnesses.includes('baseline') ? 'baseline' : harnesses[0]))} />

      <RankingCard results={results} />

      <AblationCard overview={overview} onSaved={reloadOverview} />

      <Editor overview={overview} baseline={harnesses.includes('baseline') ? 'baseline' : harnesses[0]} onSaved={reloadOverview} />
    </div>
  )
}

/* ------------------------------------------------------------------ versions & drift ---- */
function VersionsStrip({ results }) {
  const v = useFetch(results ? `/harness/versions?dir=${results}` : null, [results])
  const d = v.data
  if (!d) return null
  const drift = d.drift || []
  return (
    <Card title="Harness versions in this directory" right={<>
      <span>{d.n_versions} distinct (id, hash) · {d.runs} runs</span>
      {drift.length > 0 ? <Badge tone="critical" dot>{drift.length} drifted</Badge> : <Badge tone="good">no drift</Badge>}
    </>}>
      <div className="flex flex-wrap gap-1.5">
        {(d.versions || []).map(x => (
          <span key={x.harness_id + x.hash} title={`${x.runs} runs · ${x.models.join(', ')} · ${x.n_tasks} tasks · pass@1 ${fmt.pct(x.pass1)}${x.first_seen ? ` · first ${x.first_seen}` : ''}`}
            className={`chip ${x.matches_current === false ? 'border-critical/50 text-critical-ink bg-critical/10' : x.matches_current ? 'border-good/40 text-good-ink bg-good/10' : 'border-line2 text-ink2 bg-panel2'}`}>
            {x.harness_id} <span className="mono text-ink3">{x.hash}</span> <span className="text-ink3">×{x.runs}</span>
            {x.matches_current === false && ' ⚠'}
            {x.matches_current === null && <span className="text-ink3" title="no harnesses/&lt;id&gt;.json to compare against">·no file</span>}
          </span>
        ))}
      </div>
      {drift.map(x => (
        <div key={x.harness_id + x.hash} className="mt-2 text-[12px] text-critical-ink border-l-2 border-critical/60 pl-3 leading-relaxed">
          {x.message} Fields that changed since: <span className="mono">{x.changed_fields.join(', ') || '—'}</span>.
        </div>
      ))}
      {d.multi_version?.length > 0 && (
        <div className="mt-2 text-[12px] text-warn-ink border-l-2 border-warn/60 pl-3">
          <span className="mono">{d.multi_version.join(', ')}</span> ran under more than one configuration in this directory. Rows with different hashes are different cells even though they share a name — pool them and the comparison is not a comparison.
        </div>
      )}
      <Note>The hash is sha256 over the harness config with <span className="mono">id</span> and <span className="mono">notes</span> excluded and <span className="mono">tools</span> sorted, so renaming or re-annotating a harness does not invent a new version, and reordering the tool list does not either. {d.note}</Note>
    </Card>
  )
}

/* ------------------------------------------------------------------ diff two harnesses ---- */
function CIBar({ lo, hi, d, tone, width = 132 }) {
  const { STATUS, ink3, line } = useChartTheme()
  if (lo == null || hi == null || d == null) return <span className="text-ink3">—</span>
  const M = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(d), 1e-12) * 1.08
  const x = (v) => ((v + M) / (2 * M)) * 100
  const col = tone === 'good' ? STATUS.good : tone === 'bad' ? STATUS.critical : tone === 'neutral-moved' ? STATUS.warn : ink3
  return (
    <div className="relative h-3 shrink-0" style={{ width }}>
      <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: line }} />
      <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: ink3, opacity: 0.7 }} />
      <div className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full" style={{ left: `${x(lo)}%`, width: `${Math.max(1, x(hi) - x(lo))}%`, background: col, opacity: 0.55 }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full" style={{ left: `calc(${x(d)}% - 3.5px)`, background: col }} />
    </div>
  )
}

const UNIT_FMT = { rate: v => fmt.pct(v, 1), usd: v => fmt.usd(v, 4), count: v => fmt.num(v, 1) }
const DELTA_FMT = {
  rate: v => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + 'pp',
  usd: v => (v > 0 ? '+' : '') + '$' + v.toFixed(4),
  count: v => (v > 0 ? '+' : '') + v.toFixed(1),
}

function DiffCard({ results, models, defaultA, defaultB }) {
  const list = useFetch(results ? `/harness/list?dir=${results}` : '/harness/list', [results])
  const ids = (list.data || []).map(h => h.id)
  const [a, setA] = useState(defaultA || 'baseline')
  const [b, setB] = useState(defaultB || '')
  const [model, setModel] = useState('')
  const [allFields, setAllFields] = useState(false)
  useEffect(() => { if (ids.length && !ids.includes(a)) setA(ids[0]) }, [ids.join()]) // eslint-disable-line
  useEffect(() => { if (ids.length && !ids.includes(b)) setB(ids.find(x => x !== a) || ids[0]) }, [ids.join(), a]) // eslint-disable-line
  const q = a && b ? `/harness/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}${results ? `&dir=${results}` : ''}${model ? `&model=${encodeURIComponent(model)}` : ''}` : null
  const r = useFetch(q, [a, b, results, model])
  const d = r.data

  const sel = (v, set) => <select className="input !w-auto !py-0.5 mono" value={v} onChange={e => set(e.target.value)}>{ids.map(x => <option key={x}>{x}</option>)}</select>

  return (
    <Card title="Diff two harnesses: what changed, and which numbers moved because of it" right={<>
      {sel(a, setA)}<span>vs</span>{sel(b, setB)}
      {models.length > 1 && <select className="input !w-auto !py-0.5" value={model} onChange={e => setModel(e.target.value)}>
        <option value="">all models</option>{models.map(m => <option key={m} value={m}>{m.split('/').pop()}</option>)}
      </select>}
      {d && <><span className="mono text-ink3">{d.a.hash}</span><span>→</span><span className="mono text-ink3">{d.b.hash}</span></>}
    </>}>
      {r.loading && !d ? <Spinner label="diffing" /> : !d ? <Empty>Pick two harnesses.</Empty> : (
        <div className="grid grid-cols-12 gap-4">
          {/* ---------------- field diff */}
          <div className="col-span-12 xl:col-span-5">
            <div className="flex items-center gap-2 mb-1.5 text-[11px] text-ink3">
              <span className="font-semibold uppercase tracking-[0.08em]">config</span>
              {d.same_hash ? <Badge tone="warn">identical content hash — these are the same cell under two names</Badge>
                : <Badge tone="violet">{d.changed_fields.length} knob{d.changed_fields.length === 1 ? '' : 's'} differ</Badge>}
              <button className="ml-auto hover:text-ink" onClick={() => setAllFields(v => !v)}>{allFields ? 'changed only' : 'show all fields'}</button>
            </div>
            <Tbl>
              <thead><tr><th>knob</th><th className="text-right">{a}</th><th className="text-right">{b}</th></tr></thead>
              <tbody>
                {(d.fields || []).filter(f => allFields || f.changed).map(f => (
                  <tr key={f.field} className={f.changed && !f.cosmetic ? 'bg-panel2/40' : ''}>
                    <td className="align-top">
                      <div className="mono text-[12px] flex items-center gap-1.5">{f.field}{f.cosmetic && <span className="text-ink3 text-[10px]">(not hashed)</span>}</div>
                      <div className="text-[11px] text-ink3 leading-snug max-w-[300px] whitespace-normal">{f.knob}</div>
                    </td>
                    <td className="text-right align-top"><Val v={f.a} /></td>
                    <td className={`text-right align-top ${f.changed && !f.cosmetic ? 'text-accent-ink' : ''}`}><Val v={f.b} /></td>
                  </tr>
                ))}
              </tbody>
            </Tbl>
          </div>

          {/* ---------------- metrics that moved */}
          <div className="col-span-12 xl:col-span-7">
            <div className="flex items-center gap-2 mb-1.5 text-[11px] text-ink3 flex-wrap">
              <span className="font-semibold uppercase tracking-[0.08em]">measured effect</span>
              <span>{d.runs.a} vs {d.runs.b} runs in <span className="mono">{d.dir || '—'}</span></span>
              {d.paired ? <Badge tone="good">task-paired</Badge> : <Badge tone="warn" dot>not paired</Badge>}
              {d.seeds_match === true && <Badge tone="good">seed-matched</Badge>}
              {d.seeds_match === false && <Badge tone="warn">seeds differ</Badge>}
            </div>
            {!d.metrics?.length ? <Empty>{d.note || 'No runs for these two harnesses in this directory.'}</Empty> : (
              <>
                <Tbl>
                  <thead><tr><th>metric</th><th className="text-right">{a}</th><th className="text-right">{b}</th><th className="text-right">Δ (b−a)</th><th>95% CI</th><th className="text-right">verdict</th></tr></thead>
                  <tbody>
                    {d.metrics.map(m => {
                      const f = UNIT_FMT[m.unit] || fmt.num
                      const good = m.higher_is_better == null ? null : (m.mean_diff > 0) === m.higher_is_better
                      const tone = !m.moved ? 'flat' : good == null ? 'neutral-moved' : good ? 'good' : 'bad'
                      return (
                        <tr key={m.key} className={m.moved ? '' : 'text-ink3'}>
                          <td title={m.label}>{m.label}</td>
                          <td className="text-right tabular-nums">{f(m.a)}</td>
                          <td className="text-right tabular-nums">{f(m.b)}</td>
                          <td className={`text-right tabular-nums font-medium ${tone === 'good' ? 'text-good-ink' : tone === 'bad' ? 'text-critical-ink' : tone === 'neutral-moved' ? 'text-warn-ink' : ''}`}>
                            {m.mean_diff == null ? '—' : (DELTA_FMT[m.unit] || (v => fmt.num(v, 2)))(m.mean_diff)}
                          </td>
                          <td><div className="flex items-center gap-2">
                            <CIBar lo={m.ci95?.[0]} hi={m.ci95?.[1]} d={m.mean_diff} tone={tone} />
                            <span className="mono text-[10.5px] text-ink3 tabular-nums whitespace-nowrap">
                              {m.ci95 ? `[${(DELTA_FMT[m.unit] || (v => fmt.num(v, 2)))(m.ci95[0])}, ${(DELTA_FMT[m.unit] || (v => fmt.num(v, 2)))(m.ci95[1])}]` : '—'}
                            </span>
                          </div></td>
                          <td className="text-right">{m.moved == null ? '—' : m.moved ? <Badge tone={tone === 'good' ? 'good' : tone === 'bad' ? 'critical' : 'warn'}>moved</Badge> : <span className="text-ink3">did not move</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Tbl>
                <div className={`mt-2 text-[12px] leading-relaxed border-l-2 pl-3 ${d.paired ? 'border-line2 text-ink3' : 'border-warn/60 text-warn-ink'}`}>{d.pairing_note}</div>
                <Note>"Moved" means the 95% bootstrap interval excludes zero — nothing more. Rows in grey are the ones a leaderboard would have reported as unchanged; rows in colour are the ones a leaderboard never prints. Δ is b minus a, over {d.metrics[0]?.n_tasks ?? '—'} tasks.</Note>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function Val({ v }) {
  if (v === null || v === undefined) return <span className="text-ink3">—</span>
  if (typeof v === 'boolean') return <span className="mono text-[12px]">{String(v)}</span>
  if (typeof v === 'number') return <span className="mono text-[12px] tabular-nums">{v.toLocaleString()}</span>
  if (Array.isArray(v)) return <span className="mono text-[11px] whitespace-normal inline-block max-w-[220px]">{v.length ? v.join(', ') : '[]'}</span>
  if (typeof v === 'object') return <span className="mono text-[11px] whitespace-normal inline-block max-w-[220px]">{JSON.stringify(v)}</span>
  const s = String(v)
  return <span className="text-[11.5px] whitespace-normal inline-block max-w-[240px] text-left" title={s}>{s.length > 160 ? s.slice(0, 160) + '…' : s}</span>
}

/* ------------------------------------------------------------------ ranking stability ---- */
function RankingCard({ results }) {
  const [outcome, setOutcome] = useState('hidden_pass')
  const r = useFetch(results ? `/harness/ranking?dir=${results}&outcome=${outcome}` : null, [results, outcome])
  const { STATUS, ink3, panel2 } = useChartTheme()
  const d = r.data
  const tauColor = (t) => {
    if (t == null) return panel2
    const c = t >= 0.8 ? STATUS.good : t >= 0.4 ? STATUS.warn : t >= 0 ? STATUS.serious : STATUS.critical
    return `color-mix(in srgb, ${c} ${Math.round(35 + Math.abs(t) * 45)}%, transparent)`
  }
  const hs = d?.harnesses?.filter(h => d.grid && h in d.grid) || []
  const tau = {}
  for (const p of d?.tau_pairs || []) { tau[p.a + '|' + p.b] = p.tau; tau[p.b + '|' + p.a] = p.tau }

  return (
    <Card title="Ranking stability: does the leaderboard survive a change of harness?" right={<>
      <span>outcome</span>
      <select className="input !w-auto !py-0.5" value={outcome} onChange={e => setOutcome(e.target.value)}>
        <option value="hidden_pass">hidden_pass</option><option value="strong_pass">strong_pass</option><option value="visible_pass">visible_pass</option>
      </select>
      {d && !d.insufficient && <span>{d.models.length} models × {hs.length} harnesses · {d.n_tasks} tasks</span>}
    </>}>
      {r.loading && !d ? <Spinner label="ranking" /> : !d ? <Empty>No results directory.</Empty> : d.insufficient ? (
        <Empty>{d.insufficient}</Empty>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-5">
            <div className="text-[11px] text-ink3 mb-1.5 font-semibold uppercase tracking-[0.08em]">Kendall τ between harness rankings</div>
            <div className="overflow-x-auto">
              <Tbl nowrap>
                <thead><tr><th></th>{hs.map(h => <th key={h} className="text-center">{h}</th>)}</tr></thead>
                <tbody>
                  {hs.map(ha => (
                    <tr key={ha}><td className="mono text-[11.5px]">{ha}</td>
                      {hs.map(hb => {
                        const t = ha === hb ? 1 : tau[ha + '|' + hb]
                        return <td key={hb} className="text-center">
                          <span className="inline-block min-w-[48px] px-2 py-1 rounded-md text-[12px] tabular-nums" style={{ background: ha === hb ? panel2 : tauColor(t), color: ha === hb ? ink3 : undefined }}>{t == null ? '—' : t.toFixed(2)}</span>
                        </td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </Tbl>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[12px]">
              <span className="text-ink3">mean τ</span>
              <span className="text-[17px] font-semibold tabular-nums">{fmt.num(d.mean_tau, 2)}</span>
              {d.mean_tau_ci95 && <span className="mono text-[11px] text-ink3">95% CI [{fmt.num(d.mean_tau_ci95[0], 2)}, {fmt.num(d.mean_tau_ci95[1], 2)}] · {d.bootstrap_B} task bootstraps</span>}
            </div>
          </div>

          <div className="col-span-12 xl:col-span-7">
            <div className="text-[11px] text-ink3 mb-1.5 font-semibold uppercase tracking-[0.08em]">per-model rank range and harness sensitivity</div>
            <Tbl>
              <thead><tr><th>model</th>{hs.map(h => <th key={h} className="text-right">{h}</th>)}<th className="text-right">rank range</th><th className="text-right">sensitivity (max−min pass@1)</th></tr></thead>
              <tbody>
                {(d.per_model || []).map(p => (
                  <tr key={p.model}>
                    <td className="text-[12px]">{p.model.split('/').pop()}</td>
                    {hs.map(h => (
                      <td key={h} className="text-right tabular-nums">
                        {p.by_harness[h] == null ? <span className="text-ink3">—</span> : <>{fmt.pct(p.by_harness[h])} <span className="text-ink3 text-[10.5px]">#{p.ranks[h]}</span></>}
                      </td>
                    ))}
                    <td className={`text-right tabular-nums font-medium ${p.rank_range > 0 ? 'text-warn-ink' : 'text-ink3'}`}>{p.rank_range === 0 ? '0 (stable)' : `${p.best_rank}–${p.worst_rank}`}</td>
                    <td className="text-right tabular-nums">{fmt.pct(p.sensitivity, 1)}
                      {p.sensitivity_ci95 && <span className="mono text-[10.5px] text-ink3"> [{fmt.pct(p.sensitivity_ci95[0], 0)}, {fmt.pct(p.sensitivity_ci95[1], 0)}]</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tbl>
          </div>

          <div className="col-span-12">
            <div className={`text-[12.5px] leading-relaxed border-l-2 pl-3 ${(d.mean_tau ?? 1) >= 0.8 ? 'border-good/60 text-ink2' : (d.mean_tau ?? 0) >= 0.4 ? 'border-warn/60 text-warn-ink' : 'border-critical/60 text-critical-ink'}`}>
              {d.finding}
            </div>
            <Note>{d.caveat}</Note>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ ablation sweep ---- */
function AblationCard({ overview, onSaved }) {
  const { results, setResults, go } = useApp()
  const hs = overview?.harnesses || []
  const knobs = useFetch('/harness/knobs', [])
  const allFactors = Object.keys(knobs.data?.factors || {})
  const [base, setBase] = useState('baseline')
  const [factors, setFactors] = useState(null)          // null = all
  const [modelsTxt, setModelsTxt] = useState('mock')
  const [repeats, setRepeats] = useState(3)
  const [out, setOut] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => { if (hs.length && !hs.find(h => h.id === base)) setBase(hs[0].id) }, [hs.length]) // eslint-disable-line
  useEffect(() => { setOut(`ablate_${base}`.replace(/[^a-zA-Z0-9_-]/g, '_')) }, [base])
  const fsel = factors === null ? allFactors : factors
  const q = base ? `/harness/ablate/plan?base=${encodeURIComponent(base)}&models=${encodeURIComponent(modelsTxt)}&repeats=${repeats}&out=${encodeURIComponent(out || 'ablate')}${factors ? `&factors=${encodeURIComponent(factors.join(','))}` : ''}` : null
  const p = useFetch(q, [base, factors?.join(), modelsTxt, repeats, out, tick])
  const d = p.data
  const toggleF = (f) => setFactors(cur => {
    const c = cur === null ? allFactors : cur
    return c.includes(f) ? c.filter(x => x !== f) : [...c, f]
  })

  async function save() {
    setBusy(true); setMsg('')
    try {
      const r = await api('/harness/ablate', { method: 'POST', body: { base, factors: fsel, save: true, models: modelsTxt.split(',').map(s => s.trim()).filter(Boolean), repeats, out } })
      setMsg(`saved ${r.saved.length} harness file${r.saved.length === 1 ? '' : 's'}${r.skipped_existing.length ? `, ${r.skipped_existing.length} already existed (not overwritten)` : ''}`)
      onSaved?.(); setTick(t => t + 1)
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  async function launch() {
    setBusy(true); setMsg('')
    try {
      const r = await api('/harness/ablate', { method: 'POST', body: { base, factors: fsel, save: true, models: modelsTxt.split(',').map(s => s.trim()).filter(Boolean), repeats, out } })
      await api('/jobs', { method: 'POST', body: r.job })
      onSaved?.(); setResults(r.job.out); setMsg(`launched ${r.n_runs} runs → data/runs/${r.job.out}`)
      go('runs')
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }

  return (
    <Card title="Ablation sweep: turn one knob at a time and measure each one" right={<>
      <span>base</span>
      <select className="input !w-auto !py-0.5 mono" value={base} onChange={e => setBase(e.target.value)}>{hs.map(h => <option key={h.id}>{h.id}</option>)}</select>
      {d && <span className="mono text-ink3">{d.base_hash}</span>}
    </>}>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-4 space-y-3">
          <div>
            <div className="text-[11px] text-ink3 mb-1.5">factors ({fsel.length} of {allFactors.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {allFactors.map(f => (
                <button key={f} onClick={() => toggleF(f)} title={knobs.data?.factors?.[f]}
                  className={`chip cursor-pointer mono ${fsel.includes(f) ? 'border-s7 text-s7 bg-s7/15' : 'border-line2 text-ink3'}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-ink3 col-span-2">models (comma separated)<input className="input mt-1 mono" value={modelsTxt} onChange={e => setModelsTxt(e.target.value)} /></label>
            <label className="text-[11px] text-ink3">repeats<input className="input mt-1" type="number" min={1} max={20} value={repeats} onChange={e => setRepeats(+e.target.value || 1)} /></label>
            <label className="text-[11px] text-ink3 col-span-3">results dir<input className="input mt-1 mono" value={out} onChange={e => setOut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} /></label>
          </div>
          {d && (
            <div className="rounded-lg border border-line bg-panel2/50 p-3 text-[12px] space-y-1">
              <div className="flex justify-between"><span className="text-ink3">variants</span><span className="tabular-nums">{d.n_variants}</span></div>
              <div className="flex justify-between"><span className="text-ink3">cells (base + variants)</span><span className="tabular-nums">{d.n_harnesses}</span></div>
              <div className="flex justify-between"><span className="text-ink3">× tasks × repeats × models</span><span className="tabular-nums">{d.n_tasks} × {d.repeats} × {d.n_models}</span></div>
              <div className="flex justify-between border-t border-line pt-1 mt-1"><span className="font-medium">runs</span><span className="tabular-nums font-semibold text-[14px]">{d.n_runs}</span></div>
              <div className="flex justify-between"><span className="text-ink3">est. spend</span><span className="tabular-nums">{d.estimate.usd ? fmt.usd(d.estimate.usd, 2) : '$0'}</span></div>
              <div className="text-[11px] text-ink3 leading-snug">{d.estimate.basis}</div>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn" onClick={save} disabled={busy || !d}>Save {d?.n_variants || 0} variants</button>
            <button className="btn btn-primary" onClick={launch} disabled={busy || !d || !d.n_runs}>Launch sweep ({d?.n_runs || 0} runs)</button>
          </div>
          {msg && <div className="text-[12px] text-ink2">{msg}</div>}
          <Note>Launch saves the variant files first (never overwriting an existing one), then POSTs the plan to <span className="mono">/api/jobs</span> — the same endpoint the Command center uses, so the sweep shows up there live. {d?.caveat}</Note>
        </div>

        <div className="col-span-12 xl:col-span-8">
          {p.loading && !d ? <Spinner label="planning" /> : !d ? <Empty>Pick a base harness.</Empty> : (
            <Tbl>
              <thead><tr><th>variant</th><th>factor</th><th>change</th><th className="text-right">hash</th><th className="text-right">state</th></tr></thead>
              <tbody>
                {d.variants.map(v => (
                  <tr key={v.id}>
                    <td className="mono text-[11.5px]">{v.id}</td>
                    <td className="text-ink2 text-[11.5px] mono">{v.factor}</td>
                    <td className="text-[11.5px] text-ink2 whitespace-normal max-w-[340px]">{v.change}</td>
                    <td className="text-right mono text-[11px] text-ink3">{v.hash}</td>
                    <td className="text-right">
                      {v.duplicate_of ? <Badge tone="accent">= {v.duplicate_of}</Badge>
                        : v.exists ? <Badge tone="good">file exists</Badge>
                          : <span className="text-ink3 text-[11.5px]">new</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tbl>
          )}
          {d?.variants?.some(v => v.duplicate_of) && (
            <Note>A variant marked <span className="mono">= &lt;id&gt;</span> hashes to a harness that already exists under another name: the grid rediscovered it, and the sweep runs it once, under the name it already has.</Note>
          )}
        </div>
      </div>
    </Card>
  )
}

function Heatmap({ cells, models, harnesses }) {
  const [metric, setMetric] = useState('pass@1')
  const { panel2 } = useChartTheme()
  const vals = cells.map(c => c[metric]).filter(v => v != null && Number.isFinite(v))
  const mn = Math.min(...vals), mx = Math.max(...vals)
  const color = (v) => {
    if (v == null || !Number.isFinite(v)) return panel2
    const t = mx === mn ? 0.5 : (v - mn) / (mx - mn)
    const tt = metric === 'pass@1' || metric === 'ran_tests_before_submit' ? t : 1 - t
    // single-hue sequential blue ramp (100 → 700)
    const ramp = SEQ_BLUE
    return ramp[Math.round(tt * (ramp.length - 1))]
  }
  const sens = models.map(mdl => {
    const v = harnesses.map(h => cells.find(c => c.model === mdl && c.harness === h)?.[metric]).filter(x => x != null && Number.isFinite(x))
    return { mdl, range: v.length ? Math.max(...v) - Math.min(...v) : null }
  })
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-[12px] text-ink3">metric
        <select className="input !w-auto !py-0.5" value={metric} onChange={e => setMetric(e.target.value)}>
          {COLS.map(c => <option key={c.k} value={c.k}>{c.label}</option>)}
        </select>
        <span className="ml-auto">darker = better</span>
      </div>
      <div className="overflow-x-auto">
        <Tbl>
          <thead><tr><th>model</th>{harnesses.map(h => <th key={h} className="text-center">{h}</th>)}<th className="text-right">harness sensitivity</th></tr></thead>
          <tbody>
            {models.map(mdl => (
              <tr key={mdl}>
                <td className="text-[12px]">{mdl.split('/').pop()}</td>
                {harnesses.map(h => {
                  const c = cells.find(x => x.model === mdl && x.harness === h)
                  const v = c?.[metric]
                  const bg = color(v)
                  return <td key={h} className="text-center"><span className="inline-block min-w-[64px] px-2 py-1 rounded-md text-[12px] font-medium" style={{ background: bg, color: c ? seqText(bg) : undefined }}>{c ? COLS.find(x => x.k === metric).f(v) : '—'}</span></td>
                })}
                <td className="text-right text-ink2">{COLS.find(x => x.k === metric).f(sens.find(s => s.mdl === mdl)?.range)}</td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </div>
      <Note>"Harness sensitivity" is the max–min of the metric across harnesses for that model. If stronger families show a smaller range, the harness matters less as models improve; if the range persists, harness is a permanent part of the cell and must be reported with the score.</Note>
    </div>
  )
}

function Editor({ overview, baseline, onSaved }) {
  const hs = overview?.harnesses || []
  const [srcId, setSrcId] = useState('baseline')
  const [cfg, setCfg] = useState(null)
  const [msg, setMsg] = useState('')
  const [prediction, setPrediction] = useState(localStorage.getItem('hs.prediction') || '')
  useEffect(() => { localStorage.setItem('hs.prediction', prediction) }, [prediction])
  useEffect(() => {
    const h = hs.find(x => x.id === srcId)
    if (h && !cfg) { const { file, ...rest } = h; setCfg({ ...rest, id: 'mine' }) } // eslint-disable-line
  }, [hs.length, srcId]) // eslint-disable-line
  const base = hs.find(x => x.id === baseline)
  if (!cfg) return null
  const ALL_TOOLS = ['list_files', 'read_file', 'write_file', 'edit_file', 'run_tests', 'bash', 'submit']
  const diffs = base ? Object.keys(cfg).filter(k => k !== 'id' && k !== 'notes' && JSON.stringify(cfg[k]) !== JSON.stringify(base[k])) : []
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  async function save() {
    try {
      await api('/harnesses', { method: 'POST', body: { config: cfg } })
      setMsg(`saved harnesses/${cfg.id}.json — it is now selectable in the Command center`); onSaved?.()
    } catch (e) { setMsg(e.message) }
  }
  return (
    <Card title="Make your own harness: change one thing, predict which columns move" right={<>
      <span>start from</span><select className="input !w-auto !py-0.5" value={srcId} onChange={e => { setSrcId(e.target.value); const h = hs.find(x => x.id === e.target.value); if (h) { const { file, ...rest } = h; setCfg({ ...rest, id: cfg.id }) } }}>{hs.map(h => <option key={h.id}>{h.id}</option>)}</select>
      {diffs.length > 0 && <Badge tone="violet">{diffs.length} field{diffs.length > 1 ? 's differ' : ' differs'} from {baseline}: {diffs.join(', ')}</Badge>}
    </>}>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-5 space-y-3">
          <label className="block text-[11px] text-ink3">id<input className="input mt-1 mono" value={cfg.id} onChange={e => set('id', e.target.value.replace(/[^a-zA-Z0-9_+-]/g, ''))} /></label>
          <div>
            <div className="text-[11px] text-ink3 mb-1.5">tool surface</div>
            <div className="flex flex-wrap gap-1.5">{ALL_TOOLS.map(t => <button key={t} onClick={() => set('tools', cfg.tools.includes(t) ? cfg.tools.filter(x => x !== t) : [...cfg.tools, t])} className={`chip cursor-pointer mono ${cfg.tools.includes(t) ? 'border-accent text-accent-ink bg-accent/15' : 'border-line2 text-ink3'}`}>{t}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-ink3">policy<select className="input mt-1" value={cfg.policy} onChange={e => set('policy', e.target.value)}><option>strict</option><option>permissive</option></select></label>
            <label className="text-[11px] text-ink3">max_steps<input className="input mt-1" type="number" value={cfg.max_steps} onChange={e => set('max_steps', +e.target.value)} /></label>
            <label className="text-[11px] text-ink3">context_window (0 = full)<input className="input mt-1" type="number" value={cfg.context_window} onChange={e => set('context_window', +e.target.value)} /></label>
            <label className="text-[11px] text-ink3">temperature<input className="input mt-1" type="number" step="0.1" value={cfg.temperature} onChange={e => set('temperature', +e.target.value)} /></label>
            <label className="text-[11px] text-ink3">max_total_tokens<input className="input mt-1" type="number" value={cfg.max_total_tokens} onChange={e => set('max_total_tokens', +e.target.value)} /></label>
            <label className="text-[11px] text-ink3">observation_chars<input className="input mt-1" type="number" value={cfg.observation_chars} onChange={e => set('observation_chars', +e.target.value)} /></label>
          </div>
          <div className="flex items-center gap-4">
            <Toggle checked={cfg.include_file_listing} onChange={v => set('include_file_listing', v)} label="include file listing in the task prompt" />
          </div>
          <div className="border-t border-line pt-2">
            <div className="flex items-center justify-between mb-1"><span className="text-[11px] text-ink3">sentinel (part of the harness)</span><Toggle checked={!!cfg.sentinel?.enabled} onChange={v => set('sentinel', { ...(cfg.sentinel || {}), enabled: v, mode: cfg.sentinel?.mode || 'intervene', threshold: cfg.sentinel?.threshold ?? 0.6 })} label={cfg.sentinel?.enabled ? 'on' : 'off'} /></div>
            {cfg.sentinel?.enabled && <textarea className="input mono h-20" value={JSON.stringify(cfg.sentinel, null, 1)} onChange={e => { try { set('sentinel', JSON.parse(e.target.value)) } catch { /* keep typing */ } }} />}
          </div>
        </div>
        <div className="col-span-12 xl:col-span-7 space-y-3">
          <label className="block text-[11px] text-ink3">system prompt<textarea className="input mt-1 h-28 leading-relaxed" value={cfg.system_prompt} onChange={e => set('system_prompt', e.target.value)} /></label>
          <label className="block text-[11px] text-ink3">notes<input className="input mt-1" value={cfg.notes || ''} onChange={e => set('notes', e.target.value)} /></label>
          <label className="block text-[11px] text-ink3">your prediction, in writing, before you run it: which columns will move, and which way?<textarea className="input mt-1 h-16" value={prediction} onChange={e => setPrediction(e.target.value)} placeholder="e.g. dropping bash: boundary → 0, verified unchanged, tok/solve down slightly, pass@1 flat" /></label>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={save} disabled={!cfg.id}>Save harnesses/{cfg.id}.json</button>
            <span className="text-[12px] text-ink3">{msg}</span>
          </div>
          <Note>Then: Command center → select <span className="mono">{baseline}</span> and <span className="mono">{cfg.id}</span>, mock provider, 5 repeats. Compare here. If you have budget, repeat with 3 tasks × 3 repeats live.</Note>
        </div>
      </div>
    </Card>
  )
}
