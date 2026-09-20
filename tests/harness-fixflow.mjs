// 実機で詰まった3つを、タッチ端末として確かめる。
//  ① 実行が失敗したときに、理由が読める文で出る（[object Object] を出さない）
//  ② 出ているエラーはその場で直せる（schema を付ける / 流し方を決める）
//  ③ Join のまとめ方と追加文言、線の形（中点ドラッグ）
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
const paste = async obj => { await tap('#btnImport'); await p.fill('#imText', JSON.stringify(obj)); await tap('#imGo'); await tap('#imApply'); };
const vErr = async () => (await p.textContent('#vErr')).replace(/\s+/g, ' ');

// 実機の構成: critic が文章を返すのに、条件が critic.out.score を見ている
const 実機 = {
  metadata: { name: "改稿ループ", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" },
          { id: "draft", type: "llm", provider: "m", mock: { echoInput: true } },
          { id: "critic", type: "llm", provider: "m", mock: { text: "だいたい良いです" }, routing: { mode: "first_match", onNoMatch: "error" } },
          { id: "result", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "draft", port: "in" } },
          { from: { node: "draft", port: "out" }, to: { node: "critic", port: "in" } },
          { from: { node: "critic", port: "out" }, to: { node: "draft", port: "in" }, priority: 0, loop: { id: "revise", max: 3, until: "critic.out.score>=8" } },
          { from: { node: "critic", port: "out" }, to: { node: "result", port: "in" }, priority: 1, else: true }] };

// ① 取り込んだ時点で「schema が無い」と言われ、その場で付けられる
await paste(実機);
R['① 取り込み直後'] = (await vErr()).slice(0, 90);
ok.schemaCaught = R['① 取り込み直後'].includes('schema が無い') && R['① 取り込み直後'].includes('critic');
const fix = p.locator('#vErr button');
R['① 出た直しボタン'] = await fix.allTextContents();
ok.fixOffered = R['① 出た直しボタン'].some(t => t.includes('critic に schema'));
await fix.filter({ hasText: 'schema' }).first().tap(); await p.waitForTimeout(200);
const s1 = await spec();
R['① 付いた schema'] = { schema: s1.nodes.find(n => n.id === 'critic').schema,
  返し方の指定: (s1.nodes.find(n => n.id === 'critic').prompt || {}).suffix, 検証: (await vErr()).trim() || '（エラーなし）' };
ok.schemaFixed = R['① 付いた schema'].schema.required.join() === 'score'
  && String(R['① 付いた schema'].返し方の指定).includes('score') && R['① 付いた schema'].検証 === '（エラーなし）';

// ② schema があっても文章で返ってきたら、理由が読める文で出る（[object Object] にしない）
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['② 失敗の説明'] = (await p.textContent('#ioStatus')).replace(/\s+/g, ' ').slice(0, 110);
ok.readableErr = !R['② 失敗の説明'].includes('[object Object]') && R['② 失敗の説明'].includes('critic');

// ②-2 JSONで返ってきても項目が足りないとき、何が無かったかを言う（[object Object] にしない）
const 項目ちがい = JSON.parse(JSON.stringify(実機));
const c2 = 項目ちがい.nodes.find(n => n.id === 'critic');
c2.mock = { fixed: { note: "よい" } }; c2.schema = { type: "object", properties: { score: { type: "integer" } } };
R['②-2 実行した結果'] = await p.evaluate(async sp => {
  const r = await fullRun(sp, { in: "Q" });
  return { status: r.status, err: r.errors[0], 検証: validate(sp) };
}, 項目ちがい);
ok.exprErr = R['②-2 実行した結果'].検証.length === 0 && R['②-2 実行した結果'].status === 'failed'
  && R['②-2 実行した結果'].err.kind === 'REFERENCE_ERROR'
  && /あるのは: note/.test(R['②-2 実行した結果'].err.message)
  && R['②-2 実行した結果'].err.message.includes('critic.out.score>=8')
  && !R['②-2 実行した結果'].err.message.includes('[object Object]');

// ②-3 schema はあっても型が緩いと "…" のような文字列が返る。これも実行前に止めて直せる
const 型が緩い = JSON.parse(JSON.stringify(実機));
const c3 = 型が緩い.nodes.find(n => n.id === 'critic');
c3.schema = { type: "object", required: ["score"], properties: { score: {} } };   // 型が無い
c3.mock = { fixed: { score: "..." } };                                            // 実機で返ってきた値
await paste(型が緩い);
R['②-3 取り込み直後'] = (await vErr()).slice(0, 120);
ok.looseCaught = R['②-3 取り込み直後'].includes('数と比べているのに');
await p.locator('#vErr button').filter({ hasText: 'schema' }).first().tap(); await p.waitForTimeout(250);
const s23 = await spec();
R['②-3 直した後'] = { 型: s23.nodes.find(n => n.id === 'critic').schema.properties.score,
  例: (s23.nodes.find(n => n.id === 'critic').prompt || {}).suffix, 検証: (await vErr()).trim() || '（エラーなし）' };
ok.looseFixed = R['②-3 直した後'].型.type === 'integer' && R['②-3 直した後'].検証 === '（エラーなし）'
  && /例: \{"score": 7\}/.test(R['②-3 直した後'].例);

// ③ 出口が2本以上あるのに流し方が無い → その場で決められる
await paste({ metadata: { name: "分岐", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "A", type: "llm", provider: "m", mock: { tag: "A" } },
          { id: "B", type: "llm", provider: "m", mock: { tag: "B" } }, { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } },
          { from: { node: "in", port: "out" }, to: { node: "B", port: "in" } },
          { from: { node: "A", port: "out" }, to: { node: "out", port: "in" } }] });
R['③ 取り込み直後'] = (await vErr()).slice(0, 60);
const rb = p.locator('#vErr button').filter({ hasText: '流し方' });
ok.routeFixOffered = (await rb.count()) === 1;
await rb.first().tap(); await p.waitForTimeout(150);
await tap('#rPar');
R['③ 決めた後'] = { routing: (await spec()).nodes.find(n => n.id === 'in').routing, 検証: (await vErr()).trim() || '（エラーなし）' };
ok.routeFixed = R['③ 決めた後'].routing.mode === 'parallel' && R['③ 決めた後'].検証 === '（エラーなし）';

// ④ Join: まとめ方を選び、追加文言を入れて、実際にその形で下流に届く
await paste({ metadata: { name: "Join", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input", routing: { mode: "parallel", failurePolicy: "fail_fast" } },
          { id: "A", type: "llm", provider: "m", mock: { tag: "案A" } }, { id: "B", type: "llm", provider: "m", mock: { tag: "案B" } },
          { id: "jn", type: "join", op: "json_array", inputs: { items: { type: "any", cardinality: "many" } } },
          { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } },
          { from: { node: "in", port: "out" }, to: { node: "B", port: "in" } },
          { from: { node: "A", port: "out" }, to: { node: "jn", port: "items" }, position: 0 },
          { from: { node: "B", port: "out" }, to: { node: "jn", port: "items" }, position: 1 },
          { from: { node: "jn", port: "out" }, to: { node: "out", port: "in" } }] });
await tap('.nd[data-id="jn"]');
R['④ まとめ方の選択肢'] = await p.locator('[data-f="op"] option').allTextContents();
ok.joinOps = ['文章のまま', 'Markdown', 'CSV', 'JSON'].every(t => R['④ まとめ方の選択肢'].some(x => x.includes(t)));
await p.selectOption('[data-f="op"]', 'markdown'); await p.waitForTimeout(250);
await tap('#jnAuto');
await p.fill('[data-f="prefix"]', '以下は2つの案です。');
await p.fill('[data-f="suffix"]', 'どちらが良いか選んでください。');
await p.waitForTimeout(200);
const s4 = await spec();
R['④ Joinの中身'] = s4.nodes.find(n => n.id === 'jn');
ok.joinEdit = R['④ Joinの中身'].op === 'markdown' && R['④ Joinの中身'].labels.join() === 'A,B'
  && R['④ Joinの中身'].prefix === '以下は2つの案です。';
await tap('#shClose');
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['④ 出力'] = (await p.textContent('#ioOut [data-out="out"]')).replace(/\s+/g, ' ').slice(0, 90);
ok.joinRun = R['④ 出力'].includes('以下は2つの案です') && R['④ 出力'].includes('## A') && R['④ 出力'].includes('選んでください');

// ⑤ 線の途中の丸をドラッグすると形が変わり、辺シートから戻せる
await p.locator('#edges circle.midhit').first().scrollIntoViewIfNeeded();
const before = await p.locator('#edges circle.midhit').first().boundingBox();
const cx = before.x + before.width / 2, cy = before.y + before.height / 2;
await p.mouse.move(cx, cy);
await p.mouse.down();
await p.mouse.move(cx + 45, cy, { steps: 4 });
await p.mouse.move(cx + 95, cy, { steps: 4 });
await p.mouse.up(); await p.waitForTimeout(200);
const s5 = await spec();
R['⑤ 曲げた線'] = s5.metadata.bends;
ok.bend = !!s5.metadata.bends && Object.keys(s5.metadata.bends).length === 1;
await tap('#edges circle.midhit >> nth=0');
ok.straightOffered = await p.isVisible('#eStraight');
await tap('#eStraight');
R['⑤ 戻した後'] = (await spec()).metadata.bends || '（無し）';
ok.straight = R['⑤ 戻した後'] === '（無し）';
await tap('#shClose');

// ⑥ Provider の選択肢が分かる言葉になっている（local と 内蔵LLM が二重に出ない）
await tap('.nd[data-id="A"]');
await p.selectOption('[data-f="__prov"]', '__webllm'); await p.waitForTimeout(250);
R['⑥ Providerの選択肢'] = await p.locator('[data-f="__prov"] option').allTextContents();
ok.provOpts = R['⑥ Providerの選択肢'].some(t => /内蔵LLM/.test(t) && /^local/.test(t))
  && !R['⑥ Providerの選択肢'].some(t => t.startsWith('＋ 内蔵LLM'));
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
