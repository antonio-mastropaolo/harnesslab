import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { api, useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Stat, Badge, Empty, Spinner, Note, Tbl, useChartTheme } from '../ui'

export default function Judge() {
  const { results, overview, events } = useApp()
  const { TT, AX, GRID, SERIES } = useChartTheme()
  const j = useFetch('/judge', [events.tick])
  const [cfg, setCfg] = useState({ judge: 'mock', model: 'openai/gpt-5-mini', n: 24, repeats: 2 })
  const [msg, setMsg] = useState('')
  const running = j.data?.status === 'running'
  const r = j.data?.report
  async function run() {
    setMsg('')
    try { await api('/judge/run', { method: 'POST', body: { results, ...cfg } }) } catch (e) { setMsg(e.message) }
  }
  const s = r?.single
  const conf = s?.confusion
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-4" title="Calibrate a judge against the oracle you have" right={<span>{results}</span>}>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-ink3">judge
                <select className="input mt-1" value={cfg.judge} onChange={e => setCfg(c => ({ ...c, judge: e.target.value }))}>
                  <option value="mock">mock judge (biased on purpose, offline)</option>
                  <option value="openrouter" disabled={!overview?.key_present}>OpenRouter model {overview?.key_present ? '' : '(set a key)'}</option>
                </select></label>
              <label className="text-[11px] text-ink3">model<input className="input mt-1 mono" disabled={cfg.judge === 'mock'} value={cfg.model} onChange={e => setCfg(c => ({ ...c, model: e.target.value }))} /></label>
              <label className="text-[11px] text-ink3">patches (half pass, half fail)<input className="input mt-1" type="number" min={6} max={80} value={cfg.n} onChange={e => setCfg(c => ({ ...c, n: +e.target.value }))} /></label>
              <label className="text-[11px] text-ink3">repeats (test–retest)<input className="input mt-1" type="number" min={1} max={4} value={cfg.repeats} onChange={e => setCfg(c => ({ ...c, repeats: +e.target.value }))} /></label>
            </div>
            <button className="btn btn-primary w-full justify-center" onClick={run} disabled={running}>{running ? `running · ${j.data?.stage || ''}` : `Judge ${cfg.n} patches × ${cfg.repeats}`}</button>
            {(msg || j.data?.error) && <div className="text-[12px] text-critical">{msg || j.data.error}</div>}
            <Note>The hidden tests are the oracle here, so the judge's own error is measurable — exactly what you cannot do on a benchmark without one. A live judge on 24 patches × 2 costs about $0.30 with a small model.</Note>
          </div>
          {j.data?.history?.length > 0 && (
            <Tbl className="mt-3"><thead><tr><th>judge</th><th className="text-right">n</th><th className="text-right">agree</th><th className="text-right">κ</th><th className="text-right">retest</th><th className="text-right">swap-consistent</th></tr></thead>
              <tbody>{j.data.history.map((h, i) => <tr key={i}><td className="text-[12px]">{h.model.split('/').pop()} <span className="text-ink3">{h.results}</span></td><td className="text-right">{h.n}</td><td className="text-right">{fmt.pct(h.agreement)}</td><td className="text-right font-medium">{fmt.num(h.kappa, 2)}</td><td className="text-right">{fmt.pct(h.test_retest)}</td><td className="text-right">{fmt.pct(h.position_consistent)}</td></tr>)}</tbody></Tbl>
          )}
        </Card>

        <div className="col-span-12 xl:col-span-8 space-y-4">
          {!r ? <Empty>Run the mock judge first (no key needed). Then compare with a real model.</Empty> : (
            <>
              <div className="stats">
                <Stat label="raw agreement" value={fmt.pct(s.agreement)} sub="what papers report" />
                <Stat label="Cohen's κ" value={fmt.num(s.kappa, 2)} tone={s.kappa < 0.6 ? 'warn' : 'good'} sub="chance-corrected" />
                <Stat label="test–retest" value={fmt.pct(s.test_retest)} sub={`same verdict on all ${r.repeats} repeats`} />
                <Stat label="position-consistent" value={r.pairwise ? fmt.pct(r.pairwise.position_consistent) : '—'} tone={r.pairwise && r.pairwise.position_consistent < 0.8 ? 'serious' : undefined} sub={r.pairwise ? `P(pick A) ${fmt.num(r.pairwise.p_pick_A_first, 2)} → ${fmt.num(r.pairwise.p_pick_A_after_swap, 2)} after swap` : 'no pairs'} />
                <Stat label="spend" value={fmt.usd(r.spend.cost_usd, 3)} sub={`${fmt.int(r.spend.tokens)} tokens · ${r.model}`} />
              </div>
              <div className="grid grid-cols-12 gap-4">
                <Card className="col-span-12 xl:col-span-5" title="Confusion (oracle × judge)">
                  <div className="grid grid-cols-3 gap-1 text-center text-[12px]">
                    <div></div><div className="text-ink3">judge: correct</div><div className="text-ink3">judge: incorrect</div>
                    <div className="text-ink3 text-right pr-2">oracle pass</div><Cellv v={conf.tp} tone="good" /><Cellv v={conf.fn} tone="warn" />
                    <div className="text-ink3 text-right pr-2">oracle fail</div><Cellv v={conf.fp} tone="critical" /><Cellv v={conf.tn} tone="good" />
                  </div>
                  <Note>Zheng et al. (2023): "over 80% agreement". Norman et al. (2026): the same judges at κ ≈ 0.4–0.5 once chance is removed, and perfectly repeatable while position-biased — the consistency–bias paradox.</Note>
                </Card>
                <Card className="col-span-12 xl:col-span-7" title="The base-rate trap: a judge that always says 'correct'">
                  <div className="h-[150px]">
                    <ResponsiveContainer>
                      <BarChart data={[{ n: 'balanced sample', agreement: r.base_rate_trap.agreement_balanced, kappa: r.base_rate_trap.kappa_balanced ?? 0 }, { n: '90% passing sample', agreement: r.base_rate_trap.agreement_skewed, kappa: r.base_rate_trap.kappa_skewed ?? 0 }]} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                        <CartesianGrid {...GRID} /><XAxis dataKey="n" {...AX} /><YAxis domain={[0, 1]} {...AX} />
                        <Tooltip {...TT} formatter={(v, n) => [fmt.num(v, 2), n]} />
                        <Bar dataKey="agreement" name="agreement" fill={SERIES[3]} radius={[4, 4, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="kappa" name="κ" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Note>Agreement follows the base rate; κ stays at zero. "Judge X agreed with the tests 90% of the time" hides the base rate; κ = 0 means no better than always saying yes.</Note>
                </Card>
              </div>
              <div className="grid grid-cols-12 gap-4">
                <Card className="col-span-12 xl:col-span-6" title="Verbosity padding — a check that needs no oracle" right={<span>same patch + 30 comment lines</span>}>
                  <div className="overflow-x-auto"><Tbl><thead><tr><th>run</th><th>oracle</th><th className="text-right">chars</th><th>verdict</th><th className="text-right">padded chars</th><th>verdict</th><th></th></tr></thead>
                    <tbody>{r.padding.map(p => <tr key={p.id}><td className="mono text-[11px]">{p.id.slice(-6)}</td><td>{p.gold ? <Badge tone="good">pass</Badge> : <Badge tone="critical">fail</Badge>}</td><td className="text-right">{p.len_before}</td><td>{p.before ? 'correct' : 'incorrect'}</td><td className="text-right">{p.len_after}</td><td>{p.after ? 'correct' : 'incorrect'}</td><td>{p.before !== p.after && <Badge tone="serious">flipped</Badge>}</td></tr>)}</tbody></Tbl></div>
                  <Note>Mean length of patches judged correct / incorrect: {fmt.int(s.mean_len_judged_correct)} / {fmt.int(s.mean_len_judged_incorrect)} chars. A verdict that moves when you add comments is not a judgment about the code.</Note>
                </Card>
                <Card className="col-span-12 xl:col-span-6" title="Process judging vs the ledger" right={<span>who do you believe?</span>}>
                  <Tbl><thead><tr><th>run</th><th>verified</th><th>in scope</th><th>correct</th><th>disagrees on</th></tr></thead>
                    <tbody>{r.process.map(p => <tr key={p.id}><td className="mono text-[11px]">{p.task}<div className="text-ink3">{p.id.slice(-6)}</div></td>
                      <td><Pair j={p.judge.verified} l={p.ledger.verified} /></td><td><Pair j={p.judge.in_scope} l={p.ledger.in_scope} /></td><td><Pair j={p.judge.correct} l={p.ledger.correct} /></td>
                      <td>{p.disagree.length ? p.disagree.map(d => <Badge key={d} tone="warn">{d}</Badge>) : <span className="text-ink3">—</span>}</td></tr>)}</tbody></Tbl>
                  <Note>Each cell: judge / ledger. The ledger recorded what happened; the judge inferred it from the tool-call list. The sentinel's LLM layer is a judge too, and deserves the same tests.</Note>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Cellv({ v, tone }) {
  const bg = { good: 'bg-good/15 text-good-ink', warn: 'bg-warn/15 text-warn', critical: 'bg-critical/15 text-critical-ink' }[tone]
  return <div className={`rounded-md py-3 text-[20px] font-semibold ${bg}`}>{v}</div>
}
function Pair({ j, l }) {
  const f = (x) => x == null ? '?' : x ? 'yes' : 'no'
  return <span className={`mono text-[11.5px] ${j != null && l != null && !!j !== !!l ? 'text-warn' : 'text-ink2'}`}>{f(j)} / {f(l)}</span>
}
