const { JSDOM } = require('jsdom')
const fs = require('fs')
const https = require('http')

function get(url) {
  return new Promise((res, rej) => https.get(url, r => {
    let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b)))
  }).on('error', rej))
}

;(async () => {
  const payload = await get('http://127.0.0.1:8799/api/results/prerecorded_mock/metrics'
    )
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' })
  const { window } = dom
  global.window = window; global.document = window.document
  global.navigator = window.navigator; global.HTMLElement = window.HTMLElement
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener(){}, removeEventListener(){} }))
  window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} }
  global.ResizeObserver = window.ResizeObserver
  window.process = { env: { NODE_ENV: 'development' } }
  window.getComputedStyle = window.getComputedStyle || (() => ({ getPropertyValue: () => '#888' }))

  const errs = []
  const origErr = console.error
  console.error = (...a) => { errs.push(a.join(' ')); }

  const code = fs.readFileSync(__dirname + '/out/bundle.js', 'utf8')
  window.eval(code)
  const text = window.__render(payload)

  console.error = origErr
  fs.writeFileSync(__dirname + '/rendered.txt', text)
  console.log('RENDERED chars:', text.length)
  console.log('---- react errors ----')
  const real = errs.filter(e => !/not wrapped in act|ResponsiveContainer|width\(0\) and height\(0\)/i.test(e))
  console.log(real.length ? real.slice(0,5).join('\n') : '(none)')
})()
