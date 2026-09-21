// 記憶（memory）ノードを、iPhone相当のタッチ端末として操作して確かめる。
// 「足す→入口ごとの扱いを決める→実行して毎周たまる→記録に残る→使い方に載っている」までを画面から通す。
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + new URL('../harness.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(160); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));
const paste = async obj => { await p.evaluate(o => { const t = document.querySelector('#spec'); t.value = JSON.stringify(o, null, 1); t.dispatchEvent(new Event('input')); }, obj); await p.waitForTimeout(300); };
const vErr = async () => (await p.textContent('#vErr')).replace(/\s+/g, ' ').trim();
const state = async () => { await p.waitForFunction(() => /^state: (success|failed|cancelled|paused)/.test(document.querySelector('#stateline').textContent), null, { timeout: 30000 });
  return (await p.textContent('#stateline')).replace(/\s+/g, ' ').slice(0, 130); };

// ① ＋ノードに「記憶」があり、足すと既定が入る
await tap('#addNode');
R['① 選べる種類'] = await p.locator('#sheetBody [data-add]').evaluateAll(els => els.map(e => e.dataset.add));
ok.palette = R['① 選べる種類'].includes('memory');
await tap('#sheetBody [data-add="memory"]');
const m1 = (await spec()).nodes.find(n => n.type === 'memory');
R['① 足した既定'] = m1;
ok.addDefaults = !!m1 && m1.scope === 'run' && m1.out === 'items' && m1.emit === 'always'
  && JSON.stringify(m1.rules) === '[{"port":"in","op":"append"}]' && m1.start.mode === 'any';

// ② 入口を足す・扱いを変える・削除する
R['② 欄'] = await p.locator('#sheetBody [data-f]').evaluateAll(els => els.map(e => e.dataset.f));
ok.sheetFields = ['scope', 'out', 'max', 'emit', '__unique', '__initial'].every(k => R['② 欄'].includes(k));
await tap('#mrAdd');
await p.fill('[data-mr-port="1"]', '消す'); await p.waitForTimeout(250);
await p.selectOption('[data-mr-op="1"]', 'clear'); await p.waitForTimeout(250);
R['② 入口2つ'] = (await spec()).nodes.find(n => n.type === 'memory').rules;
ok.rulesEdit = JSON.stringify(R['② 入口2つ']) === '[{"port":"in","op":"append"},{"port":"消す","op":"clear"}]';
// 線が入っていない入口は「線が入っていない」と言う
R['② 未接続の注意'] = (await p.textContent('#sheetBody')).includes('この入口に線が入っていない');
ok.unwiredNote = R['② 未接続の注意'];
await tap('[data-mrdel="1"]');
ok.rulesDel = JSON.stringify((await spec()).nodes.find(n => n.type === 'memory').rules)
  === '[{"port":"in","op":"append"}]';

// ③ 「条件が真のときだけ流す」にすると条件の欄が増える
await p.selectOption('[data-f="emit"]', 'when'); await p.waitForTimeout(300);
R['③ when にしたとき'] = { 欄: await p.locator('#sheetBody [data-f="when"]').count(), 検証: await vErr() };
ok.emitWhenField = R['③ when にしたとき'].欄 === 1 && R['③ when にしたとき'].検証.includes('出す条件');
await p.fill('[data-f="when"]', 'count >= 2'); await p.waitForTimeout(250);
ok.emitWhenSet = (await spec()).nodes.find(n => n.type === 'memory').when === 'count >= 2';
await p.selectOption('[data-f="emit"]', 'always'); await p.waitForTimeout(300);
ok.emitSwap = (await spec()).nodes.find(n => n.type === 'memory').when === undefined;
// 最初の中身は JSON の配列だけ受け取る
await p.fill('[data-f="__initial"]', '{こわれ'); await p.waitForTimeout(250);
const badStyle = await p.getAttribute('[data-f="__initial"]', 'style');
await p.fill('[data-f="__initial"]', '"配列でない"'); await p.waitForTimeout(250);
const notArr = (await spec()).nodes.find(n => n.type === 'memory').initial;
await p.fill('[data-f="__initial"]', '["はじめ"]'); await p.waitForTimeout(250);
R['③ 最初の中身'] = { 壊れた枠: badStyle, 配列でない: notArr,
  よい: (await spec()).nodes.find(n => n.type === 'memory').initial };
ok.initialField = /--err/.test(badStyle || '') && notArr === undefined
  && JSON.stringify(R['③ 最初の中身'].よい) === '["はじめ"]';
await tap('#shClose');

// ④ 図にラベルと色が出る
R['④ 図'] = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.nd')].find(x => x.className.includes('t-memory'));
  return el ? { class: el.className, text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) } : null; });
ok.canvas = !!R['④ 図'] && R['④ 図'].text.includes('記憶') && R['④ 図'].text.includes('ためる');

// ⑤ ループの中で毎周たまる（many では残らない履歴が残る）
await paste({
  metadata: { name: "記憶", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "lp", type: "loop", loop: { id: "lp", max: 3 } },
    { id: "書く", type: "llm", provider: "m", mock: { tag: "案" }, inputs: { in: { type: "any", cardinality: "many" } }, start: { mode: "any" } },
    { id: "履歴", type: "memory", scope: "run", rules: [{ port: "in", op: "append" }], out: "items", emit: "always", start: { mode: "any" } },
    { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "lp", port: "in" }, position: 0 },
    { from: { node: "lp", port: "out" }, to: { node: "書く", port: "in" }, loopRole: "body", position: 1 },
    { from: { node: "書く", port: "out" }, to: { node: "履歴", port: "in" } },
    { from: { node: "履歴", port: "out" }, to: { node: "lp", port: "in" }, loop: { id: "lp" }, position: 1 },
    { from: { node: "lp", port: "out" }, to: { node: "out", port: "in" }, loopRole: "done" }] });
R['⑤ 検証'] = await vErr() || '（エラーなし）';
await tap('#runTop');
R['⑤ 実行'] = await state();
ok.memRun = R['⑤ 実行'].includes('success') && R['⑤ 実行'].includes('案1') && R['⑤ 実行'].includes('案3');
R['⑤ ログ'] = (await p.textContent('#log')).replace(/\s+/g, ' ');
ok.logged = /記憶・Runで1つ/.test(R['⑤ ログ']) && /3件/.test(R['⑤ ログ']);

// ⑥ 実行の記録に memories が残る（使った Delivery と何をしたかまで）
R['⑥ 記録'] = await p.evaluate(() => {
  const D = window.__dbg, t = D.eng.traceReport(D.spec(), D.run());
  const k = Object.keys(t.memories)[0];
  return { key: k, items: t.memories[k].items, applied: t.memories[k].applied.length,
    ops: t.memories[k].ops.map(o => o.from + '/' + o.op + '/' + o.size),
    summary: D.eng.runSummary(D.spec(), D.run()).memories }; });
ok.trace = R['⑥ 記録'].key === '履歴@run' && R['⑥ 記録'].applied === 3
  && JSON.stringify(R['⑥ 記録'].ops) === '["書く/append/1","書く/append/2","書く/append/3"]'
  && R['⑥ 記録'].summary[0].size === 3 && R['⑥ 記録'].summary[0].ops === 3;

// ⑦ 診断: 上限が無い／Map の中で Run 共有／流さない設定
const withMap = {
  metadata: { name: "記憶Map", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "src", type: "calc", lang: "js", code: 'return ["a","b"];' },
    { id: "m", type: "map", map: { id: "m" } },
    { id: "記憶", type: "memory", scope: "run", rules: [{ port: "in", op: "append" }], out: "items", emit: "always", start: { mode: "any" } },
    { id: "end", type: "pass" }, { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "src", port: "in" } },
    { from: { node: "src", port: "out" }, to: { node: "m", port: "in" }, position: 0 },
    { from: { node: "m", port: "out" }, to: { node: "記憶", port: "in" }, mapRole: "body" },
    { from: { node: "記憶", port: "out" }, to: { node: "m", port: "in" }, map: { id: "m" }, position: 1 },
    { from: { node: "m", port: "out" }, to: { node: "end", port: "in" }, mapRole: "done" },
    { from: { node: "end", port: "out" }, to: { node: "out", port: "in" } }] };
await paste(withMap);
await tap('#btnReview');
R['⑦ 診断'] = (await p.textContent('#sheetBody')).replace(/\s+/g, ' ');
ok.review = /Map の中なのに記憶が「Run で1つ」/.test(R['⑦ 診断'])
  && /上限が無いので、回るほど増える/.test(R['⑦ 診断']);
await tap('#shClose');

// ⑧ 使い方の3タブに記憶が載っている
await tap('#helpBtn');
const helpHas = async (tabSel, words) => { await tap(tabSel); const t = await p.textContent('.help');
  return words.every(w => t.includes(w)); };
R['⑧ 読みもの'] = await helpHas('#hlTab_read', ['記憶（memory）', 'ためる（足す）']);
R['⑧ JSONで書く'] = await helpHas('#hlTab_json', ['memory（記憶）', '"op"', '"scope"']);
R['⑧ 詳しい動き'] = await helpHas('#hlTab_deep', ['記憶（memory）', 'applied', '届いた線を二度使わない仕組み']);
ok.help = R['⑧ 読みもの'] && R['⑧ JSONで書く'] && R['⑧ 詳しい動き'];
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
