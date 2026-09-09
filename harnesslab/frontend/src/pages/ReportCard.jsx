import { useFetch, fmt } from '../api'
import { useApp } from '../App'
import { Card, Stat, Badge, Empty, Spinner, Note, Tbl } from '../ui'

export default function ReportCard() {
  const { results, harness, events } = useApp()
  const d = useFetch(results ? `/results/${results}/report?harness=${harness}` : null, [results, harness, events.tick])
  if (!results) return <Empty>No results directory yet.</Empty>
  if (d.loading && !d.data) return <Spinner label="assembling the card" />
  if (d.error || d.data?.error) return <Empty>{d.error?.message || d.data.error}</Empty>
  const { card: c, markdown } = d.data
  const h = c.cell.harness
  const copy = () => navigator.clipboard?.writeText(markdown)
  const dl = () => { const a = document.createElement('a'); a.href = `/api/results/${results}/report.md?harness=${harness}`; a.download = `report_${results}_${harness}.md`; a.click() }

  return (
    <div className="space-y-4 max-w-[1100px]">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Evaluation report card</h1>
          <div className="text-ink3 text-[12px]">the lecture's closing recipe, generated from <span className="mono">data/runs/{results}</span> · same content as <span className="mono">exercises/ex6_report_card.py</span></div>
        </div>
        <div className="ml-auto flex gap-2"><button className="btn" onClick={copy}>copy markdown</button><button className="btn btn-primary" onClick={dl}>download report.md</button></div>
      </div>

      <Card title="1 · The cell — what exactly was measured">
        <div className="grid grid-cols-12 gap-x-6 gap-y-2 text-[12.5px]">
          <div className="col-span-3 text-ink3">model</div><div className="col-span-9 mono">{c.cell.model} <span className="text-ink3">via {c.cell.provider}</span></div>
          <div className="col-span-3 text-ink3">harness</div><div className="col-span-9"><Badge tone="violet">{h.id}</Badge> tools: <span className="mono">{h.tools.join(', ')}</span>; policy {h.policy}; max_steps {h.max_steps}; context_window {h.context_window || 'full'}; temperature {h.temperature}</div>
          <div className="col-span-3 text-ink3">sentinel</div><div className="col-span-9">{h.sentinel?.enabled ? <span className="mono text-[11.5px]">{JSON.stringify(h.sentinel)}</span> : <span className="text-ink3">off (no hook in this cell)</span>}</div>
          <div className="col-span-3 text-ink3">system prompt</div><div className="col-span-9 text-ink2 whitespace-pre-wrap text-[12px] leading-relaxed border-l-2 border-line2 pl-3">{h.system_prompt}</div>
          <div className="col-span-3 text-ink3">tasks</div><div className="col-span-9">{c.cell.tasks.length} · <span className="mono text-[11.5px]">{c.cell.tasks.join(', ')}</span></div>
          <div className="col-span-3 text-ink3">protocol</div><div className="col-span-9">{c.cell.repeats} repeats per task; oracle = {c.cell.oracle}; {c.cell.runs} runs</div>
        </div>
      </Card>

      <Card title="2 · Outcome — as a distribution, not a number">
        <div className="stats mb-3">
          <Stat label="pass@1" value={fmt.pct(c.outcome.pass1, 1)} sub={`95% CI [${fmt.pct(c.outcome.ci95[0])}, ${fmt.pct(c.outcome.ci95[1])}]`} />
          <Stat label="pass@3 / pass^3" value={`${fmt.pct(c.outcome.pass3)} / ${fmt.pct(c.outcome.pow3)}`} sub="retries vs reliability" />
          <Stat label="flip rate" value={fmt.pct(c.outcome.flip_rate)} sub="tasks with mixed outcomes" />
          <Stat label="strengthened oracle" value={fmt.pct(c.outcome.pass1_strong, 1)} sub={`Δ ${fmt.pct(c.integrity.oracle_delta, 1)}`} />
          <Stat label="exit" value={Object.entries(c.outcome.exit).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt.pct(v)}`)[0]} small sub={Object.entries(c.outcome.exit).slice(1).map(([k, v]) => `${k} ${fmt.pct(v)}`).join(' · ')} />
        </div>
        <Tbl><thead><tr><th>task</th><th className="text-right">n</th><th className="text-right">pass@1</th><th className="text-right">pass^3</th></tr></thead>
          <tbody>{c.outcome.per_task.map(t => <tr key={t.task}><td className="mono text-[12px]">{t.task}</td><td className="text-right">{t.n}</td><td className="text-right">{fmt.pct(t.pass1)}</td><td className="text-right text-ink2">{fmt.pct(t['pass^3'])}</td></tr>)}</tbody></Tbl>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title="3 · Conduct — from the ledger">
          <Rows rows={[
            ['runs with ≥1 boundary event', fmt.pct(c.conduct.boundary_any), Object.entries(c.conduct.boundary_by_kind).map(([k, v]) => `${k} ${fmt.pct(v)}`).join(', ') || 'none'],
            ['runs that modified tests', fmt.pct(c.conduct.tests_modified)],
            ['verified after their last edit', fmt.pct(c.conduct.verified_after_last_edit)],
            ['read before writing', fmt.pct(c.conduct.read_before_write)],
            ['tool calls / edits per run', `${fmt.num(c.conduct.tool_calls, 1)} / ${fmt.num(c.conduct.edits, 1)}`],
            ['sentinel interventions per run', fmt.num(c.conduct.sentinel_interventions, 2)],
          ]} />
        </Card>
        <Card title="4 · Cost and efficiency">
          <Rows rows={[
            ['tokens per run (in / out)', `${fmt.int(c.cost.in_tokens)} / ${fmt.int(c.cost.out_tokens)}`],
            ['tokens per solved task', fmt.int(c.cost.tokens_per_solve)],
            ['cost per run', fmt.usd(c.cost.cost_per_run)],
            ['cost-of-pass', fmt.usd(c.cost.cost_of_pass), 'mean cost ÷ pass rate (Erol et al. 2025)'],
            ['wall time per run', fmt.num(c.cost.wall_s, 1) + ' s'],
          ]} />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title="5 · Integrity checks">
          <Rows rows={[
            ['solution-leak probe (t05) pass@1', fmt.pct(c.integrity.leak_probe_pass1), `vs overall ${fmt.pct(c.outcome.pass1)}`],
            ['oracle sensitivity', `${fmt.pct(c.outcome.pass1, 1)} → ${fmt.pct(c.outcome.pass1_strong, 1)}`, `Δ ${fmt.pct(c.integrity.oracle_delta, 1)}`],
            ['provenance', 'every run carries harness config, seed, sentinel verdicts and per-call token usage in ledger.jsonl'],
          ]} />
        </Card>
        <Card title="6 · What this card does not tell you">
          <ul className="text-[12.5px] text-ink2 space-y-1.5 list-disc pl-4">{c.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <Note>Discussion: which single number here would you have reported yesterday? Which three would you now insist on? What would BASTION-style evaluation add — security of the produced code, provenance of the tasks, a versioned ledger schema shared across labs?</Note>
        </Card>
      </div>
    </div>
  )
}

function Rows({ rows }) {
  return <Tbl><tbody>{rows.map(([k, v, sub], i) => <tr key={i}><td className="text-ink3 w-1/2">{k}</td><td className="font-medium">{v}{sub && <span className="text-ink3 font-normal text-[11.5px]"> · {sub}</span>}</td></tr>)}</tbody></Tbl>
}
