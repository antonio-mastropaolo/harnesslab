import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import Page from '../src/pages/Outcome.jsx'
window.__render = (payload) => {
  globalThis.__PAYLOAD__ = payload
  const el = document.createElement('div')
  document.body.appendChild(el)
  flushSync(() => createRoot(el).render(React.createElement(Page)))
  return el.textContent
}
