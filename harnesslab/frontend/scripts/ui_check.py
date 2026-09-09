"""Screenshot every page in both themes at projector and laptop widths and assert layout health.
Usage: python3 scripts/ui_check.py [base_url] [out_dir] [results_dir]
Needs `pip install playwright && playwright install chromium`. Exit 1 if any page overflows, clips a stat subtitle,
or logs a console error."""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
OUT = sys.argv[2] if len(sys.argv) > 2 else "ui_shots"
RESULTS = sys.argv[3] if len(sys.argv) > 3 else ""
PAGES = ["runs", "outcome", "harness", "explorer", "patterns", "sentinel", "judge", "integrity", "experiment", "real", "report", "present"]
UNLOCK = ("html,body,#root{height:auto!important;min-height:0!important} main>div.overflow-auto{overflow:visible!important} "
          ".present-body{overflow:visible!important} .max-h-\\[calc\\(100vh-180px\\)\\]{max-height:none!important}")
CHECK = """() => {
  const W = window.innerWidth
  // an element past the right edge is a defect unless an ancestor is an intended horizontal scroll container
  const inScroll = (e) => { let a = e.parentElement; while (a && a !== document.body) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; a = a.parentElement } return false }
  const over = Array.from(document.querySelectorAll('body *')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > W + 1 && getComputedStyle(e).position !== 'fixed' && !inScroll(e) }).length
  const pageOverflow = Math.max(0, document.documentElement.scrollWidth - W)
  const clipped = Array.from(document.querySelectorAll('.line-clamp-3')).filter(e => e.scrollHeight > e.clientHeight + 2).length
  return { over: over + pageOverflow, clipped }
}"""
os.makedirs(OUT, exist_ok=True)
problems = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for theme in ("dark", "light"):
        for w, h in ((1280, 720), (1440, 900)):
            ctx = b.new_context(viewport={"width": w, "height": h})
            pg = ctx.new_page()
            errs = []
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(BASE + "/#/runs", wait_until="load")
            pg.evaluate(f"() => {{ localStorage.setItem('hs.theme', '{theme}'); localStorage.setItem('hs.present.themed', '1'); "
                        f"{'localStorage.setItem(\"hs.results\", \"' + RESULTS + '\");' if RESULTS else ''} }}")
            for name in PAGES:
                pg.goto(f"{BASE}/#/{name}", wait_until="load"); pg.reload(wait_until="load"); time.sleep(2.5)
                pg.add_style_tag(content=UNLOCK); time.sleep(0.5)
                r = pg.evaluate(CHECK)
                pg.screenshot(path=f"{OUT}/{name}-{theme}-{w}.png", full_page=True)
                line = f"{name:9s} {theme:5s} {w}: past-right-edge={r['over']} clipped-subtitles={r['clipped']} console-errors={len(errs)}"
                print(line, flush=True)
                if r["over"] or r["clipped"] or errs:
                    problems.append(line + ("  " + errs[0][:120] if errs else ""))
                errs.clear()
            ctx.close()
    b.close()
print("PROBLEMS:", len(problems))
for x in problems:
    print("  ", x)
sys.exit(1 if problems else 0)
