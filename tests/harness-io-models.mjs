// 一番上の「入出力」パネルが入力/出力ノードに連動するか、
// 「モデル」パネルから Gemma/Qwen/Llama を端末に落とす導線が成立しているかを見る。
// 重みは HuggingFace にあり、この検証環境からは組織ポリシーで到達できないので、
// ダウンロードは「固まらずに理由の分かる失敗を返すこと」までを確認する。
import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
// 同梱した WebLLM 本体は同一オリジンから import するので http で配信する（file:// では読めない）
const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const f = join(ROOT, rel === '/' ? 'harness.html' : rel);
  try { statSync(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${srv.address().port}/harness.html`);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));
const paste = async obj => { await tap('#btnImport'); await p.fill('#imText', JSON.stringify(obj)); await tap('#imGo'); await tap('#imApply'); };

// ① 最初から入力欄と出力欄がノードに対応して出る（既定の例は in と out）
R['① 初期'] = { 入力欄: await p.$$eval('#ioIn [data-in]', e => e.map(x => x.dataset.in)),
  出力欄: await p.$$eval('#ioOut [data-out]', e => e.map(x => x.dataset.out)) };
ok.init = JSON.stringify(R['① 初期']) === JSON.stringify({ 入力欄: ['in'], 出力欄: ['out'] });

// ② 入力欄に書いた文字がそのまま実行に渡り、結果が出力欄に出る
await paste({ metadata: { name: "入出力", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "a", type: "llm", provider: "m", mock: { echoInput: true } }, { id: "res", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "a", port: "in" } },
          { from: { node: "a", port: "out" }, to: { node: "res", port: "in" } }] });
await p.fill('#ioIn [data-in="in"]', 'テスト入力123');
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['② 入力→出力'] = { 出力欄: (await p.textContent('#ioOut [data-out="res"]')).slice(0, 80),
  state: (await p.textContent('#stateline')).slice(0, 30) };
ok.io = R['② 入力→出力'].出力欄.includes('テスト入力123');

// ③ 出力ノードを足すと出力欄が増える（エディタから）
await tap('#addNode');
await tap('[data-add="output"]');
await tap('#shClose');
R['③ 出力を足す'] = await p.$$eval('#ioOut [data-out]', e => e.map(x => x.dataset.out));
ok.addOut = R['③ 出力を足す'].length === 2;

// ④ 入力ノードを足すと入力欄が増え、起点の注意も出る。両方の値が実際にモデルへ届く
await p.evaluate(() => {
  const enc = t => new TextEncoder().encode(t);
  registerTransport('t', async (url, init) => {
    if (/\/models$/.test(url)) return new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    window.__lastBody = JSON.parse(init.body);
    const body = new ReadableStream({ start(c) {
      c.enqueue(enc('data: ' + JSON.stringify({ choices: [{ delta: { content: '受け取った' } }] }) + '\n\n'));
      c.enqueue(enc('data: [DONE]\n\n')); c.close();
    } });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  });
});
await paste({ metadata: { name: "2入力", version: "1" },
  providers: { local: { adapter: "openai_local", endpoint: "http://stub/v1", model: "m1", transport: "t" } },
  nodes: [{ id: "in", type: "input" }, { id: "in2", type: "input" },
          { id: "a", type: "llm", provider: "local",
            prompt: { template: { syntax: "mustache", mode: "interpolation_only", value: "A={{{in}}} B={{{run_input.in2}}}" } } },
          { id: "res", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "a", port: "in" } },
          { from: { node: "a", port: "out" }, to: { node: "res", port: "in" } }] });
R['④ 入力を足す'] = { 入力欄: await p.$$eval('#ioIn [data-in]', e => e.map(x => x.dataset.in)),
  注意: (await p.locator('#ioMulti').count()) ? (await p.textContent('#ioMulti')).slice(0, 40) : 'なし' };
await p.fill('#ioIn [data-in="in"]', 'ひとつめ');
await p.fill('#ioIn [data-in="in2"]', 'ふたつめ');
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['④ モデルに届いた文'] = await p.evaluate(() => window.__lastBody && window.__lastBody.messages[0].content);
ok.addIn = R['④ 入力を足す'].入力欄.join(',') === 'in,in2' && R['④ 入力を足す'].注意.includes('最初の入力ノード')
  && R['④ モデルに届いた文'] === 'A=ひとつめ B=ふたつめ';

// ⑤ 入力ノードを消すと欄も消える
await paste({ metadata: { name: "1入力に戻す", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "a", type: "llm", provider: "m", mock: { text: "x" } }, { id: "res", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "a", port: "in" } },
          { from: { node: "a", port: "out" }, to: { node: "res", port: "in" } }] });
R['⑤ 減らす'] = { 入力欄: await p.$$eval('#ioIn [data-in]', e => e.length), 出力欄: await p.$$eval('#ioOut [data-out]', e => e.length) };
ok.remove = R['⑤ 減らす'].入力欄 === 1 && R['⑤ 減らす'].出力欄 === 1;

// ⑥ モデル一覧に Gemma / Qwen / Llama が並ぶ
R['⑥ モデル一覧'] = await p.$$eval('#mdlList .mrow .mname b', e => e.map(x => x.textContent));
ok.catalog = ['gemma3-1b-it-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC']
  .every(id => R['⑥ モデル一覧'].includes(id));

// ⑦ f16非対応の端末向け(q4f32)を出すと行が増える
const n1 = R['⑥ モデル一覧'].length;
await p.check('#mdlF32'); await p.waitForTimeout(200);
const n2 = await p.locator('#mdlList .mrow').count();
R['⑦ q4f32'] = { 前: n1, 後: n2 };
ok.f32 = n2 > n1;
await p.uncheck('#mdlF32'); await p.waitForTimeout(200);

// ⑧ どのモデルを使うかはノード編集で決める（パネルに「使う」「起動」は無い）
R['⑧ パネルに残っているボタン'] = [...new Set(await p.$$eval('#mdlList .mrow button', e => e.map(x => x.dataset.act)))];
ok.noUseBtn = !R['⑧ パネルに残っているボタン'].includes('use');
await tap('.nd[data-id="a"]');
await p.selectOption('[data-f="__prov"]', '__webllm'); await p.waitForTimeout(250);
await p.selectOption('[data-f="model"]', 'Llama-3.2-1B-Instruct-q4f16_1-MLC'); await p.waitForTimeout(250);
const s8 = await spec();
R['⑧ ノードで選んだモデル'] = { provider: s8.providers.local, ノード: s8.nodes.find(n => n.id === 'a').model };
ok.use = s8.providers.local.adapter === 'webllm' && /Llama/.test(R['⑧ ノードで選んだモデル'].ノード);
await tap('#shClose');

// ⑨ ダウンロード: この環境では重み置き場に届かないので、固まらず理由が出る
await tap('#mdlList .mrow:nth-child(1) button[data-act="get"]');
await p.waitForFunction(() => /✗|✔|秒/.test(document.querySelector('#mdlMsg').textContent), null, { timeout: 60000 });
R['⑨ ダウンロード'] = (await p.textContent('#mdlMsg')).replace(/\s+/g, ' ').slice(0, 120);
ok.download = R['⑨ ダウンロード'].includes('✗') && /MODEL_LOAD_FAILED/.test(R['⑨ ダウンロード'])
  && /取得に失敗|fetch|重み|通信/i.test(R['⑨ ダウンロード']);   // 重み置き場に届かない旨が出る

// ⑩ 通信が止まったまま返ってこない端末でも、待ち続けずに理由を出して操作を戻す
//    （「押しても何も起きない」の再発防止）
await p.route('**/vendor/web-llm/index.js', async () => { /* 応答しない */ });
await p.evaluate(() => { delete _webllmMods[Object.keys(_webllmMods)[0]]; });   // 読み込み済みを捨てる
const t10 = Date.now();
await tap('#mdlList .mrow:nth-child(1) button[data-act="get"]');
const 経過中 = await p.textContent('#mdlList .mrow:nth-child(1) .mstat');
await p.waitForFunction(() => /✗/.test(document.querySelector('#mdlMsg').textContent), null, { timeout: 60000 });
R['⑩ 通信が止まる端末'] = { 待った秒数: Math.round((Date.now() - t10) / 1000),
  待機中の表示: 経過中.slice(0, 30),
  結果: (await p.textContent('#mdlMsg')).replace(/\s+/g, ' ').slice(0, 70),
  行に残る: (await p.textContent('#mdlList .mrow:nth-child(1) .mstat')).slice(0, 30),
  ボタン: await p.locator('#mdlList .mrow:nth-child(1) button[data-act="get"]').isDisabled() ? '押せない' : '押せる' };
ok.noHang = R['⑩ 通信が止まる端末'].待った秒数 < 50 && R['⑩ 通信が止まる端末'].結果.includes('✗')
  && R['⑩ 通信が止まる端末'].ボタン === '押せる' && R['⑩ 通信が止まる端末'].行に残る.includes('✗');

// ⑪ 同梱ファイルが配信されていない（404）ときに、そうと分かる文言を出す
//    ＝ Pages に vendor/ を入れ忘れた事故の再発防止。まっさらなページで確かめる
const p2 = await ctx.newPage();
await p2.route('**/vendor/web-llm/index.js', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<html>404</html>' }));
await p2.goto(`http://127.0.0.1:${srv.address().port}/harness.html`);
await p2.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
await p2.locator('#mdlList .mrow:nth-child(1) button[data-act="get"]').tap();
await p2.waitForFunction(() => /✗/.test(document.querySelector('#mdlMsg').textContent), null, { timeout: 40000 });
R['⑪ 同梱ファイルが404'] = (await p2.textContent('#mdlMsg')).replace(/\s+/g, ' ').slice(0, 140);
ok.missingVendor = /404/.test(R['⑪ 同梱ファイルが404']) && /配信されていない/.test(R['⑪ 同梱ファイルが404']);
await p2.close();

// ⑫ 出力に届かなかったとき、出力欄に理由が出る（「まだ実行していない」のままにしない）
await paste({ metadata: { name: "途中で失敗", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "a", type: "llm", provider: "m", mock: { fail: "generic" } }, { id: "res", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "a", port: "in" } },
          { from: { node: "a", port: "out" }, to: { node: "res", port: "in" } }] });
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['⑫ 届かなかった出力'] = { 出力欄: (await p.textContent('#ioOut [data-out="res"]')).replace(/\s+/g, ' ').slice(0, 70),
  状態行: (await p.textContent('#ioStatus')).replace(/\s+/g, ' ').slice(0, 70) };
ok.outReason = R['⑫ 届かなかった出力'].出力欄.includes('届かなかった') && R['⑫ 届かなかった出力'].出力欄.includes('a')
  && R['⑫ 届かなかった出力'].状態行.includes('PROVIDER_ERROR');

// ⑬ Gemma は窓サイズの上書きを付けて使う（両方が正だと起動できないため）
//    ノードでモデルを選んだときも上書きが付き、他のモデルには連れて行かない
await tap('.nd[data-id="a"]');
await p.selectOption('[data-f="__prov"]', '__webllm'); await p.waitForTimeout(250);
await p.selectOption('[data-f="model"]', 'gemma3-1b-it-q4f16_1-MLC'); await p.waitForTimeout(250);
const s13 = await spec();
const n13 = s13.nodes.find(n => n.id === 'a');
R['⑬ Gemmaのoverrides'] = { ノード: n13.overrides, provider既定: s13.providers.local.model,
  実際に渡る: await p.evaluate(() => effectiveOverrides(
      JSON.parse(document.querySelector('#spec').value).providers.local,
      JSON.parse(document.querySelector('#spec').value).nodes.find(n => n.id === 'a'))),
  別モデルに連れて行かない: await p.evaluate(() => effectiveOverrides(
      { adapter: 'webllm', model: 'gemma3-1b-it-q4f16_1-MLC', overrides: { sliding_window_size: -1 } },
      { id: 'x', model: 'SmolLM2-360M-Instruct-q4f16_1-MLC' })) };
ok.gemmaOverride = n13.overrides && n13.overrides.sliding_window_size === -1
  && R['⑬ Gemmaのoverrides'].実際に渡る.sliding_window_size === -1
  && R['⑬ Gemmaのoverrides'].別モデルに連れて行かない === null;
await p.selectOption('[data-f="model"]', 'SmolLM2-360M-Instruct-q4f16_1-MLC'); await p.waitForTimeout(250);
R['⑬ 別モデルに戻すと消える'] = (await spec()).nodes.find(n => n.id === 'a').overrides || '（無し）';
ok.gemmaOverrideOff = R['⑬ 別モデルに戻すと消える'] === '（無し）';
await tap('#shClose');

// ⑭ 保存先の状況が出る
await p.waitForFunction(() => /使用|保存/.test(document.querySelector('#mdlStore').textContent), null, { timeout: 10000 });
R['⑭ 保存状況'] = (await p.textContent('#mdlStore')).slice(0, 60);
ok.storage = /使用 \d+MB/.test(R['⑭ 保存状況']) && /長期保存/.test(R['⑭ 保存状況']);

// ⑮ 自分で置いたモデルを登録すると、重みの取得先がその置き場になる
const asked = [];
await p.route('**/mymodels/**', route => { asked.push(route.request().url()); route.fulfill({ status: 404, body: 'x' }); });
await tap('#mdlAdd');
await p.fill('[data-f="__cmId"]', 'MyLocal-0.5B');
await p.fill('[data-f="__cmUrl"]', `http://127.0.0.1:${srv.address().port}/mymodels/q05/`);
await p.selectOption('[data-f="__cmBase"]', 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
const libUrl = await p.inputValue('[data-f="__cmLib"]');
R['⑮ 実際に読みに行く先'] = (await p.textContent('#cmFinal')).slice(-46);
await tap('#cmCheck');
await p.waitForFunction(() => /✔|✗/.test(document.querySelector('#cmMsg').textContent), null, { timeout: 20000 });
R['⑮ 置き場の確認'] = (await p.textContent('#cmMsg')).slice(0, 60);
await tap('#cmAdd');
R['⑮ 登録'] = { 一覧の先頭: await p.textContent('#mdlList .mrow:nth-child(1) .mname b'),
  借りたwasm: libUrl.slice(-46) };
ok.customAdd = R['⑮ 登録'].一覧の先頭 === 'MyLocal-0.5B' && /Qwen2-0\.5B.*webgpu\.wasm$/.test(libUrl)
  && R['⑮ 実際に読みに行く先'].includes('resolve/main/mlc-chat-config.json')
  && R['⑮ 置き場の確認'].includes('✗');   // この試験では404を返すので、そう言い当てる
// 登録した置き場を実際に見に行く（Worker越しの通信は横取りできないので同じスレッドで確かめる）
const fetchTried = await p.evaluate(async ([url, lib]) => {
  try {
    await WebLLMProvider.ensureLoaded({ adapter: "webllm", model: "MyLocal-0.5B", useWorker: false,
      indexedDB: true, moduleSource: "vendor", custom: { model: url, model_lib: lib } }, () => {}, undefined);
    return "成功してしまった";
  } catch (e) { return String(e.message || e).slice(0, 120); }
}, [`http://127.0.0.1:${srv.address().port}/mymodels/q05/`, libUrl]);
R['⑮ 取りに行った先'] = { 失敗の内容: fetchTried, 横取りしたURL: asked.slice(0, 2).map(u => u.replace(/^https?:\/\/[^/]+/, '')) };
ok.customFetch = asked.some(u => u.includes('/mymodels/q05/'));
// 登録を消せる
await tap('#mdlList .mrow:nth-child(1) button[data-act="unreg"]');
R['⑮ 登録解除後の先頭'] = await p.textContent('#mdlList .mrow:nth-child(1) .mname b');
ok.customUnreg = R['⑮ 登録解除後の先頭'] === 'SmolLM2-360M-Instruct-q4f16_1-MLC';

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
