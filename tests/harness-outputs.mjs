// 出力の項目（出力1・出力2…）、数値の範囲、出口を分ける、受け取る側の項目えらびを
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
const state = async () => { await p.waitForFunction(() => /^state: (success|failed|cancelled|paused)/.test(document.querySelector('#stateline').textContent), null, { timeout: 20000 });
  return (await p.textContent('#stateline')).slice(0, 80); };
const nodeOf = async id => (await spec()).nodes.find(n => n.id === id);

const base = {
  metadata: { name: "出力", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" },
          { id: "A", type: "llm", provider: "m", mock: { fixed: { score: 7, items: ["い", "ろ", "は"] } } },
          { id: "B", type: "llm", provider: "m", mock: { echoInput: true } },
          { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } },
          { from: { node: "A", port: "out" }, to: { node: "B", port: "in" } },
          { from: { node: "B", port: "out" }, to: { node: "out", port: "in" } }] };

// ① 出力の形 →「項目を決める」で 出力1 が出る。キー名と種類と範囲を決められる
await paste(base);
await tap('.nd[data-id="A"]');
R['① 形の選択肢'] = await p.locator('[data-f="__shape"] option').allTextContents();
ok.shapeHasFields = R['① 形の選択肢'].some(t => t.includes('項目を決める'));
await p.selectOption('[data-f="__shape"]', 'fields'); await p.waitForTimeout(250);
R['① 最初の項目'] = (await nodeOf('A')).schema;
ok.firstField = JSON.stringify(R['① 最初の項目']) === '{"type":"object","required":["out1"],"properties":{"out1":{"type":"string"}}}';
await p.fill('[data-of="key"][data-i="0"]', 'score'); await p.waitForTimeout(200);
await p.selectOption('[data-of="type"][data-i="0"]', 'integer'); await p.waitForTimeout(250);
await p.fill('[data-of="min"][data-i="0"]', '0'); await p.waitForTimeout(150);
await p.fill('[data-of="max"][data-i="0"]', '10'); await p.waitForTimeout(250);
const a1 = await nodeOf('A');
R['① 数値の項目'] = { schema: a1.schema, 指示: (a1.prompt || {}).suffix };
ok.numberField = JSON.stringify(a1.schema.properties.score) === '{"type":"integer","minimum":0,"maximum":10}'
  && /例: \{"score":5\}/.test(R['① 数値の項目'].指示);   // 範囲があるときは真ん中を例にする（下限を書くとモデルが写す）

// ② 出力を足してリストにする
await tap('#ofAdd');
await p.fill('[data-of="key"][data-i="1"]', 'items'); await p.waitForTimeout(200);
await p.selectOption('[data-of="type"][data-i="1"]', 'list'); await p.waitForTimeout(250);
const a2 = await nodeOf('A');
R['② 2つの項目'] = { keys: a2.schema.required, items: a2.schema.properties.items, 指示: (a2.prompt || {}).suffix };
ok.twoFields = a2.schema.required.join() === 'score,items'
  && a2.schema.properties.items.items.type === 'string'
  && /"items":\["ひとつめ","ふたつめ"\]/.test(R['② 2つの項目'].指示);

// ③ 「出口を分けて、項目ごとに渡す」にすると、項目ごとの出口が図に増える
await p.selectOption('[data-f="__split"]', 'split'); await p.waitForTimeout(300);
const a3 = await nodeOf('A');
R['③ 出口'] = { ports: a3.ports, 図の出口: await p.locator('.nd[data-id="A"] .port.pout').count(),
  ラベル: await p.locator('.nd[data-id="A"] .plab').allTextContents(),
  つなぎ替えた線: (await spec()).edges.filter(e => e.from.node === 'A').map(e => e.from.port),
  選択肢: await p.locator('[data-pf="key"][data-i="0"] option').allTextContents() };
ok.split = a3.ports.length === 2 && a3.ports[0].pick === 'score' && a3.ports[1].pick === 'items'
  && R['③ 出口'].図の出口 === 2 && R['③ 出口'].ラベル.join() === 'score,items'
  && R['③ 出口'].つなぎ替えた線.join() === 'p1' && (await vErr()) === ''
  && R['③ 出口'].選択肢.join() === '値ぜんぶ,score,items'
  && (await p.locator('[data-pf="take"]').count()) === 0;   // リストの何番目、は選ばせない

// ④ 2つ目の出口から線を引く（出口ごとにちがう値が流れる）
await tap('#shClose');
await tap('#addNode'); await tap('[data-add="llm"]'); await tap('#shClose');
const newId = (await spec()).nodes.slice(-1)[0].id;
await p.evaluate(id => { const sp = JSON.parse(document.querySelector('#spec').value);
  const n = sp.nodes.find(x => x.id === id); n.provider = 'm'; n.mock = { echoInput: true }; delete n.prompt;
  document.querySelector('#spec').value = JSON.stringify(sp, null, 1);
  document.querySelector('#spec').dispatchEvent(new Event('input')); }, newId);
await p.waitForTimeout(250);
await tap(`.nd[data-id="A"] .port.pout[data-port="p2"]`);
R['④ つなぎ元の表示'] = (await p.textContent('#hint')).replace(/\s+/g, ' ').slice(0, 50);
await tap(`.nd[data-id="${newId}"] .port.pin`);
const e4 = (await spec()).edges.filter(e => e.from.node === 'A');
R['④ できた線'] = e4.map(e => `${e.from.port}→${e.to.node}`);
ok.portEdge = R['④ つなぎ元の表示'].includes('items') && e4.some(e => e.from.port === 'p2' && e.to.node === newId);

// ⑤ 実行すると、出口ごとにちがう値が届く
await tap('#runTop');
R['⑤ 実行'] = await state();
R['⑤ 届いた値'] = await p.evaluate(id => {
  const g = k => window.__dbg.nodeOut(k);
  return { B: g('B') && g('B').value.received, 新: g(id) && g(id).value.received };
}, newId);
ok.splitRun = R['⑤ 実行'].includes('success')
  && JSON.stringify(R['⑤ 届いた値'].B) === '{"type":"json","value":7}'
  && JSON.stringify(R['⑤ 届いた値'].新) === '{"type":"json","value":["い","ろ","は"]}';

// ⑥ 受け取る側でも「どの項目を使うか」を選べる
await paste(Object.assign({}, base, {
  nodes: [{ id: "in", type: "input" },
    { id: "A", type: "llm", provider: "m", mock: { fixed: { score: 7, note: "めも" } },
      schema: { type: "object", required: ["score", "note"], properties: { score: { type: "integer" }, note: { type: "string" } } } },
    { id: "B", type: "llm", provider: "m", mock: { echoInput: true } },
    { id: "out", type: "output" }] }));
await tap('.nd[data-id="B"]');
R['⑥ 項目の選択肢'] = await p.locator('[data-ip] option').allTextContents();
ok.pickUI = R['⑥ 項目の選択肢'].join().includes('note だけ');
await p.selectOption('[data-ip]', 'note'); await p.waitForTimeout(250);
R['⑥ 線に入った'] = (await spec()).edges.find(e => e.to.node === 'B').pick;
await tap('#shClose');
await tap('#runTop');
R['⑥ 実行'] = await state();
R['⑥ 出力'] = (await p.textContent('#ioOut [data-out="out"]')).replace(/\s+/g, ' ').slice(0, 60);
ok.pickRun = R['⑥ 線に入った'] === 'note' && R['⑥ 実行'].includes('success') && R['⑥ 出力'].includes('めも');

// ⑦ HSL に書き出して読み直しても、出口と取り出し方が戻る
R['⑦ HSL往復'] = await p.evaluate(() => {
  const sp = { metadata: { name: "port", version: "1" }, nodes: [
    { id: "A", type: "llm", mock: { text: "x" }, ports: [{ id: "p1", label: "1つ目", pick: "items.0" }] },
    { id: "B", type: "llm", mock: { text: "y" } }],
    edges: [{ from: { node: "A", port: "p1" }, to: { node: "B", port: "in" }, pick: "score" }] };
  return { hsl: specToHSL(sp).split('\n').filter(l => l.includes('->') || l.includes('ports')), diff: hslRoundTripDiff(sp) };
});
ok.hslPorts = R['⑦ HSL往復'].diff === null && R['⑦ HSL往復'].hsl.some(l => /from_port "p1"/.test(l) && /pick "score"/.test(l));

// ⑧ 途中で切れたとき／形に合わないときの扱いを、ノードごとに選べる
await paste(base);
await tap('.nd[data-id="A"]');
R['⑧ 切れたときの選択肢'] = await p.locator('[data-f="onTruncate"] option').allTextContents();
R['⑧ 形が違うときの選択肢'] = await p.locator('[data-f="onBadOutput"] option').allTextContents();
await p.selectOption('[data-f="onTruncate"]', 'retry'); await p.waitForTimeout(200);
await p.selectOption('[data-f="onBadOutput"]', 'retry'); await p.waitForTimeout(250);
const a8 = await nodeOf('A');
R['⑧ 入った値'] = { onTruncate: a8.onTruncate, onBadOutput: a8.onBadOutput, 検証: await vErr() || '（エラーなし）' };
R['⑧ 会話の説明'] = (await p.textContent('#sheetBody')).includes('毎回まっさらな会話');
ok.truncUI = R['⑧ 切れたときの選択肢'].length === 3 && R['⑧ 形が違うときの選択肢'].length === 2
  && a8.onTruncate === 'retry' && a8.onBadOutput === 'retry'
  && R['⑧ 入った値'].検証 === '（エラーなし）' && R['⑧ 会話の説明'];
await p.selectOption('[data-f="onTruncate"]', ''); await p.waitForTimeout(250);
ok.truncDefault = (await nodeOf('A')).onTruncate === undefined;
await tap('#shClose');

// ⑨ 出力の形「選択肢ごとの正しさ（％）だけ」と「先に考えを書かせる」
await tap('.nd[data-id="A"]');
await p.selectOption('[data-f="__shape"]', 'percent'); await p.waitForTimeout(300);
const a9 = await nodeOf('A');
R['⑨ ％の最初の形'] = a9.schema;
ok.percentInit = JSON.stringify(a9.schema) ===
  '{"type":"object","required":["候補A","候補B"],"properties":{"候補A":{"type":"integer","minimum":0,"maximum":100},"候補B":{"type":"integer","minimum":0,"maximum":100}}}';
await p.fill('[data-of="key"][data-i="0"]', '支持できる'); await p.waitForTimeout(250);
await tap('#ofAdd');                                   // 足した分も 0〜100 の整数になる
const a9b = await nodeOf('A');
R['⑨ 足したあと'] = { keys: Object.keys(a9b.schema.properties), 足した分: a9b.schema.properties['候補3'], 指示: (a9b.prompt || {}).suffix };
ok.percentAdd = R['⑨ 足したあと'].keys.join() === '支持できる,候補B,候補3'
  && JSON.stringify(R['⑨ 足したあと'].足した分) === '{"type":"integer","minimum":0,"maximum":100}'
  && /"支持できる":50/.test(R['⑨ 足したあと'].指示);
await p.locator('#ofThink').first().dispatchEvent('click'); await p.waitForTimeout(300);
const a9c = await nodeOf('A');
R['⑨ 考えを足す'] = { keys: Object.keys(a9c.schema.properties), 形: await p.inputValue('[data-f="__shape"]') };
ok.thinkOn = R['⑨ 考えを足す'].keys[0] === 'thinking'     // 先頭でないと答えに効かない
  && a9c.schema.properties.thinking.type === 'string'
  && R['⑨ 考えを足す'].keys.length === 4 && R['⑨ 考えを足す'].形 === 'percent';
await p.locator('#ofThink').first().dispatchEvent('click'); await p.waitForTimeout(300);
ok.thinkOff = (await nodeOf('A')).schema.properties.thinking === undefined;
await p.selectOption('[data-f="__shape"]', 'think'); await p.waitForTimeout(300);
const a9d = await nodeOf('A');
R['⑨ 考えてから答える'] = { keys: Object.keys(a9d.schema.properties), 検証: await vErr() || '（エラーなし）' };
ok.thinkPreset = R['⑨ 考えてから答える'].keys.join() === 'thinking,answer'
  && R['⑨ 考えてから答える'].検証 === '（エラーなし）';
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
