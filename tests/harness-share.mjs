// 書き出し（HSL・ファイル・共有リンク）/ 取り込み / 診断 を、タッチ端末として操作する。
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const URL_ = 'file://' + new URL('../harness.html', import.meta.url).pathname;
await p.goto(URL_);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));

// ① 書き出し: HSL が出る
await tap('#exSeg2 button[data-ex="ex7"]');          // Loop×並列（いちばん複雑な例）
await tap('#btnExport');
const hsl = await p.inputValue('#exText');
R['① HSL'] = hsl.split('\n').slice(0, 6);
R['① 往復の警告'] = (await p.locator('#sheetBody .vErr').count()) ? await p.textContent('#sheetBody .vErr') : 'なし';
ok.hsl = /^harness /m.test(hsl) && /^node gate: llm\b/m.test(hsl) && /loop rev max 3 until/.test(hsl)
  && R['① 往復の警告'] === 'なし';

// ② ファイル保存（.hsl）
const dl = p.waitForEvent('download', { timeout: 10000 });
await tap('#exSaveH');
const file = await dl;
const saved = await file.path();
const savedText = (await import('node:fs')).readFileSync(saved, 'utf8');
R['② 保存したファイル'] = { name: file.suggestedFilename(), 先頭: savedText.split('\n')[1] };
ok.save = savedText.startsWith('# hsl/1') && /^harness /m.test(savedText);

// ③ 共有リンクを作り、その URL を新しいタブで開くと同じものが出る
await tap('#exLink');
await p.waitForFunction(() => document.querySelector('#exLinkText') && document.querySelector('#exLinkText').value.length > 40);
const link = await p.inputValue('#exLinkText');
R['③ リンクの長さ'] = link.length + '文字 / ' + (link.includes('#s=z') ? '圧縮あり' : '圧縮なし');
const before = await spec();
const p2 = await ctx.newPage();
await p2.goto(link);
await p2.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
await p2.waitForTimeout(400);
const restored = await p2.evaluate(() => JSON.parse(document.querySelector('#spec').value));
R['③ 復元'] = { nodes: restored.nodes.length, edges: restored.edges.length,
  同一: JSON.stringify(restored) === JSON.stringify(before), hint: (await p2.textContent('#hint')).slice(0, 20) };
ok.share = R['③ 復元'].同一 && restored.nodes.length === before.nodes.length;
await p2.close();

// ④ 取り込み: HSL を貼って読む
await tap('#shClose');
await tap('#exSeg2 button[data-ex="ex1"]');
const hslText = `harness "手で書いた" v1
provider m = mock
node in: input
node a: llm m
  prompt "{{{in}}}"
  mock {"text":"やあ"}
node out: output
in -> a
a -> out`;
await tap('#btnImport');
await p.fill("#imText", hslText);
await tap('#imGo');
await tap('#imApply');
const s4 = await spec();
R['④ HSLを貼って取り込み'] = { name: s4.metadata.name, nodes: s4.nodes.map(n => n.id), edges: s4.edges.length };
ok.importHsl = s4.metadata.name === '手で書いた' && s4.nodes.length === 3 && s4.edges.length === 2;

// ⑤ 取り込んだものがそのまま実行できる
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['⑤ 取り込んだ直後に実行'] = (await p.textContent('#stateline')).slice(0, 120);
ok.runImported = R['⑤ 取り込んだ直後に実行'].includes('success') && R['⑤ 取り込んだ直後に実行'].includes('やあ');

// ⑥ 共有リンク文字列を貼っても読む
await tap('#btnImport');
await p.fill('#imText', link);
await tap('#imGo');
R['⑥ リンクを貼って取り込み'] = (await spec()).metadata.name;
ok.importLink = R['⑥ リンクを貼って取り込み'] === 'Loop×並列';

// ⑦ 診断: わざと壊した構成（JSONで貼り込む）で問題が出る
const brokenJSON = JSON.stringify({
  metadata: { name: "壊れた", version: "1" },
  providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "a", type: "llm", provider: "m", mock: { text: "x" } },
          { id: "孤島", type: "llm", provider: "m", mock: { text: "y" } }, { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "a", port: "in" } },
          { from: { node: "a", port: "out" }, to: { node: "out", port: "in" }, if: "unknownNode.out.score > 1" }]
}, null, 1);
await tap('#btnImport');
await p.fill('#imText', brokenJSON);
await tap('#imGo');
await tap('#imApply');
R['⑦ 壊れた構成を取り込み'] = (await spec()).metadata.name;
await tap('#btnReview');
const diag = await p.textContent('#sheetBody');
R['⑦ 診断'] = diag.replace(/\s+/g, ' ').slice(0, 220);
ok.review = diag.includes('孤島') && diag.includes('unknownNode');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
