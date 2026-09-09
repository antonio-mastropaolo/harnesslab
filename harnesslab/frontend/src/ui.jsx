import { createContext, useContext, useMemo } from 'react'
import { harnessIndex } from './api'
import { readTokens } from './theme'

export const ThemeCtx = createContext('dark')

/** Literal colors + Recharts props for the active theme. Re-reads the CSS tokens when the theme changes. */
export function useChartTheme() {
  const theme = useContext(ThemeCtx)
  return useMemo(() => {
    const t = readTokens()
    return {
      ...t,
      TT: { contentStyle: { background: t.panel2, border: `1px solid ${t.line2}`, borderRadius: 8, fontSize: 12, color: t.ink }, labelStyle: { color: t.ink2, marginBottom: 4 }, itemStyle: { color: t.ink, padding: 0 }, cursor: { stroke: t.line2 } },
      AX: { tick: { fill: t.ink3, fontSize: 11 }, axisLine: { stroke: t.line }, tickLine: false },
      GRID: { stroke: t.line, strokeDasharray: '2 4', vertical: false },
      harnessColor: (h) => t.SERIES[harnessIndex(h) % t.SERIES.length],
      riskColor: (r) => r == null ? t.ink3 : r >= 0.85 ? t.STATUS.critical : r >= 0.6 ? t.STATUS.serious : r >= 0.4 ? t.STATUS.warn : t.STATUS.good,
    }
  }, [theme])
}

export function Card({ title, right, children, className = '', pad = true }) {
  return (
    <section className={`card fade-in ${className}`}>
      {(title || right) && (
        <header className="card-h">
          {title && <h3 className="card-t">{title}</h3>}
          {right && <div className="text-[12px] text-ink3 flex items-center gap-2 flex-wrap">{right}</div>}
        </header>
      )}
      <div className={pad ? 'px-4 pb-4' : ''}>{children}</div>
    </section>
  )
}

const TONE_TEXT = { good: 'text-good-ink', warn: 'text-warn-ink', serious: 'text-serious-ink', critical: 'text-critical-ink' }

export function Stat({ label, value, sub, tone, small }) {
  return (
    <div className="card px-4 py-3 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink3 truncate" title={typeof label === 'string' ? label : undefined}>{label}</div>
      <div className={`${small ? 'text-[18px] font-semibold tabular-nums mt-0.5' : 'stat mt-0.5'} ${tone ? TONE_TEXT[tone] : ''} break-words`}>{value}</div>
      {sub && <div className="text-[11.5px] text-ink3 mt-0.5 leading-snug line-clamp-3" title={typeof sub === 'string' ? sub : undefined}>{sub}</div>}
    </div>
  )
}

export function Badge({ children, tone = 'neutral', dot }) {
  const tones = {
    neutral: 'border-line2 text-ink2 bg-panel2',
    good: 'border-good/40 text-good-ink bg-good/10',
    warn: 'border-warn/40 text-warn-ink bg-warn/10',
    serious: 'border-serious/40 text-serious-ink bg-serious/10',
    critical: 'border-critical/40 text-critical-ink bg-critical/10',
    accent: 'border-accent/40 text-accent-ink bg-accent/10',
    violet: 'border-s7/40 text-s7 bg-s7/10',
  }
  return <span className={`chip ${tones[tone]}`}>{dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}{children}</span>
}

export function Empty({ children }) {
  return <div className="text-ink3 text-[12.5px] py-8 text-center border border-dashed border-line rounded-xl">{children}</div>
}

export function Spinner({ label }) {
  return <div className="flex items-center gap-2 text-ink3 text-[12.5px] py-6 justify-center"><span className="w-3.5 h-3.5 border-2 border-line2 border-t-accent rounded-full animate-spin" />{label || 'loading'}</div>
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <select className={`input !w-auto pr-7 ${className}`} value={value ?? ''} onChange={e => onChange(e.target.value)}>
      {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-[12.5px] text-ink2">
      <span onClick={() => onChange(!checked)} className={`w-8 h-[18px] rounded-full relative transition-colors shrink-0 ${checked ? 'bg-accent' : 'bg-line2'}`}>
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
      {label}
    </label>
  )
}

export function riskTone(r) {
  if (r == null) return 'neutral'
  if (r >= 0.85) return 'critical'
  if (r >= 0.6) return 'serious'
  if (r >= 0.4) return 'warn'
  return 'good'
}

/** Horizontal risk meter with a threshold tick. */
export function RiskBar({ risk, threshold = 0.6, width = 120 }) {
  const { riskColor } = useChartTheme()
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 rounded-full bg-line overflow-hidden shrink-0" style={{ width }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (risk || 0) * 100)}%`, background: riskColor(risk) }} />
        <div className="absolute top-0 bottom-0 w-px bg-ink2/70" style={{ left: `${threshold * 100}%` }} />
      </div>
      <span className="mono text-[11px] tabular-nums text-ink2 w-8">{risk == null ? '—' : risk.toFixed(2)}</span>
    </div>
  )
}

export function OutcomeDots({ outcomes }) {
  const { STATUS } = useChartTheme()
  return (
    <span className="inline-flex gap-[3px] items-center">
      {outcomes.map((o, i) => <span key={i} title={o ? 'pass' : 'fail'} className="w-2.5 h-2.5 rounded-[3px]" style={{ background: o ? STATUS.good : STATUS.critical, opacity: o ? 0.9 : 0.85 }} />)}
    </span>
  )
}

/** A table that scrolls inside its card instead of spilling out of it. */
export function Tbl({ children, className = '', nowrap }) {
  return <div className="tbl-wrap"><table className={`tbl ${nowrap ? 'tbl-nowrap' : ''} ${className}`}>{children}</table></div>
}

export function Kbd({ children }) { return <span className="kbd">{children}</span> }

export function Note({ children }) {
  return <p className="text-[12px] text-ink3 leading-relaxed mt-2 border-l-2 border-line2 pl-3">{children}</p>
}
