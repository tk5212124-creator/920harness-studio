// 開くたびに回る自己テストが、本物のモデルを読み込まないこと（WebGPU のある端末と同じ条件で確かめる）。
// v0.39.0 までは自己テスト65が「JSONで書く」の例（adapter "webllm" の Qwen2.5）をそのまま走らせていた。
// ふだんのテストは WebGPU の無い Chromium で file:// から開くので、読み込みの入口ですぐ失敗して気づけなかった。
// iPhone では開くたびに本物のモデルを読み込んで推論し、その engine が後の自己テストの ModelManager.reset() で
// 忘れられて Worker ごと残っていた（実機の記録: 実行の前から GPU 804MB・wasm 240MB・engine を10個作った）。
// ここでは本番と同じく HTTP で配り、本物の WebGPU（swiftshader）を有効にして開く。
import http from 'http';
import fs from 'fs';
import path from 'path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'] });
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
// 自己テストの何番の途中で、何を読み込もうとしたか・Worker をいくつ作ったかを数える
await p.addInitScript(() => {
  window.__loads = []; window.__workers = [];
  const o = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'hbb.open' && /"boot"/.test(v)) { try { window.__boot = JSON.parse(v).st; } catch (_) {} }
    if (k === 'harness_loading_v1') { try { window.__loads.push({ boot: window.__boot || null, model: JSON.parse(v).model }); } catch (_) {} }
    return o.call(this, k, v);
  };
  const OW = window.Worker;
  window.Worker = function (...a) { window.__workers.push(window.__boot || null); return new OW(...a); };
  window.Worker.prototype = OW.prototype;
});
const netModel = [];
p.on('request', r => { const u = r.url(); if (/huggingface\.co|mlc-chat-config|\.gguf|params_shard|ndarray-cache/.test(u)) netModel.push(u.slice(0, 120)); });
const t0 = Date.now();
await p.goto(`http://127.0.0.1:${srv.address().port}/harness.html`);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 180000 });
const R = {}, ok = {};
R['自己テスト'] = await p.evaluate(() => ({ 結果: window.__selfTest.pass + '/' + window.__selfTest.total,
  WebGPU: !!navigator.gpu, 読み込み: window.__loads, Worker: window.__workers,
  engineを作った数: window.__dbg.eng.ENG_SEQ() }));
R['本物のモデルを取りに行った通信'] = netModel;
R['開くのに掛かった時間ms'] = Date.now() - t0;
const a = R['自己テスト'];
ok.webgpu = a.WebGPU;                                             // 条件がそろっている（WebGPU がある）
ok.selftest = /^(\d+)\/\1$/.test(a.結果);
ok.noRealModel = a.読み込み.every(x => /^stub-model/.test(x.model));   // 読むのはテスト用の偽物だけ
ok.noModelNetwork = netModel.length === 0;
ok.noModelWorker = a.Worker.every(x => /自己テスト 53 まで/.test(x || ''));   // 54番（計算ノード JavaScript）の Worker だけ

for (const [k, v] of Object.entries(R)) console.log(k + ': ' + JSON.stringify(v));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
