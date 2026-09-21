// 計算ノード（式 / JavaScript）と条件分岐ノード、ループのJavaScriptモードを
// iPhone相当のタッチ端末として操作して確かめる。
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + new URL('../harness.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));
const paste = async obj => { await p.evaluate(o => { const t = document.querySelector('#spec'); t.value = JSON.stringify(o, null, 1); t.dispatchEvent(new Event('input')); }, obj); await p.waitForTimeout(250); };
const vErr = async () => (await p.textContent('#vErr')).replace(/\s+/g, ' ').trim();
const state = async () => { await p.waitForFunction(() => /^state: (success|failed|cancelled|paused)/.test(document.querySelector('#stateline').textContent), null, { timeout: 25000 });
  return (await p.textContent('#stateline')).slice(0, 90); };
const result = () => p.evaluate(() => { const r = window.__dbg.run(); return r && r.result; });
const SC = { type: "object", required: ["score"], properties: { score: { type: "integer" } } };
const base = { metadata: { name: "計算", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "A", type: "llm", provider: "m", mock: { fixed: { score: 3 } }, schema: SC },
          { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } }] };

// ① 計算ノードを足して、入ってきた値に名前を付けて式で計算する
await paste(base);
await tap('#addNode'); await tap('[data-add="calc"]'); await tap('#shClose');
const clId = (await spec()).nodes.slice(-1)[0].id;
R['① 足したノード'] = { id: clId, 中身: (await spec()).nodes.slice(-1)[0] };
ok.addCalc = clId === 'cl' && R['① 足したノード'].中身.lang === 'expr';
await tap('.nd[data-id="A"] .port.pout'); await tap(`.nd[data-id="${clId}"] .port.pin`);
await tap(`.nd[data-id="${clId}"] .port.pout`); await tap('.nd[data-id="out"] .port.pin');
await tap(`.nd[data-id="${clId}"]`);
R['① 変数の既定名'] = await p.getAttribute('[data-as]', 'placeholder');
await p.selectOption('[data-ip]', 'score'); await p.waitForTimeout(200);     // score だけ使う
await p.fill('[data-as]', 'p'); await p.waitForTimeout(200);
await p.fill('[data-f="code"]', 'p * 3 + 1'); await p.waitForTimeout(250);
R['① 使える名前の案内'] = (await p.textContent('#sheetBody')).includes('inputs');
const s1 = await spec();
R['① 線と中身'] = { as: s1.edges.find(e => e.to.node === clId).as, pick: s1.edges.find(e => e.to.node === clId).pick,
  code: s1.nodes.find(n => n.id === clId).code, 検証: await vErr() || '（エラーなし）' };
ok.calcEdit = R['① 変数の既定名'] === 'A' && R['① 線と中身'].as === 'p' && R['① 線と中身'].pick === 'score'
  && R['① 線と中身'].code === 'p * 3 + 1' && R['① 線と中身'].検証 === '（エラーなし）' && R['① 使える名前の案内'];
await tap('#shClose');
await tap('#runTop');
R['① 実行'] = await state();
R['① 結果'] = await result();
ok.calcRun = R['① 実行'].includes('success') && R['① 結果'].value === 10;

// ② JavaScript モードに変えて計算する（return で返す）
await tap(`.nd[data-id="${clId}"]`);
await p.selectOption('[data-f="lang"]', 'js'); await p.waitForTimeout(250);
R['② 言語の注意'] = (await p.textContent('#sheetBody')).includes('Python');
await p.fill('[data-f="code"]', 'return p * 4;'); await p.waitForTimeout(250);
await tap('#shClose');
await tap('#runTop');
R['② 実行'] = await state();
R['② 結果'] = await result();
ok.calcJS = R['② 言語の注意'] && R['② 実行'].includes('success') && R['② 結果'].value === 12;

// ③ 予約語は変数名にできない（黙って使わない）
await tap(`.nd[data-id="${clId}"]`);
await p.fill('[data-as]', 'in'); await p.waitForTimeout(250);
R['③ 予約語'] = { as: (await spec()).edges.find(e => e.to.node === clId).as,
  枠の色: await p.evaluate(() => document.querySelector('[data-as]').style.borderColor) };
ok.reserved = R['③ 予約語'].as === undefined && R['③ 予約語'].枠の色.includes('err');
await p.fill('[data-as]', 'p'); await p.waitForTimeout(200);
await tap('#shClose');

// ④ 条件分岐ノード: 条件を書いて、当たった1本だけに流す
await paste({ metadata: { name: "条件", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "A", type: "llm", provider: "m", mock: { fixed: { score: 6 } }, schema: SC },
          { id: "o1", type: "output" }, { id: "o2", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } }] });
await tap('#addNode'); await tap('[data-add="cond"]'); await tap('#shClose');
const cdId = (await spec()).nodes.slice(-1)[0].id;
R['④ 既定の条件'] = (await spec()).nodes.find(n => n.id === cdId).ports;
R['④ 図の出口'] = { 数: await p.locator(`.nd[data-id="${cdId}"] .port.pout`).count(),
  ラベル: await p.locator(`.nd[data-id="${cdId}"] .plab`).allTextContents() };
ok.condPorts = R['④ 既定の条件'].length === 2 && R['④ 既定の条件'][1].else === true
  && R['④ 図の出口'].数 === 2 && R['④ 図の出口'].ラベル.join() === '10文字以上,それ以外';
await tap('.nd[data-id="A"] .port.pout'); await tap(`.nd[data-id="${cdId}"] .port.pin`);
await tap(`.nd[data-id="${cdId}"] .port.pout[data-port="c1"]`); await tap('.nd[data-id="o1"] .port.pin');
await tap(`.nd[data-id="${cdId}"] .port.pout[data-port="c2"]`); await tap('.nd[data-id="o2"] .port.pin');
await tap(`.nd[data-id="${cdId}"]`);
await p.fill('[data-cf="label"][data-i="0"]', '5点以上'); await p.waitForTimeout(150);
await p.fill('[data-cf="expr"][data-i="0"]', 'score >= 5'); await p.waitForTimeout(250);
R['④ 使える名前'] = (await p.textContent('#sheetBody')).includes('value');
const s4 = await spec();
R['④ 配線'] = { 条件: s4.nodes.find(n => n.id === cdId).ports, 線: s4.edges.filter(e => e.from.node === cdId).map(e => `${e.from.port}→${e.to.node}`),
  検証: await vErr() || '（エラーなし）' };
ok.condEdit = R['④ 配線'].線.join() === 'c1→o1,c2→o2' && R['④ 配線'].検証 === '（エラーなし）' && R['④ 使える名前'];
await tap('#shClose');
await tap('#runTop');
R['④ 実行'] = await state();
R['④ どちらに流れたか'] = await p.evaluate(() => ['o1', 'o2'].filter(k => window.__dbg.nodeOut(k)));
ok.condRun = R['④ 実行'].includes('success') && R['④ どちらに流れたか'].join() === 'o1';

// ⑤ ループの打ち切り条件を JavaScript で書く
await paste({ metadata: { name: "ループJS", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "lp", type: "loop", loop: { id: "lp", max: 9 } },
          { id: "A", type: "llm", provider: "m", mock: { tag: "A" } }, { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "lp", port: "in" } },
          { from: { node: "lp", port: "out" }, to: { node: "A", port: "in" } },
          { from: { node: "lp", port: "out" }, to: { node: "out", port: "in" }, loopRole: "done" },
          { from: { node: "A", port: "out" }, to: { node: "lp", port: "in" }, loop: { id: "lp" } }] });
await tap('.nd[data-id="lp"]');
await p.selectOption('[data-f="__ukind"]', 'js'); await p.waitForTimeout(250);
await p.fill('[data-f="loop.until"]', 'return iteration >= 3;'); await p.waitForTimeout(250);
R['⑤ ループの中身'] = (await spec()).nodes.find(n => n.id === 'lp').loop;
ok.loopJS = R['⑤ ループの中身'].lang === 'js' && R['⑤ ループの中身'].until === 'return iteration >= 3;';
await tap('#shClose');
await tap('#runTop');
R['⑤ 実行'] = await state();
ok.loopJSRun = R['⑤ 実行'].includes('success') && R['⑤ 実行'].includes('iterTotal=3');

// ⑥ 右上の ？ で使い方が出て、全文コピーできる
await tap('#helpBtn');
R['⑥ 使い方'] = { 見出し: await p.locator('.help h4').count(), 文字数: (await p.textContent('.help')).length,
  コピー: null };
await tap('#hlCopy');
R['⑥ 使い方'].コピー = (await p.textContent('#logMsg')).includes('コピーした');
ok.help = R['⑥ 使い方'].見出し >= 10 && R['⑥ 使い方'].文字数 > 2000 && R['⑥ 使い方'].コピー;

// ⑦ 使い方の「JSONで書く」タブ: JSONのかたまりが形のまま出て、全文コピーできる
await tap('#hlTab_json');
R['⑦ JSONタブ'] = { 見出し: await p.locator('.help h4').count(), かたまり: await p.locator('.help pre.hcode').count(),
  文字数: (await p.textContent('.help')).length,
  例にloopRole: (await p.textContent('.help')).includes('"loopRole": "done"'),
  onError: (await p.textContent('.help')).includes('onError'), コピー: null };
await tap('#hlCopy');
R['⑦ JSONタブ'].コピー = (await p.textContent('#logMsg')).includes('コピーした');
// ⑧ 3つ目のタブ「詳しい動き」
await tap('#hlTab_deep');
{const t = await p.textContent('.help');
 R['⑧ 詳しい動き'] = { 見出し: await p.locator('.help h4').count(),
   かたまり: await p.locator('.help pre.hcode').count(), 文字数: t.length,
   章: ['値が流れる仕組み','start:any','onError','DEADLOCK','Retry と Resume',
        'よく事故る組み合わせ','そのまま貼って動く例'].every(x=>t.includes(x)),
   例: t.includes('"type": "map"') && t.includes('"type": "quorum"') && t.includes('"modules"') };
 await tap('#hlCopy');
 R['⑧ 詳しい動き'].コピー = (await p.textContent('#logMsg')).includes('コピーした');
 ok.helpDeep = R['⑧ 詳しい動き'].見出し >= 40 && R['⑧ 詳しい動き'].文字数 > 30000
   && R['⑧ 詳しい動き'].かたまり >= 25 && R['⑧ 詳しい動き'].章 && R['⑧ 詳しい動き'].例
   && R['⑧ 詳しい動き'].コピー;}
await tap('#hlTab_read');                               // 読みものへ戻れる
R['⑦ 戻れる'] = (await p.textContent('.help')).includes('まず動かす');
ok.helpJson = R['⑦ JSONタブ'].かたまり >= 15 && R['⑦ JSONタブ'].文字数 > 6000
  && R['⑦ JSONタブ'].例にloopRole && R['⑦ JSONタブ'].onError && R['⑦ JSONタブ'].コピー && R['⑦ 戻れる'];
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
