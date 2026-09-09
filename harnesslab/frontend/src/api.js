import { useEffect, useRef, useState, useCallback } from 'react'

/** A file written by `python -m harnesslab --export` carries every read-only response inline.
 *  There is no server to reach, so reads are served from the blob and writes are refused. */
export const STATIC_DATA = typeof window !== 'undefined' ? window.__HARNESSLAB_DATA__ : undefined
export const IS_STATIC = !!STATIC_DATA

export async function api(path, opts = {}) {
  if (IS_STATIC) {
    if (opts.method && opts.method !== 'GET') {
      throw new Error('This is a static export — launching runs and training need the live app.')
    }
    if (path in STATIC_DATA) return STATIC_DATA[path]
    // Match on the normalised query, never on the bare path: a request carrying parameters the
    // snapshot does not have (a second results dir, a picked cell) must NOT quietly resolve to the
    // snapshot taken without them. Returning plausible-but-wrong numbers is the one failure this
    // whole project is about.
    const norm = (u) => {
      const [b, qs] = u.split('?')
      const q = new URLSearchParams(qs || '')
      const kept = [...q.entries()].filter(([, v]) => v !== '' && v != null).sort()
      return b + (kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : '')
    }
    const want = norm(path)
    const hit = Object.keys(STATIC_DATA).find(k => norm(k) === want)
    if (hit) return STATIC_DATA[hit]
    throw new Error('Not in this static export — that view needs the live app (python -m harnesslab).')
  }
  const r = await fetch('/api' + path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (!r.ok) {
    let msg = r.statusText
    try { msg = (await r.json()).detail || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  const ct = r.headers.get('content-type') || ''
  return ct.includes('json') ? r.json() : r.text()
}

export function useFetch(path, deps = [], enabled = true) {
  const [state, set] = useState({ data: null, error: null, loading: !!path })
  const reload = useCallback(() => {
    if (!path || !enabled) return
    set(s => ({ ...s, loading: true }))
    api(path).then(data => set({ data, error: null, loading: false }))
      .catch(error => set({ data: null, error, loading: false }))
  }, [path, enabled]) // eslint-disable-line
  useEffect(() => { reload() }, [reload, ...deps]) // eslint-disable-line
  return { ...state, reload }
}

/** Live event stream from the backend. Keeps a bounded log plus per-run state. */
export function useEvents() {
  const [runs, setRuns] = useState({})       // run_id -> {meta, spans[], summary?}
  const [jobs, setJobs] = useState({})
  const [log, setLog] = useState([])
  const [connected, setConnected] = useState(false)
  const [tick, setTick] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    if (IS_STATIC) return           // a static export has no server to stream from
    const es = new EventSource('/api/events')
    ref.current = es
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (m) => {
      let ev
      try { ev = JSON.parse(m.data) } catch { return }
      if (ev.kind === 'run_start') {
        setRuns(r => ({ ...r, [ev.run_id]: { meta: ev, spans: [], summary: null, started: ev.ts, status: 'running' } }))
      } else if (ev.kind === 'span') {
        setRuns(r => {
          const cur = r[ev.run_id]
          if (!cur) return r
          return { ...r, [ev.run_id]: { ...cur, spans: [...cur.spans, ev.span] } }
        })
      } else if (ev.kind === 'run_end') {
        setRuns(r => r[ev.run_id] ? { ...r, [ev.run_id]: { ...r[ev.run_id], summary: ev.summary, status: 'done' } } : r)
      } else if (ev.kind === 'run_error') {
        setRuns(r => r[ev.run_id] ? { ...r, [ev.run_id]: { ...r[ev.run_id], status: 'error', error: ev.error } } : r)
      } else if (ev.kind === 'job') {
        setJobs(j => ({ ...j, [ev.job.id]: ev.job }))
      }
      if (['run_start', 'run_end', 'run_error', 'job', 'sentinel_train', 'harness_saved', 'real_import', 'judge'].includes(ev.kind)) {
        setLog(l => [...l.slice(-199), ev])
        setTick(t => t + 1)
      }
      if (ev.kind === 'span' && ev.span.span === 'sentinel' && ev.span.action && ev.span.action !== 'none') {
        setLog(l => [...l.slice(-199), ev])
      }
    }
    return () => es.close()
  }, [])
  return { runs, jobs, log, connected, tick, clear: () => setRuns({}) }
}

export const fmt = {
  pct: (x, d = 0) => (x == null || Number.isNaN(x)) ? '—' : (x * 100).toFixed(d) + '%',
  num: (x, d = 2) => (x == null || Number.isNaN(x)) ? '—' : Number(x).toFixed(d),
  int: (x) => (x == null) ? '—' : Math.round(x).toLocaleString(),
  usd: (x, d = 4) => (x == null || !Number.isFinite(x)) ? '—' : '$' + Number(x).toFixed(d),
  ms: (x) => x == null ? '—' : (x < 1000 ? x + ' ms' : (x / 1000).toFixed(1) + ' s'),
}

/** Stable per-harness colour slot (the colour itself comes from the active theme; see ui.jsx useChartTheme). */
export const harnessIndex = (() => {
  const map = {}
  let i = 0
  return (h) => { if (!(h in map)) map[h] = i++; return map[h] }
})()
