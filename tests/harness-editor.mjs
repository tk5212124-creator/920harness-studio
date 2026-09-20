// ノードエディタを iPhone 相当のタッチ端末として操作する。
// タップは touchscreen（実タッチ由来の pointer event）、ドラッグは pointer event 列で行う。
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + new URL('../harness.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });

const R = {}, ok = {};
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));
const counts = async () => { const s = await spec(); return { nodes: s.nodes.length, edges: (s.edges || []).length }; };
const box = async sel => (await p.locator(sel).first().boundingBox());
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };   // 実タッチ（自動スクロール込み）
async function dragBy(sel, dx, dy) {           // pointer列で掴んで動かす
  await p.locator(sel).first().scrollIntoViewIfNeeded();
  const r = await box(sel); const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await p.mouse.move(x, y); await p.mouse.down();
  await p.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await p.mouse.move(x + dx, y + dy, { steps: 4 });
  await p.mouse.up(); await p.waitForTimeout(120);
}

// ① 最初から図が出ている。既定は「内蔵LLM直列」（mockではない）
const spec0 = await spec();
R['① 初期表示'] = { name: spec0.metadata.name, nodes: await p.locator('.nd').count(),
  edges: await p.locator('#edges path.hit').count(),
  provider: (spec0.providers.local || {}).adapter, model: (spec0.providers.local || {}).model,
  mockを使っていない: spec0.nodes.every(n => !n.mock) };
ok.init = R['① 初期表示'].provider === 'webllm' && R['① 初期表示'].mockを使っていない
  && R['① 初期表示'].nodes === 3 && R['① 初期表示'].edges === 2;

// 以降はノード操作の確認なので、ノード数の多い mock の例に切り替える
await tap('#exSeg2 button[data-ex="ex1"]');
R['①-2 切り替え後'] = { nodes: await p.locator('.nd').count(), edges: await p.locator('#edges path.hit').count() };
ok.init2 = R['①-2 切り替え後'].nodes === 4 && R['①-2 切り替え後'].edges === 4;

// ② ノードを足す（＋ノード → LLM）
const before = await counts();
await tap('#addNode');
await p.waitForSelector('#sheet.show');
await tap('[data-add="llm"]');
const after = await counts();
R['② ノード追加'] = { before: before.nodes, after: after.nodes, sheetOpen: await p.isVisible('#sheet.show') };
ok.add = after.nodes === before.nodes + 1;
await tap('#shClose');

// ③ ドラッグで動かす → 座標が spec に入る
const id = (await spec()).nodes[4].id;
const p0 = (await spec()).metadata.layout[id];
await dragBy(`.nd[data-id="${id}"]`, 110, 40);
const p1 = (await spec()).metadata.layout[id];
R['③ ドラッグ移動'] = { id, before: p0, after: p1 };
ok.drag = p1.x !== p0.x && p1.y !== p0.y;

// ④ タップでつなぐ: draft の ○ → 新ノードの ●
const e0 = (await counts()).edges;
await tap('.nd[data-id="draft"] .port.pout');
R['④-1 つなぎ元を選んだ表示'] = (await p.textContent('#hint')).trim().slice(0, 40);
await tap(`.nd[data-id="${id}"] .port.pin`);
const e1 = (await counts()).edges;
const lastEdge = (await spec()).edges.slice(-1)[0];
R['④ つないだ辺'] = { before: e0, after: e1, edge: lastEdge };
ok.connect = e1 === e0 + 1 && lastEdge.from.node === 'draft' && lastEdge.to.node === id;

// ⑤ 2本目の出口 → 「勝手に決めない」ので分岐のしかたを聞かれる
R['⑤ 分岐の確認シート'] = (await p.textContent('#sheetBody')).replace(/\s+/g, ' ').slice(0, 60);
ok.askRouting = await p.isVisible('#rPar');
await tap('#rPar');
R['⑤ 選んだ結果 draft.routing'] = (await spec()).nodes.find(n => n.id === 'draft').routing;
ok.routing = JSON.stringify(R['⑤ 選んだ結果 draft.routing']) === '{"mode":"parallel","failurePolicy":"fail_fast"}';

// ⑥ 辺をタップ → 種類を loop に変える → 消す
await tap('#edges circle.midhit >> nth=0');
R['⑥ 辺シートの見出し'] = (await p.textContent('#sheetBody')).replace(/\s+/g, ' ').slice(0, 30);
await p.selectOption('[data-f="__kind"]', 'loop'); await p.waitForTimeout(150);
const eLoop = (await spec()).edges[0];
R['⑥ loopにした辺'] = eLoop;
ok.edgeLoop = !!eLoop.loop && eLoop.loop.max === 3;
await p.selectOption('[data-f="__kind"]', 'plain'); await p.waitForTimeout(150);
const eBefore = (await counts()).edges;
await tap('#eDel');
R['⑥ 辺の削除'] = { before: eBefore, after: (await counts()).edges };
ok.edgeDel = (await counts()).edges === eBefore - 1;

// ⑦ ノード名を変えると辺の参照も追う
await tap('.nd[data-id="critic"]');
await p.fill('[data-f="id"]', 'judge');
await p.locator('[data-f="id"]').press('Tab'); await p.waitForTimeout(200);
const s7 = await spec();
R['⑦ 改名'] = { node: s7.nodes.some(n => n.id === 'judge'), 参照: s7.edges.filter(e => e.from.node === 'judge' || e.to.node === 'judge').length,
  残骸: s7.edges.filter(e => e.from.node === 'critic' || e.to.node === 'critic').length, layout: !!s7.metadata.layout.judge };
ok.rename = R['⑦ 改名'].node && R['⑦ 改名'].残骸 === 0 && R['⑦ 改名'].layout;
await tap('#shClose');

// ⑧ mockの例を読み直して実行 → ノードに実行状態の色が付く
await tap('#exSeg2 button[data-ex="ex1"]');
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 20000 });
R['⑧ 実行'] = { state: (await p.textContent('#stateline')).slice(0, 40),
  success色: await p.locator('.nd.st-success').count(),
  出力プレビュー: await p.$$eval('.nd .ndp', e => e.map(x => x.textContent).filter(Boolean).slice(0, 2)) };
ok.run = R['⑧ 実行'].state.startsWith('state: success') && R['⑧ 実行'].success色 >= 3;

// ⑨ JSONタブと往復（正本は spec）
await tap('#viewSeg button[data-v="json"]');
R['⑨ JSONタブ'] = { textarea見える: await p.isVisible('#spec'), canvas隠れる: !(await p.isVisible('#cv')) };
ok.tabs = R['⑨ JSONタブ'].textarea見える && R['⑨ JSONタブ'].canvas隠れる;
await tap('#viewSeg button[data-v="editor"]');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
