// QA: open the console (exported file or a running server), click through every view, report errors, save screenshots.
//   NODE_PATH=$(npm root -g) node web/qa.js /tmp/console.html /tmp/shots
//   NODE_PATH=$(npm root -g) node web/qa.js http://127.0.0.1:8765/ /tmp/shots
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const target = process.argv[2] || "/tmp/console.html", outDir = process.argv[3] || "/tmp/console_shots";
  require("fs").mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(target.startsWith("http") ? target : "file://" + path.resolve(target));
  await page.waitForTimeout(900);
  const check = async (label) => { const err = await page.$eval("main", m => m.innerText.includes("render error") ? m.innerText.slice(0, 500) : ""); if (err) errors.push(`${label}: ${err}`); };
  const shot = async (name, full) => { await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: !!full }); };
  const tab = async (t) => { await page.click(`[data-act="tab"][data-v="${t}"]`); await page.waitForTimeout(250); await check(t); };
  const t0 = Date.now();
  await tab("overview"); await shot("01_overview", true);
  await tab("board"); await shot("02_board");
  await page.click('.chip.oracle[data-v="strong"]'); await page.waitForTimeout(200); await check("board strong"); await page.click('.chip.oracle[data-v="hidden"]');
  await tab("harness"); await shot("03_harness", true);
  await tab("traj"); await shot("04_traj_list");
  await page.click('tr[data-act="sel"]'); await page.waitForTimeout(400); await check("viewer"); await shot("05_traj_viewer", true);
  await page.click('tr[data-act="scroll"]').catch(() => { }); await page.waitForTimeout(200);
  await page.keyboard.press("j"); await page.waitForTimeout(200); await check("viewer j");
  await page.click('[data-act="trajTab"][data-v="compare"]'); await page.waitForTimeout(200); const opts = await page.$$eval('select[data-act="cmp"] option', o => o.map(x => x.value).filter(Boolean)); if (opts.length) { await page.selectOption('select[data-act="cmp"]', opts[0]); await page.waitForTimeout(300); } await check("compare"); await shot("06_compare", true);
  await page.click('[data-act="trajTab"][data-v="list"]'); await page.waitForTimeout(200); for (let i = 0; i < 4; i++) { const boxes = await page.$$('input[data-act="multiToggle"]'); if (!boxes[i]) break; await boxes[i].click(); await page.waitForTimeout(120); } await page.click('[data-act="multiOpen"]'); await page.waitForTimeout(400); await check("multi"); await shot("07_multi", true);
  await tab("patterns"); await shot("08_patterns", true);
  await tab("queries"); await page.click('[data-act="qex"]'); await page.waitForTimeout(300); await check("queries ex"); await page.click('[data-act="qexport"]'); await page.waitForTimeout(200); await check("queries export"); await shot("09_queries", true);
  await tab("dist"); await shot("10_dist", true);
  await tab("attr"); await page.click('tr[data-act="attrOpen"]'); await page.waitForTimeout(200); await check("attr open"); await shot("11_attr", true);
  await tab("exp"); const picks = await page.$$('[data-act="expA"]'); if (picks.length) await picks[0].click(); const pb = await page.$$('[data-act="expB"]'); if (pb.length > 1) await pb[1].click(); await page.waitForTimeout(400); await check("exp AB"); await shot("12_exp", true);
  await page.selectOption('select[data-act="expFA"]', "harness_id"); await page.selectOption('select[data-act="expFB"]', "model"); await page.waitForTimeout(300); await check("exp swapped");
  await tab("tele"); await shot("13_tele", true);
  await tab("integ"); await shot("14_integ", true);
  await tab("report"); await shot("15_report");
  await page.keyboard.press("?"); await page.waitForTimeout(200); await check("help"); await shot("16_help"); await page.keyboard.press("Escape");
  await page.keyboard.press("t"); await page.waitForTimeout(200); await tab("overview"); await shot("17_dark_overview"); await page.keyboard.press("t"); await page.keyboard.press("t");
  // url state round trip
  const url = await page.evaluate(() => location.hash); console.log("hash", url.slice(0, 120));
  console.log("tabs ok in", ((Date.now() - t0) / 1000).toFixed(1), "s");
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors");
  await browser.close();
})();
