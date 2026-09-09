"""Assemble web/index.html from web/src (base.html + the JS parts, in order). Run after editing the sources."""
import os
here = os.path.dirname(os.path.abspath(__file__))
src = lambda n: open(os.path.join(here, "src", n), encoding="utf-8").read()
PARTS = ["core.js", "charts.js", "views_a.js", "views_b.js", "views_c.js", "app.js"]
js = "\n".join(f"// ---- {p}\n" + src(p) for p in PARTS)
html = src("base.html").replace("/*__JS__*/", js)
assert "/*__BUNDLE__*/" in html
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(html)
print("wrote web/index.html", len(html), "bytes")
