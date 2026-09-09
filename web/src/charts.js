// ============================================================ SVG charts (theme-aware: colours come from CSS variables)
const TXT = 'style="fill:var(--muted)"', TXT2 = 'style="fill:var(--ink)"', GRID = 'style="stroke:var(--rule)"';
function svgBar(items, o = {}) {
  const w = o.w || 420, bh = o.bh || 18, gap = 6, lw = o.lw || 150, h = items.length * (bh + gap) + 8; const max = o.max || Math.max(1e-9, ...items.map(i => i.value));
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`;
  items.forEach((it, i) => { const y = i * (bh + gap) + 4, bw = Math.max(0, (w - lw - 70) * (Math.min(it.value, max) / max)); s += `<text x="${lw - 6}" y="${y + bh - 5}" text-anchor="end" font-size="11" ${TXT2}>${esc(it.label)}</text><rect x="${lw}" y="${y}" width="${bw}" height="${bh}" fill="${it.color || "#17A398"}" rx="2"${it.act ? ` data-act="${it.act}" data-key="${esc(it.key || "")}" style="cursor:pointer"` : ""}><title>${esc(it.title || it.label)}</title></rect><text x="${lw + bw + 5}" y="${y + bh - 5}" font-size="11" ${TXT2}>${esc(it.text != null ? it.text : fmt(it.value))}</text>`; });
  return s + "</svg>";
}
function svgLines(series, o = {}) {
  const w = o.w || 460, h = o.h || 240, ml = o.ml || 44, mr = 16, mt = 14, mb = o.xlabel ? 36 : 24; const xs = uniq(series.flatMap(s => s.points.map(p => p[0]))).sort((a, b) => a - b);
  if (!xs.length) return `<div class="empty">no data</div>`;
  const xmin = o.xmin != null ? o.xmin : Math.min(...xs), xmax = o.xmax != null ? o.xmax : Math.max(...xs), ymin = o.ymin != null ? o.ymin : 0, ymax = o.ymax != null ? o.ymax : Math.max(1e-9, ...series.flatMap(s => s.points.map(p => p[1])));
  const X = x => ml + (xmax > xmin ? (x - xmin) / (xmax - xmin) : 0.5) * (w - ml - mr), Y = y => mt + (1 - (y - ymin) / (ymax - ymin || 1)) * (h - mt - mb);
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`;
  for (let i = 0; i <= 4; i++) { const yv = ymin + (ymax - ymin) * i / 4; s += `<line x1="${ml}" x2="${w - mr}" y1="${Y(yv)}" y2="${Y(yv)}" ${GRID}/><text x="${ml - 6}" y="${Y(yv) + 4}" text-anchor="end" font-size="10" ${TXT}>${o.yfmt ? o.yfmt(yv) : fmt(yv, 2)}</text>`; }
  (o.xticks || xs).forEach(x => { s += `<text x="${X(x)}" y="${h - mb + 14}" text-anchor="middle" font-size="10" ${TXT}>${esc(o.xfmt ? o.xfmt(x) : x)}</text>`; });
  if (o.xlabel) s += `<text x="${(ml + w - mr) / 2}" y="${h - 4}" text-anchor="middle" font-size="11" ${TXT2}>${esc(o.xlabel)}</text>`;
  if (o.hline != null) s += `<line x1="${ml}" x2="${w - mr}" y1="${Y(o.hline)}" y2="${Y(o.hline)}" stroke="var(--signal)" stroke-dasharray="4 3"/>`;
  series.forEach(se => { if (se.band) se.band.forEach(b => { s += `<line x1="${X(b[0])}" x2="${X(b[0])}" y1="${Y(b[1])}" y2="${Y(b[2])}" stroke="${se.color}" stroke-width="1.5" opacity=".55"/>`; }); const pts = se.points.map(p => `${X(p[0])},${Y(p[1])}`).join(" "); s += `<polyline points="${pts}" fill="none" stroke="${se.color}" stroke-width="2" stroke-dasharray="${se.dash || ""}"/>`; se.points.forEach(p => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="${se.color}"><title>${esc(se.name)} · ${o.xfmt ? o.xfmt(p[0]) : p[0]}: ${fmt(p[1], 3)}${p[2] ? " · " + esc(p[2]) : ""}</title></circle>`; }); });
  s += "</svg>";
  return s + `<div class="legend">${series.map(se => `<span><i style="background:${se.color}"></i>${esc(se.name)}</span>`).join("")}</div>`;
}
function svgHist(values, o = {}) {
  const w = o.w || 300, h = o.h || 120, bins = o.bins || 10; if (!values.length) return `<div class="small">no runs</div>`; const lo = o.lo != null ? o.lo : Math.min(...values), hi = o.hi != null ? o.hi : Math.max(...values); const step = (hi - lo) / bins || 1; const counts = new Array(bins).fill(0); values.forEach(v => counts[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / step)))]++); const mx = Math.max(...counts);
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`; counts.forEach((c, i) => { const bw = (w - 20) / bins, x = 10 + i * bw, bh = (h - 24) * c / (mx || 1); s += `<rect x="${x + 1}" y="${h - 20 - bh}" width="${bw - 2}" height="${bh}" fill="${o.color || "#17A398"}"><title>${fmt(lo + i * step, o.d || 0)}–${fmt(lo + (i + 1) * step, o.d || 0)}: ${c}</title></rect>`; });
  if (o.mark != null) { const x = 10 + (o.mark - lo) / (hi - lo || 1) * (w - 20); s += `<line x1="${x}" x2="${x}" y1="4" y2="${h - 20}" stroke="var(--signal)" stroke-width="2"/>`; }
  s += `<text x="10" y="${h - 6}" font-size="10" ${TXT}>${fmt(lo, o.d || 0)}</text><text x="${w - 10}" y="${h - 6}" font-size="10" ${TXT} text-anchor="end">${fmt(hi, o.d || 0)}</text>`; return s + "</svg>";
}
function svgSpark(vals, o = {}) { const w = o.w || 90, h = o.h || 22; if (!vals.length) return ""; const mx = o.max != null ? o.max : Math.max(1e-9, ...vals), mn = o.min != null ? o.min : 0; const X = i => 2 + i / Math.max(1, vals.length - 1) * (w - 4), Y = v => 2 + (1 - (v - mn) / (mx - mn || 1)) * (h - 4); const pts = vals.map((v, i) => `${X(i)},${Y(v)}`).join(" "); return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${o.color || "var(--blue)"}" stroke-width="1.5"/><circle cx="${X(vals.length - 1)}" cy="${Y(vals[vals.length - 1])}" r="2.5" fill="${o.color || "var(--blue)"}"/></svg>`; }
function barcode(runs, key) { return `<span class="barcode">${runs.map(r => { const o = outcome(r, key); return `<i style="background:var(--${o === "PASS" ? "pass" : o === "FAIL" ? "fail" : "unres"})" title="${esc(r.task_id)} r${r.repeat_index} ${o}"></i>`; }).join("")}</span>`; }
function svgScatter(pts, o = {}) {
  const w = o.w || 520, h = o.h || 300, ml = 52, mr = 16, mt = 14, mb = 40; if (!pts.length) return `<div class="empty">no cells</div>`;
  const xv = pts.map(p => p.x).filter(Number.isFinite), yv = pts.map(p => p.y); const xlog = !!o.xlog;
  const tx = x => xlog ? Math.log10(Math.max(x, 1e-6)) : x; let xmin = Math.min(...xv.map(tx)), xmax = Math.max(...xv.map(tx)); const pad = (xmax - xmin || 1) * 0.08; xmin -= pad; xmax += pad; const ymin = o.ymin != null ? o.ymin : 0, ymax = o.ymax != null ? o.ymax : Math.max(...yv, 1e-9);
  const X = x => ml + (xmax > xmin ? (tx(x) - xmin) / (xmax - xmin) : 0.5) * (w - ml - mr), Y = y => mt + (1 - (y - ymin) / (ymax - ymin || 1)) * (h - mt - mb);
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`;
  for (let i = 0; i <= 4; i++) { const yy = ymin + (ymax - ymin) * i / 4; s += `<line x1="${ml}" x2="${w - mr}" y1="${Y(yy)}" y2="${Y(yy)}" ${GRID}/><text x="${ml - 6}" y="${Y(yy) + 4}" text-anchor="end" font-size="10" ${TXT}>${o.yfmt ? o.yfmt(yy) : fmt(yy, 2)}</text>`; }
  let xt; if (xlog) { xt = []; const lo = Math.floor(Math.log10(Math.max(Math.min(...xv), 1e-6))), hi = Math.ceil(Math.log10(Math.max(...xv))); for (let d = lo; d <= hi; d++) [1, 2, 5].forEach(m => { const v = m * Math.pow(10, d); if (v >= Math.min(...xv) / 1.2 && v <= Math.max(...xv) * 1.2) xt.push(v); }); } else xt = [0, 1, 2, 3, 4].map(i => Math.min(...xv) + (Math.max(...xv) - Math.min(...xv)) * i / 4);
  xt.forEach(x => { s += `<line x1="${X(x)}" x2="${X(x)}" y1="${mt}" y2="${h - mb}" ${GRID}/><text x="${X(x)}" y="${h - mb + 14}" text-anchor="middle" font-size="10" ${TXT}>${o.xfmt ? o.xfmt(x) : fmt(x, 2)}</text>`; });
  s += `<text x="${(ml + w - mr) / 2}" y="${h - 4}" text-anchor="middle" font-size="11" ${TXT2}>${esc(o.xlabel || "")}</text>`;
  if (o.ylabel) s += `<text x="12" y="${(mt + h - mb) / 2}" text-anchor="middle" font-size="11" ${TXT2} transform="rotate(-90 12 ${(mt + h - mb) / 2})">${esc(o.ylabel)}</text>`;
  if (o.frontier) { const fr = pts.filter(p => Number.isFinite(p.x)).sort((a, b) => a.x - b.x); let best = -Infinity; const F = []; fr.forEach(p => { if (p.y > best) { best = p.y; F.push(p); } }); if (F.length > 1) s += `<polyline points="${F.map(p => X(p.x) + "," + Y(p.y)).join(" ")}" fill="none" stroke="var(--signal)" stroke-dasharray="4 3" stroke-width="1.5"/>`; }
  pts.forEach((p, i) => { if (!Number.isFinite(p.x)) return; if (p.err) s += `<line x1="${X(p.x)}" x2="${X(p.x)}" y1="${Y(p.err[0])}" y2="${Y(p.err[1])}" stroke="${p.color || "var(--blue)"}" opacity=".5"/>`; s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r || 8}" fill="${p.color || "var(--blue)"}" opacity=".92"${p.act ? ` data-act="${p.act}" data-key="${esc(p.key || "")}" style="cursor:pointer"` : ""}><title>${esc(p.title || p.label)}</title></circle><text x="${X(p.x)}" y="${Y(p.y) + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" style="pointer-events:none">${i + 1}</text>`; });
  s += "</svg>";
  return s + `<div class="legend">${pts.map((p, i) => `<span${p.act ? ` data-act="${p.act}" data-key="${esc(p.key || "")}" style="cursor:pointer"` : ""}><i style="background:${p.color || "var(--blue)"}"></i>${i + 1} ${esc(p.label)}</span>`).join("")}</div>`;
}
function svgGantt(spans, o = {}) {
  const w = o.w || 720, rowH = 14, items = spans.filter(s => ["chat", "execute_tool", "boundary_event", "grade"].includes(s.span));
  let t = 0; const rows = items.map(s => { const d = Math.max(s.ms || 0, s.span === "chat" ? 1 : 1); const r = { s, t0: t, d }; t += d; return r; });
  const total = Math.max(t, 1), h = rows.length * rowH + 30, ml = 150, mr = 10;
  const X = ms => ml + ms / total * (w - ml - mr);
  const col = s => s.span === "chat" ? "var(--ink)" : s.span === "boundary_event" ? "var(--fail)" : s.span === "grade" ? "var(--amber)" : (isEditSpan(s) ? "var(--teal)" : isTestSpan(s) ? "var(--blue)" : "var(--grey)");
  let g = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`;
  [0, 0.25, 0.5, 0.75, 1].forEach(f => { g += `<line x1="${X(f * total)}" x2="${X(f * total)}" y1="4" y2="${h - 22}" ${GRID}/><text x="${X(f * total)}" y="${h - 8}" text-anchor="middle" font-size="10" ${TXT}>${ints(f * total)} ms</text>`; });
  rows.forEach((r, i) => { const y = 4 + i * rowH; const lbl = r.s.span === "chat" ? `call ${r.s.step}` : r.s.span === "execute_tool" ? `${r.s.tool}${r.s.kind ? "/" + r.s.kind : ""}` : r.s.span; g += `<text x="${ml - 6}" y="${y + 10}" text-anchor="end" font-size="10" ${TXT2}>#${r.s.seq} ${esc(lbl).slice(0, 22)}</text><rect x="${X(r.t0)}" y="${y + 2}" width="${Math.max(2, X(r.t0 + r.d) - X(r.t0))}" height="${rowH - 4}" fill="${col(r.s)}" rx="2" data-act="scroll" data-seq="${r.s.seq}" style="cursor:pointer"><title>#${r.s.seq} ${esc(lbl)} · ${ints(r.d)} ms</title></rect>`; });
  return g + "</svg>";
}
function svgTokens(spans, o = {}) {
  const calls = spans.filter(s => s.span === "chat"); if (!calls.length || !calls.some(c => (c.in || 0) + (c.out || 0) > 0)) return calls.length ? `<div class="small">no token accounting in this ledger (imported run)</div>` : ""; const w = o.w || 720, h = o.h || 150, ml = 44, mr = 10, mt = 8, mb = 24;
  const mx = Math.max(1, ...calls.map(c => (c.in || 0) + (c.out || 0))); const bw = (w - ml - mr) / calls.length; const Y = v => mt + (1 - v / mx) * (h - mt - mb);
  let g = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`;
  for (let i = 0; i <= 3; i++) { const v = mx * i / 3; g += `<line x1="${ml}" x2="${w - mr}" y1="${Y(v)}" y2="${Y(v)}" ${GRID}/><text x="${ml - 5}" y="${Y(v) + 4}" text-anchor="end" font-size="10" ${TXT}>${ints(v)}</text>`; }
  calls.forEach((c, i) => { const x = ml + i * bw + 2; const inn = c.in || 0, out = c.out || 0; g += `<rect x="${x}" y="${Y(inn)}" width="${Math.max(2, bw - 4)}" height="${Y(0) - Y(inn)}" fill="var(--blue)" opacity=".85" data-act="scroll" data-seq="${c.seq}" style="cursor:pointer"><title>call ${c.step}: ${ints(inn)} in · ${ints(out)} out · ${usd(c.cost)}</title></rect><rect x="${x}" y="${Y(inn + out)}" width="${Math.max(2, bw - 4)}" height="${Y(inn) - Y(inn + out)}" fill="var(--signal)" data-act="scroll" data-seq="${c.seq}" style="cursor:pointer"><title>call ${c.step}: ${ints(out)} output tokens</title></rect><text x="${x + (bw - 4) / 2}" y="${h - 8}" text-anchor="middle" font-size="10" ${TXT}>${c.step}</text>`; });
  g += "</svg>";
  return g + `<div class="legend"><span><i style="background:var(--blue)"></i>input tokens (the transcript, re-sent every call)</span><span><i style="background:var(--signal)"></i>output tokens</span></div>`;
}
function heatTable(rowLabels, colLabels, M, o = {}) { // M[i][j] in [0,1] or counts; o.fmt for cell text; o.max for scale
  const mx = o.max != null ? o.max : Math.max(1e-9, ...M.flat()); const color = v => { const t = Math.min(1, Math.max(0, v / mx)); return o.diverging ? (v >= 0 ? `rgba(23,163,152,${0.1 + 0.8 * t})` : `rgba(228,87,46,${0.1 + 0.8 * Math.min(1, -v / mx)})`) : `rgba(59,111,217,${0.06 + 0.84 * t})`; };
  let h = `<table class="heat"><tr><th></th>${colLabels.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;
  rowLabels.forEach((r, i) => { h += `<tr><td class="lbl">${esc(r)}</td>${colLabels.map((c, j) => { const v = M[i][j]; return `<td style="background:${color(v)};color:${Math.abs(v) / mx > 0.55 ? "#fff" : "var(--ink)"}" title="${esc(r)} → ${esc(c)}: ${o.fmt ? o.fmt(v) : fmt(v, 2)}">${o.fmt ? o.fmt(v) : fmt(v, 2)}</td>`; }).join("")}</tr>`; });
  return h + "</table>";
}
function seqHtml(seq, cur) { return `<span class="seq-view">${seq.split("").map((c, i) => `<b class="${c}${i === cur ? " cur" : ""}" title="${esc(CODE_NAME[c] || c)}">${c}</b>`).join("")}</span>`; }
