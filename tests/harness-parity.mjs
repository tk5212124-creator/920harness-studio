// 「JSONで指定できることは画面でも指定できる／画面で指定できることはJSONで指定できる」を機械で確かめる。
// JSON のキーごとに、そのキーを持つノード／つながりを貼って編集シートを開き、
// 画面に対応する欄が出るかを見る。欄が無いキーが1つでもあれば FAIL。
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + new URL('../harness.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(140); };
const paste = async obj => { await p.evaluate(o => { const t = document.querySelector('#spec'); t.value = JSON.stringify(o, null, 1); t.dispatchEvent(new Event('input')); }, obj); await p.waitForTimeout(260); };
const sheetHTML = () => p.textContent('#sheetBody');
const openNode = async id => { await p.evaluate(i => window.__ui.openNodeSheet(i), id); await p.waitForTimeout(200); };
const openEdge = async i => { await p.evaluate(k => window.__ui.openEdgeSheet(k), i); await p.waitForTimeout(200); };
// そのシートに「このキーを触れる部品」があるか
// data-f / data-json / data-mj は「どのキーを触るか」が値に入っている。
// 並び（rules・asserts・keys・vars…）の編集は行ごとなので、属性の名前があれば「触れる」と見る。
const hasCtl = async names => p.evaluate(ns => {
  const got = new Set();
  for (const a of ['f', 'json', 'mj', 'pc', 'pt']) {
    document.querySelectorAll(`#sheetBody [data-${a}]`).forEach(el => got.add(el.dataset[a]));
  }
  for (const [attr, key] of [['data-mr-op', 'rules'], ['data-mr-port', 'rules'],
    ['data-as-expr', 'asserts'], ['data-as-name', 'asserts'], ['data-as-sev', 'asserts'],
    ['data-jk', 'keys'], ['data-jp', 'keys'], ['data-vk', 'vars'], ['data-vv', 'vars'],
    ['data-cf', 'ports'], ['data-ip', 'pick']]) {
    if (document.querySelector(`#sheetBody [${attr}]`)) got.add(key);
  }
  return ns.map(n => [n, got.has(n)]);
}, names);

const SC = { type: 'object', required: ['score'], properties: { score: { type: 'integer' } } };
const base = (node, extraNodes = [], extraEdges = []) => ({
  metadata: { name: 'parity', version: '1' }, providers: { m: { adapter: 'mock' } },
  nodes: [{ id: 'in', type: 'input' }, node, { id: 'out', type: 'output' }, ...extraNodes],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' } },
    { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' } }, ...extraEdges] });

// ── ノードのキー: 「このキーを書いた JSON」を貼って、そのノードの編集に欄が出るか
const NODE_CASES = [
  ['label / default（入力）', { id: 'X', type: 'input', label: 'ラベル', default: 'はじめ' }, ['label', 'default']],
  ['provider / model / mock', { id: 'X', type: 'llm', provider: 'm', model: 'q', mock: { tag: '案' } }, ['__prov', 'model', '__mk', '__mv']],
  ['prompt 一式', { id: 'X', type: 'llm', mock: { text: 'a' }, prompt: { system: 's', prefix: 'p', suffix: 'f', template: { syntax: 'mustache', mode: 'interpolation_only', value: '{{{in}}}' } } },
    ['prompt.system', 'prompt.prefix', 'prompt.suffix', 'prompt.template.value']],
  ['generation（topP も）', { id: 'X', type: 'llm', mock: { text: 'a' }, generation: { maxTokens: 100, temperature: 0.2, topP: 0.9 } },
    ['generation.maxTokens', 'generation.temperature', 'generation.topP']],
  ['schema', { id: 'X', type: 'llm', mock: { text: 'a' }, schema: SC }, ['__shape']],
  ['onTruncate / onBadOutput / onError / onContextOverflow', { id: 'X', type: 'llm', mock: { text: 'a' }, onTruncate: 'retry', onBadOutput: 'retry', onError: 'value', onErrorValue: 1, onContextOverflow: 'send' },
    ['onTruncate', 'onBadOutput', '__onError', 'onErrorValue', 'onContextOverflow']],
  ['inputs（受け取る数・型）', { id: 'X', type: 'llm', mock: { text: 'a' }, inputs: { in: { type: 'json', cardinality: 'many' } } }, ['in']],
  ['start / merge（markdown）', { id: 'X', type: 'llm', mock: { text: 'a' }, start: { mode: 'any' }, merge: { op: 'markdown', labels: ['a'] } },
    ['__start', '__merge', '__mlabels']],
  // merge.sep は concat のときだけ読まれる（mergeInputs の default 枝）
  ['merge の sep（concat）', { id: 'X', type: 'llm', mock: { text: 'a' }, merge: { op: 'concat', sep: ',' } }, ['__merge', '__msep']],
  ['join 一式（keys も）', { id: 'X', type: 'join', op: 'json_object', labels: ['a'], keys: [{ key: 'k', position: 0 }], prefix: 'p', suffix: 'f', inputs: { items: { type: 'any', cardinality: 'many' } } },
    ['op', '__labels', 'keys']],
  ['join concat の sep', { id: 'X', type: 'join', op: 'concat', sep: '|', inputs: { items: { type: 'any', cardinality: 'many' } } }, ['sep']],
  ['join template', { id: 'X', type: 'join', op: 'template', template: { syntax: 'mustache', mode: 'interpolation_only', value: 'a' }, inputs: { items: { type: 'any', cardinality: 'many' } } }, ['template.value']],
  ['loop', { id: 'X', type: 'loop', loop: { id: 'X', max: 3, until: 'true==true' } }, ['loop.max', '__ukind']],
  ['cond', { id: 'X', type: 'cond', lang: 'expr', routing: { onNoMatch: 'stop' }, ports: [{ id: 'c1', label: 'a', expr: 'true==true' }, { id: 'c2', label: 'b', else: true }] },
    ['lang', 'routing.onNoMatch', 'ports']],
  ['calc', { id: 'X', type: 'calc', lang: 'js', code: 'return 1;' }, ['lang', 'code']],
  ['map', { id: 'X', type: 'map', map: { id: 'X' }, order: 'input', onItemError: 'value', onItemErrorValue: 1 }, ['map.id', 'onItemError', 'onItemErrorValue']],
  ['reduce', { id: 'X', type: 'reduce', op: 'best', path: 'score', skipMissing: true }, ['op', 'path', '__skipMissing']],
  ['quorum', { id: 'X', type: 'quorum', lang: 'expr', condition: 'true==true', required: 2, requiredRatio: 0.7, total: 3, onBadItem: 'false' },
    ['lang', 'condition', 'required', 'requiredRatio', 'total', '__onBadItem']],
  ['race', { id: 'X', type: 'race', lang: 'expr', condition: 'true==true', onNone: 'value', onNoneValue: 1, cancel: 'none', total: 3, onBadItem: 'false', start: { mode: 'any' } },
    ['lang', 'condition', 'onNone', '__onNoneValue', 'cancel', 'total', '__onBadItem']],
  ['race onNone:best の path', { id: 'X', type: 'race', lang: 'expr', condition: 'true==true', onNone: 'best', path: 'score', start: { mode: 'any' } }, ['path']],
  ['memory', { id: 'X', type: 'memory', scope: 'scope', rules: [{ port: 'in', op: 'append' }], out: 'last', max: 5, emit: 'when', lang: 'expr', when: 'count >= 1', unique: true, initial: [], start: { mode: 'any' } },
    ['scope', 'out', 'max', 'emit', 'when', '__unique', '__initial', 'rules']],
  ['assert', { id: 'X', type: 'assert', lang: 'expr', onFail: 'error', asserts: [{ name: 'a', expr: 'true==true', severity: 'warn' }] }, ['lang', 'onFail', 'asserts']],
  ['module', { id: 'X', type: 'module', module: 'M' }, ['module']],
  ['routing（出口2本）', { id: 'X', type: 'llm', mock: { text: 'a' }, routing: { mode: 'parallel', failurePolicy: 'fail_fast' } }, ['routing.mode', 'routing.failurePolicy']],
];
const missing = [];
for (const [name, node, want] of NODE_CASES) {
  let sp = base(node);
  if (node.type === 'module') sp.modules = { M: { spec: { nodes: [{ id: 'i', type: 'input' }, { id: 'o', type: 'output' }], edges: [{ from: { node: 'i', port: 'out' }, to: { node: 'o', port: 'in' } }] } } };
  if (node.type === 'loop') sp.edges = [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' }, position: 0 },
    { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' }, loopRole: 'body' },
    { from: { node: 'out', port: 'out' }, to: { node: 'X', port: 'in' }, loop: { id: 'X' }, position: 1 }];
  if (node.type === 'map') { sp.nodes.push({ id: 'end', type: 'pass' });
    sp.edges = [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' }, position: 0 },
      { from: { node: 'X', port: 'out' }, to: { node: 'end', port: 'in' }, mapRole: 'body' },
      { from: { node: 'end', port: 'out' }, to: { node: 'X', port: 'in' }, map: { id: 'X' }, position: 1 },
      { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' }, mapRole: 'done' }]; }
  if (node.type === 'cond') sp.edges = [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' } },
    { from: { node: 'X', port: 'c1' }, to: { node: 'out', port: 'in' } },
    { from: { node: 'X', port: 'c2' }, to: { node: 'out', port: 'in' } }];
  if (node.routing && node.routing.mode === 'parallel') { sp.nodes.push({ id: 'o2', type: 'output' });
    sp.edges.push({ from: { node: 'X', port: 'out' }, to: { node: 'o2', port: 'in' } }); }
  if (node.type === 'join' || node.type === 'reduce' || node.type === 'quorum' || node.type === 'race' || node.type === 'memory') {
    sp.nodes.push({ id: 'B', type: 'calc', lang: 'js', code: 'return 1;' });
    sp.nodes[0].routing = { mode: 'parallel', failurePolicy: 'fail_fast' };
    sp.edges.push({ from: { node: 'in', port: 'out' }, to: { node: 'B', port: 'in' } });
    const port = node.type === 'join' ? 'items' : 'in';
    sp.edges[0].to.port = port; sp.edges[0].position = 0;
    sp.edges.push({ from: { node: 'B', port: 'out' }, to: { node: 'X', port }, position: 1 }); }
  await paste(sp);
  await openNode('X');
  const got = await hasCtl(want);
  const bad = got.filter(([, v]) => !v).map(([k]) => k);
  R[name] = bad.length ? '欄が無い: ' + bad.join(', ') : 'ぜんぶ欄がある';
  if (bad.length) missing.push(name + ' → ' + bad.join(', '));
  await tap('#shClose');
}
ok.nodeKeys = missing.length === 0;

// ── つながりのキー
const EDGE_CASES = [
  ['to.port / from.port', { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' } }, ['__fport', '__tport']],
  ['pick / transform / validation', { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' }, pick: 'score', transform: 'json_stringify', validation: { typeCheck: 'bypass' } },
    ['pick', 'transform', '__vchk']],
  ['if / priority', { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' }, if: 'true==true', priority: 0 }, ['if', 'priority']],
];
const eMissing = [];
for (const [name, edge, want] of EDGE_CASES) {
  const sp = base({ id: 'X', type: 'llm', mock: { text: 'a' }, schema: SC });
  sp.edges[1] = edge;
  if (edge.if) { sp.nodes.push({ id: 'o2', type: 'output' });
    sp.edges.push({ from: { node: 'X', port: 'out' }, to: { node: 'o2', port: 'in' }, else: true });
    sp.nodes[1].routing = { mode: 'first_match', onNoMatch: 'error' }; }
  await paste(sp);
  await openEdge(1);
  const got = await hasCtl(want);
  const bad = got.filter(([, v]) => !v).map(([k]) => k);
  R['線: ' + name] = bad.length ? '欄が無い: ' + bad.join(', ') : 'ぜんぶ欄がある';
  if (bad.length) eMissing.push(name + ' → ' + bad.join(', '));
  await tap('#shClose');
}
ok.edgeKeys = eMissing.length === 0;

// ── ハーネス全体（metadata / vars）
await paste({ metadata: { name: 'なまえ', version: '3', flow: 'lr' }, vars: { 目標: 8 },
  providers: { m: { adapter: 'mock' } },
  nodes: [{ id: 'in', type: 'input' }, { id: 'X', type: 'llm', mock: { text: 'a' } }, { id: 'out', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' } },
    { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' } }] });
await tap('#btnSpec');
const specGot = await hasCtl(['metadata.name', 'metadata.version', 'metadata.flow', 'vars']);
R['ハーネス全体'] = specGot.map(([k, v]) => k + '=' + v).join(' ');
ok.specKeys = specGot.every(([, v]) => v);
// vars を画面から書き換えたら JSON に入る
await p.fill('[data-vv="0"]', '9'); await p.waitForTimeout(250);
R['vars を書き換え'] = await p.evaluate(() => JSON.parse(document.querySelector('#spec').value).vars);
ok.varsWrite = JSON.stringify(R['vars を書き換え']) === '{"目標":9}';
await tap('#shClose');

// ── 逆向き: 画面で決めたことが JSON に必ず入る（入口の名前・受け取る数・種類の変更）
await paste({ metadata: { name: 'p', version: '1' }, providers: { m: { adapter: 'mock' } },
  nodes: [{ id: 'in', type: 'input' }, { id: 'X', type: 'memory', scope: 'run', rules: [{ port: 'in', op: 'append' }], emit: 'always', out: 'items', start: { mode: 'any' } }, { id: 'out', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' } },
    { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' } }] });
await openEdge(0);
await p.evaluate(() => { const s = document.querySelector('#sheetBody select[data-f="__tport"]'); const o = document.createElement('option'); o.value = '追加'; o.textContent = '追加'; s.appendChild(o); s.value = '追加'; s.dispatchEvent(new Event('change')); });
await p.waitForTimeout(260);
R['入口の名前を画面から'] = await p.evaluate(() => JSON.parse(document.querySelector('#spec').value).edges[0].to.port);
ok.portFromUI = R['入口の名前を画面から'] === '追加';
await tap('#shClose');
await openNode('X');
await p.selectOption('[data-pc="追加"]', 'many'); await p.waitForTimeout(260);
R['受け取る数を画面から'] = await p.evaluate(() => (JSON.parse(document.querySelector('#spec').value).nodes.find(n => n.id === 'X').inputs || {}));
{ const d = R['受け取る数を画面から']['追加'] || {};
  ok.cardFromUI = d.cardinality === 'many' && d.type === 'any'; }
await tap('#shClose');

// ── provider（モデルの置き場）: adapter ごとに Runtime が読むキー全部に欄があるか
const openProv = async () => { await p.evaluate(() => window.__ui.openProvidersSheet()); await p.waitForTimeout(220); };
const provCtl = async () => p.evaluate(() => {
  const got = new Set();
  for (const a of ['pv', 'pb', 'pb1', 'pj', 'ps', 'pp']) {
    document.querySelectorAll(`#sheetBody [data-${a}]`).forEach(el => got.add(el.dataset[a]));
  }
  return [...got];
});
const PROV_CASES = [
  ['mock', { adapter: 'mock' }, ['adapter', 'name', 'generation', 'schema', 'transport']],
  ['openai_local', { adapter: 'openai_local', model: 'q', endpoint: 'http://x/v1', stream: false },
    ['adapter', 'model', 'endpoint', 'stream', 'generation', 'schema', 'transport']],
  ['webllm', { adapter: 'webllm', model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', moduleSource: 'cdn', useWorker: false, indexedDB: false, workerBootMs: 1000, weightsUrl: 'https://x/', noSite: true, custom: { model: 'a', model_lib: 'b' }, overrides: { context_window_size: 2048 } },
    ['adapter', 'model', 'moduleSource', 'useWorker', 'indexedDB', 'workerBootMs', 'weightsUrl', 'noSite', 'custom', 'overrides', 'generation', 'schema', 'transport']],
  ['wllama', { adapter: 'wllama', model: 'g', url: 'https://x/a.gguf', contextSize: 2048, gpuLayers: 0, threads: 4, stallMs: 1000, cache: false, base: 'v/', moduleUrl: 'a.js', wasmUrl: 'a.wasm', compatJsUrl: 'c.js', compatWasmUrl: 'c.wasm', moduleTimeoutMs: 5000 },
    ['adapter', 'model', 'url', 'contextSize', 'gpuLayers', 'threads', 'stallMs', 'cache', 'base', 'moduleUrl', 'wasmUrl', 'compatJsUrl', 'compatWasmUrl', 'moduleTimeoutMs', 'generation', 'schema', 'transport']],
];
const pMissing = [];
for (const [name, def, want] of PROV_CASES) {
  await paste({ metadata: { name: 'p', version: '1' }, providers: { P: def },
    nodes: [{ id: 'in', type: 'input' }, { id: 'X', type: 'llm', provider: 'P' }, { id: 'out', type: 'output' }],
    edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' } },
      { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' } }] });
  await openProv();
  const got = await provCtl();
  const bad = want.filter(k => !got.includes(k));
  R['provider: ' + name] = bad.length ? '欄が無い: ' + bad.join(', ') : 'ぜんぶ欄がある';
  if (bad.length) pMissing.push(name + ' → ' + bad.join(', '));
  await tap('#shClose');
}
ok.providerKeys = pMissing.length === 0;
// provider を画面から足す・名前を変える・消す
await paste({ metadata: { name: 'p', version: '1' }, providers: { P: { adapter: 'mock' } },
  nodes: [{ id: 'in', type: 'input' }, { id: 'X', type: 'llm', provider: 'P' }, { id: 'out', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' } },
    { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' } }] });
await openProv();
await p.fill('[data-pp="name"]', 'あたらしい');
await p.evaluate(() => document.querySelector('#sheetBody [data-pp="name"]').dispatchEvent(new Event('change')));
await p.waitForTimeout(260);
R['provider の名前を画面から'] = await p.evaluate(() => { const o = JSON.parse(document.querySelector('#spec').value);
  return { keys: Object.keys(o.providers), node: o.nodes.find(n => n.id === 'X').provider }; });
ok.provRename = JSON.stringify(R['provider の名前を画面から']) === '{"keys":["あたらしい"],"node":"あたらしい"}';
await p.selectOption('select[data-ps="adapter"]', 'wllama'); await p.waitForTimeout(300);
R['provider の種類を画面から'] = await p.evaluate(() => JSON.parse(document.querySelector('#spec').value).providers);
ok.provAdapter = (Object.values(R['provider の種類を画面から'])[0] || {}).adapter === 'wllama'
  && !!(Object.values(R['provider の種類を画面から'])[0] || {}).url;
await tap('#shClose');

// ── モジュール: 名前・版・メモ・削除
await paste({ metadata: { name: 'p', version: '1' }, providers: { m: { adapter: 'mock' } },
  modules: { M: { version: '2', note: 'メモ', spec: { nodes: [{ id: 'i', type: 'input' }, { id: 'o', type: 'output' }], edges: [{ from: { node: 'i', port: 'out' }, to: { node: 'o', port: 'in' } }] } } },
  nodes: [{ id: 'in', type: 'input' }, { id: 'X', type: 'module', module: 'M' }, { id: 'out', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' } },
    { from: { node: 'X', port: 'out' }, to: { node: 'out', port: 'in' } }] });
await p.evaluate(() => window.__ui.openModulesSheet()); await p.waitForTimeout(220);
const modGot = await p.evaluate(() => [...document.querySelectorAll('#sheetBody [data-mm]')].map(el => el.dataset.mm));
R['モジュールの欄'] = modGot;
ok.moduleKeys = ['name', 'version', 'note', 'del'].every(k => modGot.includes(k));
await p.fill('[data-mm="name"]', 'MM');
await p.evaluate(() => document.querySelector('#sheetBody [data-mm="name"]').dispatchEvent(new Event('change')));
await p.waitForTimeout(260);
R['モジュールの名前を画面から'] = await p.evaluate(() => { const o = JSON.parse(document.querySelector('#spec').value);
  return { keys: Object.keys(o.modules), node: o.nodes.find(n => n.id === 'X').module }; });
ok.modRename = JSON.stringify(R['モジュールの名前を画面から']) === '{"keys":["MM"],"node":"MM"}';
await tap('#shClose');

// ── 出口（ports）: 名前（from.port）と取り出し方を手で書けるか
await paste({ metadata: { name: 'p', version: '1' }, providers: { m: { adapter: 'mock' } },
  nodes: [{ id: 'in', type: 'input' },
    { id: 'X', type: 'llm', provider: 'm', mock: { fixed: { items: ['a', 'b', 'c'] } },
      schema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'string' } } } },
      ports: [{ id: 'p1', label: '1つ目', pick: 'items.0' }] },
    { id: 'out', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'X', port: 'in' } },
    { from: { node: 'X', port: 'p1' }, to: { node: 'out', port: 'in' } }] });
await openNode('X');
const pfGot = await p.evaluate(() => [...document.querySelectorAll('#sheetBody [data-pf]')].map(el => el.dataset.pf));
R['出口の欄'] = [...new Set(pfGot)];
ok.portFields = ['label', 'key', 'id', 'pick'].every(k => pfGot.includes(k));
// 範囲の取り出しを画面から書ける
await p.fill('[data-pf="pick"][data-i="0"]', 'items.1..2'); await p.waitForTimeout(260);
R['範囲の取り出しを画面から'] = await p.evaluate(() => JSON.parse(document.querySelector('#spec').value).nodes.find(n => n.id === 'X').ports[0].pick);
ok.pickRange = R['範囲の取り出しを画面から'] === 'items.1..2';
// 出口の名前を変えると線も付け替わる
await p.fill('[data-pf="id"][data-i="0"]', 'さいしょ');
await p.evaluate(() => { const el = document.querySelector('#sheetBody [data-pf="id"][data-i="0"]'); el.dispatchEvent(new Event('input')); });
await p.waitForTimeout(280);
R['出口の名前を画面から'] = await p.evaluate(() => { const o = JSON.parse(document.querySelector('#spec').value);
  return { id: o.nodes.find(n => n.id === 'X').ports[0].id, edge: o.edges[1].from.port }; });
ok.portRename = JSON.stringify(R['出口の名前を画面から']) === '{"id":"さいしょ","edge":"さいしょ"}';
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
if (missing.length) console.log('\nノードで欄が無いもの:\n  ' + missing.join('\n  '));
if (eMissing.length) console.log('\n線で欄が無いもの:\n  ' + eMissing.join('\n  '));
if (pMissing.length) console.log('\nproviderで欄が無いもの:\n  ' + pMissing.join('\n  '));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
