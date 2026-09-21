// 先着（race / First Accept）を、iPhone相当のタッチ端末として操作して確かめる。
// 「足す→中身を決める→図に出る→実行して止まる候補が出る」までを画面から通す。
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
  return (await p.textContent('#stateline')).replace(/\s+/g, ' ').slice(0, 120); };

const SC = { type: "object", required: ["score"], properties: { score: { type: "integer" } } };
const cand = (id, v) => ({ id, type: "llm", provider: "m", mock: { fixed: { score: v } }, schema: SC });

// ① ＋ノードに「先着」があり、足すと既定が入る
await tap('#addNode');
R['① 選べる種類'] = await p.locator('#sheetBody [data-add]').evaluateAll(els => els.map(e => e.dataset.add));
ok.palette = R['① 選べる種類'].includes('race');
await tap('#sheetBody [data-add="race"]');
const s1 = await spec();
const rc1 = s1.nodes.find(n => n.type === 'race');
R['① 足した既定'] = rc1;
ok.addDefaults = !!rc1 && rc1.lang === 'expr' && rc1.condition === 'value.score >= 80'
  && rc1.onNone === 'error' && rc1.cancel === 'pending'
  && rc1.start.mode === 'any' && rc1.inputs.in.cardinality === 'many';

// ② 中身の編集に先着の欄が出る（条件・どれも通らなかったとき・決まったとき）
R['② 欄'] = await p.locator('#sheetBody [data-f]').evaluateAll(els => els.map(e => e.dataset.f));
ok.sheetFields = ['lang', 'condition', 'onNone', 'cancel', 'total'].every(k => R['② 欄'].includes(k));
// 「決めた値を流す」に変えると値の欄が増える
await p.selectOption('[data-f="onNone"]', 'value'); await p.waitForTimeout(250);
R['② value にしたとき'] = { 欄: (await p.locator('#sheetBody [data-f="__onNoneValue"]').count()),
  検証: await vErr() };
ok.onNoneValueField = R['② value にしたとき'].欄 === 1
  && R['② value にしたとき'].検証.includes('onNoneValue');   // 値が無いうちは検証が名指しする
await p.fill('[data-f="__onNoneValue"]', '{"score":0}'); await p.waitForTimeout(250);
R['② 値を入れたあと'] = { spec: (await spec()).nodes.find(n => n.type === 'race').onNoneValue, 検証: await vErr() };
ok.onNoneValueSet = JSON.stringify(R['② 値を入れたあと'].spec) === '{"score":0}';
// 「いちばん良いもの」にすると見る場所の欄になり、決めた値は消える
await p.selectOption('[data-f="onNone"]', 'best'); await p.waitForTimeout(250);
const s2 = (await spec()).nodes.find(n => n.type === 'race');
R['② best にしたとき'] = { path欄: await p.locator('#sheetBody [data-f="path"]').count(),
  onNoneValue: s2.onNoneValue === undefined };
ok.onNoneSwap = R['② best にしたとき'].path欄 === 1 && R['② best にしたとき'].onNoneValue;
// JSON として読めない値は受け取らない
await p.selectOption('[data-f="onNone"]', 'value'); await p.waitForTimeout(250);
await p.fill('[data-f="__onNoneValue"]', '{こわれ'); await p.waitForTimeout(250);
R['② 壊れた値'] = { 枠: await p.getAttribute('[data-f="__onNoneValue"]', 'style'),
  spec: (await spec()).nodes.find(n => n.type === 'race').onNoneValue };
ok.onNoneValueBad = /--err/.test(R['② 壊れた値'].枠 || '') && R['② 壊れた値'].spec === undefined;
await tap('#shClose');

// ③ 図にラベルと色が出る
R['③ 図'] = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.nd')].find(x => x.className.includes('t-race'));
  return el ? { class: el.className, text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) } : null; });
ok.canvas = !!R['③ 図'] && R['③ 図'].text.includes('先着');

// ④ 3候補を貼って実行すると、2番目で決まって3番目は動かない
await paste({
  metadata: { name: "先着", version: "1", layout: { C1: { x: 0, y: 100 }, C2: { x: 0, y: 220 }, C3: { x: 0, y: 340 } } },
  providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input", routing: { mode: "parallel", failurePolicy: "fail_fast" } },
    cand("C1", 50), cand("C2", 90), cand("C3", 95),
    { id: "先着", type: "race", lang: "expr", condition: "score >= 80", onNone: "error",
      cancel: "pending", inputs: { in: { type: "any", cardinality: "many" } }, start: { mode: "any" } },
    { id: "out", type: "output" }],
  edges: [...["C1", "C2", "C3"].map(id => ({ from: { node: "in", port: "out" }, to: { node: id, port: "in" } })),
    ...["C1", "C2", "C3"].map((id, i) => ({ from: { node: id, port: "out" }, to: { node: "先着", port: "in" }, position: i })),
    { from: { node: "先着", port: "out" }, to: { node: "out", port: "in" } }] });
R['④ 検証'] = await vErr() || '（エラーなし）';
await tap('#runTop');
R['④ 実行'] = await state();
R['④ ノード表'] = await p.evaluate(() => [...document.querySelectorAll('#nodeTable tbody tr')]
  .map(tr => [...tr.querySelectorAll('td')].slice(0, 3).map(td => td.textContent.trim())));
ok.raceRun = R['④ 実行'].includes('success') && R['④ 実行'].includes('calls=2');
R['④ 止まった候補'] = await p.evaluate(() => {
  const r = window.__dbg.run();
  return Object.entries(r.nodeRuns).filter(([k, v]) => v.some(h => h.cancelReason === 'race_decided')).map(([k]) => k); });
ok.cancelled = JSON.stringify(R['④ 止まった候補']) === '["C3"]';
R['④ ログ'] = (await p.textContent('#log')).replace(/\s+/g, ' ');
ok.logged = /先着/.test(R['④ ログ']) && /まだ動いていない候補を止めた: C3/.test(R['④ ログ'])
  && /待つ/.test(R['④ ログ']);

// ⑤ 実行の記録（races）に1回ぶんずつ残る
R['⑤ 記録'] = await p.evaluate(() => {
  const D = window.__dbg, t = D.eng.traceReport(D.spec(), D.run());
  return { races: t.races.map(x => ({ decided: x.decided, by: x.by, tried: x.tried.length, cancelled: x.cancelled || null })),
    待ち: (D.run().nodeRuns['先着'] || []).map(h => h.status) }; });
ok.trace = R['⑤ 記録'].races.length === 2 && R['⑤ 記録'].races[0].decided === false
  && R['⑤ 記録'].races[1].by === 'condition'
  && JSON.stringify(R['⑤ 記録'].races[1].cancelled) === '["C3"]'
  && JSON.stringify(R['⑤ 記録'].待ち) === '["waiting","success"]';

// ⑥ 診断: 動き出す条件が「全部そろったら」だと注意が出る／候補1本も注意
const bad = await spec();
bad.nodes.find(n => n.id === '先着').start = { mode: 'all' };
await paste(bad);
await tap('#btnReview');
R['⑥ 診断'] = (await p.textContent('#sheetBody')).replace(/\s+/g, ' ');
ok.review = /早く決めて止めたいなら/.test(R['⑥ 診断']);
await tap('#shClose');

// ⑦ 使い方の3タブに先着が載っている
await tap('#helpBtn');
const helpHas = async (tabSel, words) => { await tap(tabSel); const t = await p.textContent('.help');
  return words.every(w => t.includes(w)); };
R['⑦ 読みもの'] = await helpHas('#hlTab_read', ['先着（race）', '残りの候補を止める']);
R['⑦ JSONで書く'] = await helpHas('#hlTab_json', ['race（先着', '"cancel"']);
R['⑦ 詳しい動き'] = await helpHas('#hlTab_deep', ['先着（race / First Accept）', 'race_decided', 'waiting']);
ok.help = R['⑦ 読みもの'] && R['⑦ JSONで書く'] && R['⑦ 詳しい動き'];
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
