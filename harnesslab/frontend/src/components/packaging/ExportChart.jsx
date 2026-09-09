import { useCallback, useRef, useState } from 'react'
import { downloadBlob, downloadText, serializeChart, slugify, svgToPngBlob, themeBackground, toCsv } from './exportUtils'

/**
 * A three-button strip that lifts a Recharts chart out of the page: `.svg` (vector, styles inlined
 * so it survives outside the app), `.png` (canvas rasterization at 2x) and, when a `data` prop is
 * given, the `.csv` the chart was drawn from -- because a figure in a paper without its numbers is
 * an assertion, not evidence.
 *
 * Usage (drop into a Card's `right` slot; the ref goes on the element wrapping ResponsiveContainer):
 *
 *   const chartRef = useRef(null)
 *   <Card title="pass@k versus pass^k" right={<ExportChart targetRef={chartRef} name="passk" data={curve} />}>
 *     <div ref={chartRef} className="h-[260px]">
 *       <ResponsiveContainer>...</ResponsiveContainer>
 *     </div>
 *   </Card>
 *
 * Known limitation: Recharts renders <Legend> as HTML *outside* the <svg>, so it is not part of the
 * exported vector. Pass `caption` to stamp a line of text under the chart instead, or read the
 * series names from the exported CSV.
 *
 * @param {object}   props
 * @param {object}   props.targetRef  React ref to the element containing the chart's <svg>
 * @param {string}   props.name       base filename (slugified)
 * @param {Array}    [props.data]     rows behind the chart; enables the CSV button
 * @param {string[]} [props.columns]  explicit CSV column order
 * @param {string}   [props.caption]  drawn under the chart in the exported SVG/PNG
 * @param {number}   [props.scale]    PNG pixel ratio (default 2)
 * @param {boolean}  [props.compact]  icon-width buttons, for tight card headers
 */
export default function ExportChart({ targetRef, name = 'chart', data, columns, caption, scale = 2, compact = false }) {
  const [state, setState] = useState(null)   // null | 'busy' | 'done' | error string
  const timer = useRef(null)

  const flash = useCallback((s) => {
    setState(s)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState(null), s === 'done' ? 1200 : 4000)
  }, [])

  const build = useCallback(() => {
    const out = serializeChart(targetRef, { title: name, background: themeBackground() })
    if (!out) throw new Error('no <svg> found in the referenced element')
    if (!caption) return out
    // Stamp the caption inside the viewBox so it travels with the file.
    const y = out.height - 6
    const text = out.text.replace(/<\/svg>\s*$/,
      `<text x="8" y="${y}" style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;fill:${
        getComputedStyle(document.documentElement).getPropertyValue('--t-ink3').trim() || '#888'}">${
        String(caption).replace(/[<&>]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</text></svg>`)
    return { ...out, text }
  }, [targetRef, name, caption])

  const onSvg = useCallback(() => {
    try {
      const out = build()
      downloadText(out.text, `${slugify(name)}.svg`, 'image/svg+xml;charset=utf-8')
      flash('done')
    } catch (e) { flash(e.message || 'export failed') }
  }, [build, name, flash])

  const onPng = useCallback(async () => {
    flash('busy')
    try {
      const blob = await svgToPngBlob(build(), scale)
      downloadBlob(blob, `${slugify(name)}.png`)
      flash('done')
    } catch (e) { flash(e.message || 'export failed') }
  }, [build, name, scale, flash])

  const onCsv = useCallback(() => {
    try {
      downloadText(toCsv(data, columns), `${slugify(name)}.csv`, 'text/csv;charset=utf-8')
      flash('done')
    } catch (e) { flash(e.message || 'export failed') }
  }, [data, columns, name, flash])

  const cls = `btn ${compact ? '!px-2 !py-1 !text-[11px]' : '!px-2.5 !py-1 !text-[11.5px]'}`
  const busy = state === 'busy'
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" className={cls} onClick={onSvg} disabled={busy} title="Download this chart as SVG (styles inlined, theme colours resolved)">svg</button>
      <button type="button" className={cls} onClick={onPng} disabled={busy} title={`Download this chart as PNG (${scale}x)`}>png</button>
      {data && data.length > 0 && (
        <button type="button" className={cls} onClick={onCsv} disabled={busy} title="Download the numbers behind this chart">csv</button>
      )}
      {state && state !== 'busy' && (
        <span className={`chip ${state === 'done' ? 'border-good/40 text-good-ink bg-good/10' : 'border-critical/40 text-critical-ink bg-critical/10'}`}>
          {state === 'done' ? 'saved' : state}
        </span>
      )}
    </span>
  )
}
