# Page render check

Mounts one page in jsdom against a **live API payload** and fails on any React error.
Catches what `vite build` cannot: undefined property access, bad destructuring, and
shapes the backend actually returns but the page did not expect.

    cd .. && python3 -m harnesslab --port 8799 &        # from the lab root
    npx vite build -c test/vite.config.mjs
    node test/render.cjs

`test/stubs/` replaces `../App` (context) and `../api` (`useFetch`) so the page renders
synchronously from a fixed payload. Point `entry.jsx` and the URL in `render.cjs` at
another page to check that one instead.
