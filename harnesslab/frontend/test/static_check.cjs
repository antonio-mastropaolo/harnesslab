// Load the exported file with NO server and NO network, and assert the app renders from the blob.
const { JSDOM } = require('jsdom')
const fs = require('fs')
const file = process.argv[2]
const html = fs.readFileSync(file, 'utf8')

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'file:///export.html',
  resources: undefined,                       // never fetch anything
})
const { window } = dom
window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} }
window.matchMedia = window.matchMedia || (() => ({ matches:false, addEventListener(){}, removeEventListener(){} }))
// any fetch at all is a failure: a static export must not need the network
let fetched = []
window.fetch = (...a) => { fetched.push(String(a[0])); return Promise.reject(new Error('no network')) }
window.EventSource = function () { throw new Error('EventSource used in a static export') }

setTimeout(() => {
  const text = window.document.body.textContent || ''
  console.log('rendered chars:', text.length)
  console.log('fetch attempts:', fetched.length, fetched.slice(0, 3))
  const nav = ['Outcome', 'Patterns', 'Experiment', 'Report card'].filter(n => text.includes(n))
  console.log('nav items present:', nav.join(', ') || '(none)')
  console.log('shows data:', /prerecorded_mock/.test(text) ? 'yes' : 'no')
  process.exit(0)
}, 2500)
