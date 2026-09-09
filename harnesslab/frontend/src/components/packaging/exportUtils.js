/**
 * Get a chart off the page and into a paper.
 *
 * Recharts draws into a live <svg> that inherits nearly all of its colour from CSS custom
 * properties on <html data-theme> (see theme.js). Serialising `svg.outerHTML` therefore produces a
 * file that renders black-on-black, or not at all, once it leaves the page. The fix is to walk the
 * clone alongside the original and copy the *computed* value of the properties SVG actually paints
 * with -- getComputedStyle has already resolved var(--t-*) to a literal colour by then.
 *
 * Everything here is dependency-free and runs in the browser only.
 */

/** Properties that decide how an SVG node looks. Kept short: inlining all ~340 computed properties
 *  on every node makes the file ~40x bigger for no visual gain. */
const PAINT_PROPS = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin',
  'opacity', 'visibility', 'display', 'shape-rendering', 'paint-order', 'mix-blend-mode',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
  'text-anchor', 'dominant-baseline', 'alignment-baseline', 'white-space',
]

/** The CSS token used as the exported background (transparent PNGs read badly in slides). */
export function themeBackground() {
  try {
    const cs = getComputedStyle(document.documentElement)
    return cs.getPropertyValue('--t-panel').trim() || cs.getPropertyValue('--t-bg').trim() || '#ffffff'
  } catch { return '#ffffff' }
}

/** The first <svg> inside `el` (a DOM node or a React ref). */
export function findSvg(el) {
  const node = el && 'current' in el ? el.current : el
  if (!node) return null
  return node.tagName === 'svg' ? node : node.querySelector('svg')
}

/**
 * Serialize a chart to a standalone SVG string.
 * @param {Element|{current: Element}} el   container holding the Recharts surface
 * @param {{background?: string, title?: string, padding?: number}} opts
 * @returns {{ text: string, width: number, height: number } | null}
 */
export function serializeChart(el, opts = {}) {
  const svg = findSvg(el)
  if (!svg) return null
  const padding = opts.padding ?? 8
  const box = svg.getBoundingClientRect()
  const width = Math.max(1, Math.round(box.width || svg.clientWidth || 640))
  const height = Math.max(1, Math.round(box.height || svg.clientHeight || 320))

  const clone = svg.cloneNode(true)
  const src = [svg, ...svg.querySelectorAll('*')]
  const dst = [clone, ...clone.querySelectorAll('*')]
  for (let i = 0; i < src.length && i < dst.length; i++) {
    const cs = getComputedStyle(src[i])
    let decl = ''
    for (const p of PAINT_PROPS) {
      const v = cs.getPropertyValue(p)
      // "none" is meaningful for fill/stroke (an unfilled path) and noise everywhere else.
      const keep = (v && v !== 'normal' && v !== 'auto' && v !== 'none') ||
                   (v === 'none' && (p === 'fill' || p === 'stroke'))
      if (keep) decl += `${p}:${v};`
    }
    if (decl) dst[i].setAttribute('style', decl)
    dst[i].removeAttribute('class')
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clone.setAttribute('width', String(width + padding * 2))
  clone.setAttribute('height', String(height + padding * 2))
  clone.setAttribute('viewBox', `${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`)

  const bg = opts.background ?? themeBackground()
  if (bg && bg !== 'transparent') {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', String(-padding)); rect.setAttribute('y', String(-padding))
    rect.setAttribute('width', String(width + padding * 2)); rect.setAttribute('height', String(height + padding * 2))
    rect.setAttribute('fill', bg)
    clone.insertBefore(rect, clone.firstChild)
  }
  if (opts.title) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title')
    t.textContent = opts.title
    clone.insertBefore(t, clone.firstChild)
  }
  const text = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone)
  return { text, width: width + padding * 2, height: height + padding * 2 }
}

/** Rasterize an SVG string through a canvas. `scale` 2 gives a retina-ish PNG. */
export function svgToPngBlob({ text, width, height }, scale = 2, background) {
  return new Promise((resolve, reject) => {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = Math.round(width * scale); c.height = Math.round(height * scale)
        const ctx = c.getContext('2d')
        ctx.fillStyle = background ?? themeBackground()
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(img, 0, 0, c.width, c.height)
        c.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob returned null')), 'image/png')
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('the browser refused to rasterize the serialized SVG'))
    img.src = url
  })
}

/** RFC 4180-ish CSV. Objects -> JSON, arrays -> ";" joined, booleans -> 0/1, null -> "". */
export function toCsv(rows, columns) {
  if (!rows || !rows.length) return ''
  const cols = columns && columns.length ? columns : Object.keys(rows.reduce((a, r) => Object.assign(a, r), {}))
  const cell = (v) => {
    if (v == null) return ''
    if (typeof v === 'boolean') return v ? '1' : '0'
    if (Array.isArray(v)) return v.join(';')
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  const q = (s) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  return [cols.map(c => q(String(c))).join(','), ...rows.map(r => cols.map(c => q(cell(r[c]))).join(','))].join('\n') + '\n'
}

/** Trigger a download of `blob` as `filename`. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadText(text, filename, type) {
  downloadBlob(new Blob([text], { type: type || 'text/plain;charset=utf-8' }), filename)
}

/** "pass@k vs pass^k" -> "pass-k-vs-pass-k" : a filename you can put in a repository. */
export function slugify(s) {
  return String(s || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'chart'
}
