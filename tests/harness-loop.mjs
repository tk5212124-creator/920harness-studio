// ループノード・入力ノードの文言・出力ノードの受け取り方・入力の順番を、
// iPhone相当のタッチ端末として一通り操作して確かめる。
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
// JSONタブに貼るのと同じ道（書いたその場で図に入る）。取り込みシート経由は harness-share.mjs で見ている
const paste = async obj => { await p.evaluate(o => { const t = document.querySelector('#spec'); t.value = JSON.stringify(o, null, 1); t.dispatchEvent(new Event('input')); }, obj); await p.waitForTimeout(250); };
const vErr = async () => (await p.textContent('#vErr')).replace(/\s+/g, ' ').trim();
const state = async () => { await p.waitForFunction(() => /^state: (success|failed|cancelled|paused)/.test(document.querySelector('#stateline').textContent), null, { timeout: 20000 });
  return (await p.textContent('#stateline')).slice(0, 70); };

const mk = (nodes, edges, extra) => Object.assign({ metadata: { name: "ためし", version: "1" }, providers: { m: { adapter: "mock" } }, nodes, edges }, extra || {});
const 素 = mk([{ id: "in", type: "input" }, { id: "A", type: "llm", provider: "m", mock: { tag: "A" } }, { id: "out", type: "output" }], []);

// ① 入力ノードに書いた文言と「最初から入れておく文」が、入力画面に出る
await paste(mk([{ id: "in", type: "input" }, { id: "A", type: "llm", provider: "m", mock: { tag: "A" } }, { id: "out", type: "output" }],
  [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } }, { from: { node: "A", port: "out" }, to: { node: "out", port: "in" } }]));
await tap('.nd[data-id="in"]');
await p.fill('[data-f="label"]', '直したい文章を貼る');
await p.fill('[data-f="default"]', 'これはテスト文です');
await tap('#shClose');
R['① 入力欄の見出し'] = (await p.textContent('#ioIn label span')).replace(/\s+/g, ' ');
R['① 入力欄の中身'] = await p.inputValue('#ioIn [data-in="in"]');
ok.inputLabel = R['① 入力欄の見出し'].includes('直したい文章を貼る') && R['① 入力欄の中身'] === 'これはテスト文です';
const s1 = await spec();
ok.inputSaved = s1.nodes[0].label === '直したい文章を貼る' && s1.nodes[0].default === 'これはテスト文です';

// ② タップだけでループを組む（1本目=本体 / 2本目=抜けたあと / 戻りは自動で戻り線）
await paste(素);
await tap('#addNode'); await tap('[data-add="loop"]'); await tap('#shClose');
await tap('.nd[data-id="in"] .port.pout');  await tap('.nd[data-id="lp"] .port.pin');
await tap('.nd[data-id="lp"] .port.pout');  await tap('.nd[data-id="A"] .port.pin');
await tap('.nd[data-id="A"] .port.pout');   await tap('.nd[data-id="lp"] .port.pin');
R['② 戻り線を繋いだお知らせ'] = (await p.textContent('#hint')).replace(/\s+/g, ' ').slice(0, 40);
await tap('.nd[data-id="lp"] .port.pout');  await tap('.nd[data-id="out"] .port.pin');
R['② 抜けたあとのお知らせ'] = (await p.textContent('#hint')).replace(/\s+/g, ' ').slice(0, 40);
const s2 = await spec();
const e2 = s2.edges.map(e => `${e.from.node}->${e.to.node}${e.loop ? '(戻)' : ''}${e.loopRole === 'done' ? '(抜)' : ''}`);
R['② できた線'] = e2; R['② 検証'] = (await vErr()) || '（エラーなし）';
ok.loopWired = e2.join(' ') === 'in->lp lp->A A->lp(戻) lp->out(抜)' && R['② 検証'] === '（エラーなし）';
R['② 図に出ている回数'] = await p.textContent('.nd[data-id="lp"] .ndm');
ok.loopOnCanvas = R['② 図に出ている回数'] === '最大5回';

// ③ 抜ける条件を、式を書かずに作れる
await tap('.nd[data-id="lp"]');
await p.selectOption('[data-f="__ukind"]', 'len'); await p.waitForTimeout(200);
await p.selectOption('[data-f="__unode"]', 'A'); await p.waitForTimeout(150);
await p.fill('[data-f="__uval"]', '1'); await p.waitForTimeout(200);
R['③ できた条件'] = (await spec()).nodes.find(n => n.id === 'lp').loop;
ok.untilBuilt = R['③ できた条件'].until === 'A.meta.len >= 1' && R['③ できた条件'].max === 5;
await tap('#shClose');
await tap('#runTop');
R['③ 実行'] = await state();
R['③ 出力'] = (await p.textContent('#ioOut [data-out="out"]')).replace(/\s+/g, ' ').slice(0, 40);
ok.loopRun = R['③ 実行'].includes('success') && R['③ 実行'].includes('iterTotal=1') && R['③ 出力'].includes('A1');

// ④ 最大回数を空にすると止まらない。緊急停止で止められる
await tap('.nd[data-id="lp"]');
await p.selectOption('[data-f="__ukind"]', ''); await p.waitForTimeout(200);
await p.fill('[data-f="loop.max"]', ''); await p.locator('[data-f="loop.max"]').dispatchEvent('change'); await p.waitForTimeout(250);
R['④ 無限の注意'] = (await p.textContent('#sheetBody')).includes('無限ループ');
await tap('#shClose');
R['④ 図の表示'] = await p.textContent('.nd[data-id="lp"] .ndm');
R['④ 診断'] = await p.evaluate(() => reviewSpec(JSON.parse(document.querySelector('#spec').value)).filter(f => f.node === 'lp').map(f => f.level + ':' + f.message.slice(0, 20)));
ok.infinite = R['④ 図の表示'] === '上限なし' && R['④ 無限の注意'] && R['④ 診断'].some(t => /warn:止まらない/.test(t));
await tap('#runTop');
await p.waitForSelector('#estop.show', { timeout: 5000 });
ok.estopShown = await p.isVisible('#estop.show');
await tap('#estop');
R['④ 止めたあと'] = await state();
ok.estop = R['④ 止めたあと'].includes('cancelled') && Number(/iterTotal=(\d+)/.exec(R['④ 止めたあと'])[1]) >= 3;
ok.estopHidden = !(await p.isVisible('#estop.show'));

// ⑤ 出力ノードも「複数の入力が来たときの受け取り方」と「入力の順番」を決められる
await paste(mk([{ id: "in", type: "input", routing: { mode: "parallel", failurePolicy: "fail_fast" } },
  { id: "A", type: "llm", provider: "m", mock: { tag: "a" } }, { id: "B", type: "llm", provider: "m", mock: { tag: "b" } },
  { id: "out", type: "output" }],
  [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } }, { from: { node: "in", port: "out" }, to: { node: "B", port: "in" } },
   { from: { node: "A", port: "out" }, to: { node: "out", port: "in" } }, { from: { node: "B", port: "out" }, to: { node: "out", port: "in" } }]));
await tap('.nd[data-id="out"]');
R['⑤ 受け取り方の選択肢'] = await p.locator('[data-f="__merge"] option').allTextContents();
R['⑤ 入力の順番'] = await p.locator('.ordrow .nm').allTextContents();
ok.outMerge = R['⑤ 受け取り方の選択肢'].length === 5 && R['⑤ 入力の順番'].join() === 'A,B';
await p.selectOption('[data-f="__merge"]', 'json_array'); await p.waitForTimeout(250);   // シートは開いたまま出し直される
await p.locator('[data-mv="down"]').first().tap(); await p.waitForTimeout(250);
const s5 = await spec();
R['⑤ 入れ替えたあと'] = { 順番: await p.locator('.ordrow .nm').allTextContents(),
  位置: s5.edges.filter(e => e.to.node === 'out').map(e => `${e.from.node}:${e.position}`) };
ok.reorder = R['⑤ 入れ替えたあと'].順番.join() === 'B,A' && R['⑤ 入れ替えたあと'].位置.join() === 'A:1,B:0';
await tap('#shClose');
await tap('#runTop');
R['⑤ 実行'] = await state();
R['⑤ 出力'] = (await p.textContent('#ioOut [data-out="out"]')).replace(/\s+/g, ' ');
ok.outMergeRun = R['⑤ 実行'].includes('success') && R['⑤ 出力'].includes('["b1","a1"]');

// ⑥ 図を見れば、どのノードがどのモデルを使うか分かる
await paste(mk([{ id: "in", type: "input" },
  { id: "A", type: "llm", provider: "local" },
  { id: "B", type: "llm", provider: "local", model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" },
  { id: "out", type: "output" }],
  [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } }, { from: { node: "A", port: "out" }, to: { node: "B", port: "in" } },
   { from: { node: "B", port: "out" }, to: { node: "out", port: "in" } }],
  { providers: { local: { adapter: "webllm", model: "SmolLM2-360M-Instruct-q4f16_1-MLC" } } }));
R['⑥ 図のモデル表示'] = { A: await p.textContent('.nd[data-id="A"] .ndm'), B: await p.textContent('.nd[data-id="B"] .ndm'),
  Aの吹き出し: await p.getAttribute('.nd[data-id="A"]', 'title') };
ok.modelOnCanvas = R['⑥ 図のモデル表示'].A === 'SmolLM2-360M-q4f16_1' && R['⑥ 図のモデル表示'].B === 'Qwen2.5-0.5B-q4f16_1'
  && R['⑥ 図のモデル表示'].Aの吹き出し.includes('providerの既定');

// ⑦ 入力の例が毎回ちがう。押すと入り、「別の例にする」で入れ替わる
await paste(mk([{ id: "in", type: "input" }, { id: "A", type: "llm", provider: "m", mock: { tag: "A" } }, { id: "out", type: "output" }],
  [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } }, { from: { node: "A", port: "out" }, to: { node: "out", port: "in" } }]));
const chips = () => p.locator('#ioSamples [data-smp]').allTextContents();
const c1 = await chips();
const v1 = await p.inputValue('#ioIn [data-in="in"]');
R['⑦ 例'] = c1;
ok.samples = c1.length === 3 && c1.every(t => t.length > 4) && v1 === c1[0];
await p.locator('#ioSamples [data-smp]').nth(2).tap(); await p.waitForTimeout(150);
R['⑦ 押した例が入る'] = await p.inputValue('#ioIn [data-in="in"]');
ok.sampleTap = R['⑦ 押した例が入る'] === c1[2];
await tap('#ioReroll');
const c2 = await chips();
R['⑦ 別の例'] = c2;
ok.reroll = c2.join() !== c1.join() && c2.length === 3;
// 書いた文は消さない（押した例＝自分で入れた文は残る）
ok.rerollKeeps = (await p.inputValue('#ioIn [data-in="in"]')) === c1[2];

// ⑧ ノードの大きさを手で変えられる
const box = async sel => { await p.locator(sel).first().scrollIntoViewIfNeeded(); return await p.locator(sel).first().boundingBox(); };
const dragBy = async (sel, dx, dy) => { const r = await box(sel); const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await p.mouse.move(x + dx, y + dy, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(150); };
const b0 = await box('.nd[data-id="A"]');
await dragBy('.nd[data-id="A"] .ndrz', 60, 40);
const b1 = await box('.nd[data-id="A"]');
R['⑧ 大きさ'] = { before: [Math.round(b0.width), Math.round(b0.height)], after: [Math.round(b1.width), Math.round(b1.height)],
  spec: (await spec()).metadata.sizes };
ok.resize = b1.width > b0.width + 30 && b1.height > b0.height + 10 && !!R['⑧ 大きさ'].spec.A;
// 出口の丸も大きさに付いてくる（線がずれない）
const pOut = await box('.nd[data-id="A"] .port.pout');
ok.portFollows = Math.abs((pOut.y + pOut.height / 2) - (b1.y + b1.height)) < 3;
await tap('.nd[data-id="A"]');
await tap('#nSz');
R['⑧ 戻した'] = { w: Math.round((await box('.nd[data-id="A"]')).width), もどり先: Math.round(b0.width),
  sizes: (await spec()).metadata.sizes === undefined ? '（書かれていない）' : (await spec()).metadata.sizes };
ok.resizeReset = R['⑧ 戻した'].w === Math.round(b0.width) && R['⑧ 戻した'].sizes === '（書かれていない）';

// ⑨ ループノードだけ入口と出口が上下逆（戻ってくる線が上から入る）
await paste(mk(
  [{ id: "in", type: "input" }, { id: "lp", type: "loop", loop: { id: "lp", max: 2 } },
   { id: "A", type: "llm", provider: "m", mock: { tag: "A" } }, { id: "out", type: "output" }],
  [{ from: { node: "in", port: "out" }, to: { node: "lp", port: "in" } },
   { from: { node: "lp", port: "out" }, to: { node: "A", port: "in" } },
   { from: { node: "lp", port: "out" }, to: { node: "out", port: "in" }, loopRole: "done" },
   { from: { node: "A", port: "out" }, to: { node: "lp", port: "in" }, loop: { id: "lp" } }]));
const geo = async id => { const n = await box(`.nd[data-id="${id}"]`), i = await box(`.nd[data-id="${id}"] .port.pin`), o = await box(`.nd[data-id="${id}"] .port.pout`);
  return { in: Math.round(i.y + i.height / 2 - n.y), out: Math.round(o.y + o.height / 2 - n.y), h: Math.round(n.height) }; };
R['⑨ ポートの位置'] = { ループ: await geo('lp'), ふつう: await geo('A') };
ok.loopPortsFlipped = R['⑨ ポートの位置'].ループ.in > R['⑨ ポートの位置'].ループ.out
  && R['⑨ ポートの位置'].ふつう.in < R['⑨ ポートの位置'].ふつう.out;

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
