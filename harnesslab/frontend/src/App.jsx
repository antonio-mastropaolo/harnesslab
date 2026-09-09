import { useEffect, useMemo, useState, createContext, useContext } from 'react'
import { useFetch, useEvents } from './api'
import { ThemeCtx } from './ui'
import { applyTheme, currentTheme } from './theme'
import CommandCenter from './pages/CommandCenter'
import Outcome from './pages/Outcome'
import HarnessLab from './pages/HarnessLab'
import Explorer from './pages/Explorer'
import Sentinel from './pages/Sentinel'
import Integrity from './pages/Integrity'
import ReportCard from './pages/ReportCard'
import Present from './pages/Present'
import Judge from './pages/Judge'
import RealData from './pages/RealData'
import Experiment from './pages/Experiment'
import Patterns from './pages/Patterns'

export const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const NAV = [
  { id: 'runs', label: 'Command center', hint: 'launch & watch', icon: '◉' },
  { id: 'outcome', label: 'Outcome', hint: 'pass@k, pass^k, CIs', icon: '▦' },
  { id: 'harness', label: 'Harness lab', hint: 'the hidden variable', icon: '⚙' },
  { id: 'explorer', label: 'Trajectories', hint: 'ledger, patch, risk', icon: '↝' },
  { id: 'sentinel', label: 'Sentinel', hint: 'early warning', icon: '◬' },
  { id: 'judge', label: 'Judge', hint: 'κ, swap, verbosity', icon: '⚖' },
  { id: 'integrity', label: 'Integrity', hint: 'leakage, weak tests', icon: '⌕' },
  { id: 'patterns', label: 'Patterns', hint: 'shapes, transitions, queries', icon: '≋' },
  { id: 'experiment', label: 'Experiment', hint: 'factorial, power, interaction', icon: '⊞' },
  { id: 'real', label: 'Data sources', hint: 'import external harnesses', icon: '◍' },
  { id: 'report', label: 'Report card', hint: 'the closing recipe', icon: '▤' },
  { id: 'present', label: 'Present', hint: 'lecture mode', icon: '▶' },
]

/** The three graders every run is scored under. Same runs, same patches — a different question. */
export const ORACLES = [
  ['visible_pass', 'visible', "the tests the agent could run: what it thought it had achieved"],
  ['hidden_pass', 'hidden', "the benchmark's oracle: the held-out suite"],
  ['strong_pass', 'strengthened', 'hidden plus augmented cases: catches plausible wrong fixes'],
]

function useHash() {
  const parse = () => {
    const h = location.hash.replace(/^#\/?/, '')
    const [page, ...rest] = h.split('/')
    return { page: page || 'runs', arg: rest.join('/') }
  }
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [route, (page, arg) => { location.hash = '#/' + page + (arg ? '/' + arg : '') }]
}

export default function App() {
  const [route, go] = useHash()
  const events = useEvents()
  const overview = useFetch('/overview', [events.tick])
  const [results, setResults] = useState(localStorage.getItem('hs.results') || '')
  const [harness, setHarness] = useState(localStorage.getItem('hs.harness') || 'baseline')
  // The oracle is a property of the measurement, not of one page: switching it must re-score
  // every view at once, which is why it lives in the shell and not in each page's local state.
  const [oracle, setOracle] = useState(localStorage.getItem('hs.oracle') || 'hidden_pass')
  const [theme, setThemeState] = useState(currentTheme)
  const setTheme = (n) => { applyTheme(n); setThemeState(n) }

  const dirs = overview.data?.results || []
  useEffect(() => {
    if (dirs.length && !dirs.find(d => d.name === results)) {
      const pref = dirs.find(d => d.name === 'live') || dirs.find(d => d.name !== 'prerecorded_mock') || dirs[0]
      setResults(pref.name)
    }
  }, [dirs.length]) // eslint-disable-line
  useEffect(() => { localStorage.setItem('hs.results', results) }, [results])
  useEffect(() => { localStorage.setItem('hs.harness', harness) }, [harness])
  useEffect(() => { localStorage.setItem('hs.oracle', oracle) }, [oracle])
  const dir = dirs.find(d => d.name === results)
  useEffect(() => {
    if (dir && !dir.harnesses.includes(harness)) setHarness(dir.harnesses.includes('baseline') ? 'baseline' : dir.harnesses[0])
  }, [dir?.name, dir?.harnesses?.join()]) // eslint-disable-line

  const ctx = useMemo(() => ({ overview: overview.data, reloadOverview: overview.reload, events, results, setResults, harness, setHarness, oracle, setOracle, dir, go, route, theme, setTheme }),
    [overview.data, events, results, harness, oracle, dir, route, theme]) // eslint-disable-line

  const Page = { runs: CommandCenter, outcome: Outcome, harness: HarnessLab, explorer: Explorer, sentinel: Sentinel, judge: Judge, integrity: Integrity, experiment: Experiment, patterns: Patterns, real: RealData, report: ReportCard, present: Present }[route.page] || CommandCenter
  const running = Object.values(events.runs).filter(r => r.status === 'running').length

  if (route.page === 'present') return <ThemeCtx.Provider value={theme}><Ctx.Provider value={ctx}><Present /></Ctx.Provider></ThemeCtx.Provider>

  return (
    <ThemeCtx.Provider value={theme}><Ctx.Provider value={ctx}>
      <div className="h-full flex">
        <aside className="w-[232px] shrink-0 border-r border-line bg-panel/60 flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-line">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent live" />
              <span className="font-semibold tracking-tight text-[15px]">harnesslab</span>
              <span className="text-ink3 text-[11px] ml-auto mono">v0.1</span>
            </div>
            <div className="text-[11px] text-ink3 mt-1 leading-snug">the agent won't hold still; the measurement should</div>
          </div>
          <nav className="p-2 flex-1">
            {NAV.map(n => (
              <button key={n.id} onClick={() => go(n.id)}
                className={`w-full text-left px-3 py-2 rounded-lg mb-0.5 flex items-center gap-2.5 transition-colors ${route.page === n.id ? 'bg-panel2 text-ink' : 'text-ink2 hover:bg-panel2/60 hover:text-ink'}`}>
                <span className={`w-5 text-center text-[13px] ${route.page === n.id ? 'text-accent' : 'text-ink3'}`}>{n.icon}</span>
                <span className="flex-1">
                  <span className="block text-[13px] font-medium leading-tight">{n.label}</span>
                  <span className="block text-[10.5px] text-ink3 leading-tight">{n.hint}</span>
                </span>
                {n.id === 'runs' && running > 0 && <span className="chip border-accent/40 text-accent-ink bg-accent/10">{running}</span>}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-line text-[11px] text-ink3 space-y-1.5">
            <div className="flex items-center justify-between"><span>stream</span><span className={events.connected ? 'text-good-ink' : 'text-critical-ink'}>{events.connected ? 'connected' : 'offline'}</span></div>
            <div className="flex items-center justify-between"><span>OpenRouter</span><span className={overview.data?.key_present ? 'text-good-ink' : 'text-warn-ink'}>{overview.data?.key_present ? 'key set' : 'no key'}</span></div>
            <div className="flex items-center justify-between"><span>sentinel model</span><span className={overview.data?.sentinel?.meta?.trained ? 'text-good-ink' : 'text-warn-ink'}>{overview.data?.sentinel?.meta?.trained ? 'trained' : 'prior'}</span></div>
            <div className="flex items-center justify-between"><span>theme</span><button className="hover:text-ink" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme} → {theme === 'dark' ? 'light' : 'dark'}</button></div>
          </div>
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="h-12 shrink-0 border-b border-line flex items-center gap-3 px-5 bg-panel/40">
            <span className="text-[13px] font-semibold">{NAV.find(n => n.id === route.page)?.label}</span>
            <span className="text-ink3 text-[12px]">{NAV.find(n => n.id === route.page)?.hint}</span>
            <div className="ml-auto flex items-center gap-2 text-[12px]">
              <span className="text-ink3">results</span>
              <select className="input !w-auto" value={results} onChange={e => setResults(e.target.value)}>
                {dirs.map(d => <option key={d.name} value={d.name}>{d.name} · {d.runs} runs</option>)}
              </select>
              <span className="text-ink3 ml-2">harness</span>
              <select className="input !w-auto" value={harness} onChange={e => setHarness(e.target.value)}>
                {(dir?.harnesses || [harness]).map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="text-ink3 ml-2">oracle</span>
              <div className="flex rounded-lg border border-line2 overflow-hidden" role="group" aria-label="oracle">
                {ORACLES.map(([v, label, title]) => (
                  <button key={v} title={title} onClick={() => setOracle(v)}
                    className={`px-2 py-1 text-[11.5px] border-r border-line2 last:border-r-0 transition-colors ${
                      oracle === v ? 'bg-accent text-white' : 'text-ink3 hover:text-ink2 hover:bg-panel2'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-5">
            <Page />
          </div>
        </main>
      </div>
    </Ctx.Provider></ThemeCtx.Provider>
  )
}
