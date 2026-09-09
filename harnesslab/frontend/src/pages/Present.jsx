import { useEffect, useState } from 'react'
import { useApp } from '../App'
import Outcome from './Outcome'
import HarnessLab from './HarnessLab'
import Explorer from './Explorer'
import Sentinel from './Sentinel'
import Integrity from './Integrity'
import ReportCard from './ReportCard'
import { FieldFrame } from './Field'

// Lecture mode for the one-hour lab. The clock and the block names come from LAB_1H.md, so the
// bar always says where the room should be. `type` is what participants type; `see` is what has to
// be on their screen before the room moves on. `body` renders a live console page underneath, which
// is the point: the numbers on the slide are never stale because they are not on the slide.
const PARTS = [
  { id: 'A', name: 'Open', at: '0:00' },
  { id: 'B', name: 'Setup', at: '0:03' },
  { id: 'C', name: 'Together', at: '0:12' },
  { id: 'D', name: 'Solo', at: '0:48' },
  { id: 'E', name: 'Wrap', at: '0:56' },
]

const SLIDES = [
  {
    part: 'A', clock: '0:00', kicker: 'llma4se summer school · part two of two',
    title: 'Measuring a coding agent that will not hold still',
    sub: 'One hour, hands on. Everything here runs offline on 640 pre-recorded runs — no API key, no network. You will measure the variance yourselves, change one harness field and watch a ranking move, and read a trajectory that a pass-fail score cannot see.',
  },
  {
    part: 'A', clock: '0:00', kicker: 'a · the cold open', title: 'The same runs, three different answers',
    sub: 'Before anything is installed: switch the oracle and 163 runs change verdict. Press rank, then resample — the leader changes in half of 2,000 resampled task sets. Press flags: 295 runs fail a trajectory test and 165 of those still pass the hidden oracle.',
    note: 'The Field is on this slide. Oracle chips, then r to rank, b to resample, f for flags — click inside it first; the arrow keys still turn the page. You measure all of this yourselves in the next hour.',
    field: true,
  },
  {
    part: 'A', clock: '0:02', kicker: 'what part one established', title: 'Six things the lab assumes you accept',
    sub: null,
    list: [
      'A benchmark is a task set, an oracle and a harness — two of the three are usually undisclosed.',
      'The same agent on the same task does not do the same thing twice.',
      'pass@k is a leaderboard with retries; pass^k is what a user gets.',
      'Tasks are the sampling unit, not runs. Pooled intervals are too narrow, always optimistically.',
      'The harness is a hidden variable that moves the score by several points.',
      'A verdict is one bit, and every failure mode arrives at that bit looking identical.',
    ],
  },
  {
    part: 'B', clock: '0:03', kicker: 'b · setup · nine minutes', title: 'Four steps, and nobody moves on until every screen matches',
    sub: 'On a stock Mac the command is python3, not python. If port 8765 is taken, add --port 8766.',
    type: ['python3 --version            # 3.10 or newer', 'cd harnesslab', 'python3 -m harnesslab --no-browser', 'open http://127.0.0.1:8765'],
    see: ['the console loads on the Runs page', '640 pre-recorded runs listed under prerecorded_mock'],
    note: 'Offline fallback: double-click lab.html — the whole console, no Python, no server.',
  },
  {
    part: 'B', clock: '0:10', kicker: 'checkpoint', title: 'Everyone should now have all four of these',
    list: [
      'The console open on the Runs page.',
      'prerecorded_mock selected, 640 runs.',
      'The oracle chips visible in the top bar: visible · hidden · strengthened.',
      'The Outcome page rendering a grid, not an empty state.',
    ],
    note: 'Do not start exercise one until every hand is down.',
  },
  {
    part: 'C', clock: '0:12', kicker: 'exercise one · twelve minutes', title: 'The artefact under test does not hold still',
    sub: 'pass@1 and pass^5 describe the same eighty runs and disagree by half. The run-level interval is about twice as narrow as the task-level one, and it is narrow in the direction that flatters you.',
    type: ['python3 exercises/ex1_variance.py'],
    see: ['pass@1 0.66 and pass^5 0.34 on the same 80 runs', 'run-level CI [0.56, 0.76] vs task-level [0.46, 0.86]'],
    body: Outcome,
  },
  {
    part: 'C', clock: '0:20', kicker: 'exercise one · what to answer', title: 'Which interval is honest, and why',
    list: [
      'Q1 · Why do 0.66 and 0.34 describe the same eighty runs?',
      'Q2 · Which of the two intervals should go in a paper, and what is the other one measuring?',
      'Then, in the console: change the oracle chip and read the event card.',
    ],
    note: 'Q2 is one of the three answers you hand in.',
  },
  {
    part: 'C', clock: '0:24', kicker: 'exercise two · twelve minutes', title: 'The harness is a hidden variable',
    sub: 'baseline against no_test_tool. One field differs. The pass column barely moves; tokens per solve almost halves and the verification rate collapses.',
    type: ['python3 exercises/ex2_harness.py'],
    see: ['pass@1 0.66 → 0.59, tokens/solve 9,023 → 4,939, verified 0.93 → 0.00', 'paired Δ −0.075, 95% [−0.30, +0.11] — covers zero'],
    body: HarnessLab,
  },
  {
    part: 'C', clock: '0:32', kicker: 'exercise two · what to answer', title: 'The pass column is not the finding',
    list: [
      'Q1 · Name the one field that differs between the two harnesses.',
      'Q2 · The paired interval covers zero. What may you claim, and what may you not?',
      'In the console: Harness lab, A = baseline, B = no_test_tool.',
    ],
    note: 'Q1 is one of the three answers you hand in.',
  },
  {
    part: 'C', clock: '0:36', kicker: 'exercise three · twelve minutes', title: 'Test the trajectory, not just the patch',
    sub: 'baseline fails only process-quality tests — it submits without re-running. permissive lets a destructive shell command through on t07 and also fails test_tests_never_modified.',
    type: ['python3 exercises/ex3_trajectories.py'],
    see: ['baseline: unverified submits only', 'permissive: one destructive shell on t07, plus a modified test suite'],
    body: Explorer,
  },
  {
    part: 'C', clock: '0:44', kicker: 'exercise three · what to answer', title: 'What the score is blind to',
    list: [
      'Q1 · Open one run in Trajectories and read its bill of materials. Find a passing run whose "verified after last edit" is no.',
      'Q2 · Which of the seven failure modes would a pass-fail score record identically?',
    ],
    note: 'Q1 is the third answer you hand in.',
  },
  {
    part: 'C', clock: '0:46', kicker: 'new in harnesslab', title: 'Spot the faulty pattern before the model finishes',
    sub: 'A rule layer, a learned risk model over prefix features, and an optional second model reading the partial trajectory. It can block a submit-without-verify or an rm -rf before it executes — and because it is part of the harness, it is part of the cell you measure.',
    body: Sentinel,
  },
  {
    part: 'D', clock: '0:48', kicker: 'd · solo start · eight minutes', title: 'One script and one console view, by table',
    list: [
      'Table 1 · exercise 4 — calibrating an LLM judge (κ against a degenerate baseline).',
      'Table 2 · exercise 5 — two distortions: leakage on t05, and weak tests re-grading the same patches.',
      'Table 3 · exercise 6 — the report card, which is the hand-in.',
    ],
    type: ['python3 exercises/ex4_judge.py', 'python3 exercises/ex5_distortions.py', 'python3 exercises/ex6_report_card.py --harness baseline'],
    note: 'Nobody is expected to finish all three. Choosing well matters more than finishing.',
  },
  {
    part: 'D', clock: '0:52', kicker: 'the closing recipe, as code', title: 'The report card is the hand-in',
    sub: 'The cell, the outcome as a distribution, conduct, cost, the two integrity checks — and an explicit section for what the card does not tell you.',
    body: ReportCard,
  },
  {
    part: 'E', clock: '0:56', kicker: 'e · wrap · four minutes', title: 'What you hand in',
    list: [
      'report_mock.md, from the Report card page.',
      'The disclosure card — Harness lab → copy Markdown.',
      'Your answers to ex 1 Q2, ex 2 Q1 and ex 3 Q1.',
    ],
    note: 'Exercises 7 and 8 are homework with the handout; ex 7 needs pip install datasets.',
    body: Integrity,
  },
  {
    part: 'E', clock: '1:00', kicker: 'three sentences to leave with', title: 'If everything else fades, keep these',
    list: [
      'The same agent, on the same task, under the same settings, does not do the same thing twice.',
      'A number without its harness, its oracle and its sample size is not a result.',
      'Rules that nothing enforces are not rules, and evidence nobody audits is not evidence.',
    ],
  },
]

export default function Present() {
  const { go, theme, setTheme } = useApp()
  const [i, setI] = useState(() => +(sessionStorage.getItem('hs.slide') || 0))
  useEffect(() => {
    // projector default: light, once; a later explicit choice sticks
    try { if (!localStorage.getItem('hs.present.themed')) { localStorage.setItem('hs.present.themed', '1'); setTheme('light') } } catch { /* ignore */ }
  }, []) // eslint-disable-line
  useEffect(() => { sessionStorage.setItem('hs.slide', Math.min(i, SLIDES.length - 1)) }, [i])
  useEffect(() => {
    const on = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') setI(x => Math.min(SLIDES.length - 1, x + 1))
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setI(x => Math.max(0, x - 1))
      if (e.key === 'Home') setI(0)
      if (e.key === 'End') setI(SLIDES.length - 1)
      if (e.key === 'Escape') go('runs')
    }
    const onMsg = (e) => { if (e.data && e.data.type === 'field:key') on({ key: e.data.key }) }   // the embedded Field forwards page keys
    window.addEventListener('keydown', on)
    window.addEventListener('message', onMsg)
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('message', onMsg) }
  }, [go])

  const s = SLIDES[Math.min(i, SLIDES.length - 1)]
  const Body = s.body
  const activePart = PARTS.findIndex(p => p.id === s.part)

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--t-bg)' }}>
      {/* ── W&M deck chrome: the same green bar and gold rule as the morning deck ── */}
      <div className="shrink-0 relative flex items-stretch"
           style={{ background: 'var(--wm-green-800)', boxShadow: '0 10px 26px rgba(11,46,34,.35)' }}>
        <div className="flex items-center px-8 mono text-[13px] whitespace-nowrap"
             style={{ color: 'var(--wm-gold)', borderRight: '1px solid var(--wm-green-500)' }}>~/lab</div>
        <div className="flex items-stretch">
          {PARTS.map((p, idx) => {
            const on = idx === activePart
            return (
              <div key={p.id} className="flex flex-col justify-center gap-0.5 px-4 py-2.5 mono text-[12px] whitespace-nowrap"
                   style={on
                     ? { color: 'var(--wm-gold)', background: 'var(--wm-green-600)', boxShadow: 'inset 0 -4px 0 var(--wm-gold)' }
                     : { color: 'var(--wm-mist-500)' }}>
                <span>{p.at}</span>
                <span className="font-semibold text-[13px]" style={{ color: on ? '#fff' : 'var(--wm-mist-100)' }}>{p.name}</span>
              </div>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-3 px-8 text-[12px]"
             style={{ color: 'var(--wm-mist-500)', borderLeft: '1px solid var(--wm-green-500)' }}>
          <span className="mono">{i + 1} / {SLIDES.length}</span>
          <button className="btn" onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}>←</button>
          <button className="btn" onClick={() => setI(x => Math.min(SLIDES.length - 1, x + 1))} disabled={i === SLIDES.length - 1}>→</button>
          <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'light' : 'dark'}</button>
          <button className="btn" onClick={() => go('runs')}>exit</button>
        </div>
        <div className="absolute left-0 bottom-0 h-[3px] w-full" style={{ background: 'var(--wm-green-500)' }}>
          <div className="h-full transition-all" style={{ width: `${((i + 1) / SLIDES.length) * 100}%`, background: 'var(--wm-gold)' }} />
        </div>
      </div>

      {/* ── slide head ── */}
      <div className="px-10 pt-7 pb-5 border-b border-line shrink-0">
        <div className="mono text-[12px] uppercase tracking-[0.14em] font-semibold" style={{ color: 'var(--wm-gold-700)' }}>
          {s.clock} &nbsp;·&nbsp; {s.kicker}
        </div>
        <h1 className="text-[34px] font-semibold tracking-tight mt-1 leading-tight">{s.title}</h1>
        {s.sub && <p className="text-[15px] text-ink2 mt-2 max-w-[1100px] leading-relaxed">{s.sub}</p>}
      </div>

      {/* ── slide body: type / see panels, a list, and/or a live console page ── */}
      <div className={`flex-1 min-h-0 overflow-auto p-8 present-body${s.field ? ' flex flex-col' : ''}`}>
        {(s.type || s.see) && (
          <div className="grid gap-5 mb-6 max-w-[1400px]" style={{ gridTemplateColumns: s.type && s.see ? '1fr 1fr' : '1fr' }}>
            {s.type && (
              <div className="card p-5">
                <div className="card-t mb-2.5">type this</div>
                {s.type.map(t => (
                  <div key={t} className="mono text-[14px] leading-relaxed" style={{ color: 'var(--t-ink)' }}>
                    <span style={{ color: 'var(--wm-gold-700)' }}>$ </span>{t}
                  </div>
                ))}
              </div>
            )}
            {s.see && (
              <div className="card p-5">
                <div className="card-t mb-2.5">you should see</div>
                {s.see.map(t => (
                  <div key={t} className="text-[14px] leading-relaxed flex gap-2.5">
                    <span style={{ color: 'var(--wm-gold-700)' }}>›</span><span>{t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {s.list && (
          <div className="grid gap-x-14 gap-y-3.5 mb-6 max-w-[1400px]"
               style={{ gridTemplateColumns: s.list.length > 4 ? '1fr 1fr' : '1fr' }}>
            {s.list.map((t, n) => (
              <div key={t} className="flex gap-4 text-[15px] leading-relaxed">
                <span className="mono text-[13px] shrink-0 pt-0.5" style={{ color: 'var(--wm-gold-700)' }}>
                  {String(n + 1).padStart(2, '0')}
                </span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        )}

        {s.note && (
          <div className="mono text-[13px] leading-relaxed max-w-[1400px] pt-4 mb-6"
               style={{ color: 'var(--t-ink3)', borderTop: '1px solid var(--t-line)' }}>
            // {s.note}
          </div>
        )}

        {s.field && <div className="flex-1 min-h-[620px]"><FieldFrame className="w-full h-full block border-0 rounded-lg" /></div>}
        {Body && <Body />}
      </div>

      {/* ── W&M footer ── */}
      <div className="shrink-0 flex items-center justify-between px-10 py-3 mono text-[13px]"
           style={{ background: 'var(--wm-green-600)', color: '#fff' }}>
        <span><span className="font-semibold" style={{ fontFamily: 'var(--font-sans)' }}>Antonio Mastropaolo</span>
          <span style={{ color: 'var(--wm-gold)' }}> · </span>AURA Lab
          <span style={{ color: 'var(--wm-gold)' }}> · </span>William &amp; Mary</span>
        <span>The afternoon lab &nbsp;·&nbsp; {PARTS[activePart]?.name ?? ''}</span>
      </div>
    </div>
  )
}
