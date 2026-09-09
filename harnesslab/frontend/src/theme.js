// Theme state lives on <html data-theme>. It is set synchronously (before setState) so the first render
// after a toggle already reads the right tokens.
const KEY = 'hs.theme'
export const THEMES = ['dark', 'light']
export function currentTheme() { return document.documentElement.dataset.theme || 'dark' }
export function applyTheme(name) {
  document.documentElement.dataset.theme = THEMES.includes(name) ? name : 'dark'
  try { localStorage.setItem(KEY, document.documentElement.dataset.theme) } catch { /* private mode */ }
}
export function storedTheme() { try { return localStorage.getItem(KEY) } catch { return null } }
export function initTheme() { applyTheme(storedTheme() || 'dark') }
/** Read the CSS tokens of the active theme; Recharts needs literal colors. */
export function readTokens() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n) => cs.getPropertyValue(n).trim()
  return {
    bg: v('--t-bg'), panel: v('--t-panel'), panel2: v('--t-panel2'), line: v('--t-line'), line2: v('--t-line2'),
    ink: v('--t-ink'), ink2: v('--t-ink2'), ink3: v('--t-ink3'), accent: v('--t-accent'),
    SERIES: [1, 2, 3, 4, 5, 6, 7, 8].map(i => v(`--t-s${i}`)),
    STATUS: { good: v('--t-good'), warn: v('--t-warn'), serious: v('--t-serious'), critical: v('--t-critical') },
    INK: { good: v('--t-good-ink'), warn: v('--t-warn-ink'), serious: v('--t-serious-ink'), critical: v('--t-critical-ink'), accent: v('--t-accent-ink'), s3: v('--t-s3-ink'), s7: v('--t-s7') },
  }
}

/** Single-hue sequential ramp (100 → 700) used by the heatmap; reads on both themes. */
export const SEQ_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
export function seqText(bg) { return SEQ_BLUE.indexOf(bg) >= 3 ? '#ffffff' : '#0b0b0b' }
