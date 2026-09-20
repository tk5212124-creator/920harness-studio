// 同梱した WebLLM 本体（vendor/web-llm/index.js）を実際のブラウザで読み込み、
// WebGPUの実測・モデル一覧・Worker往復・失敗時の挙動までを確認する。
// 実モデルの重みは HuggingFace から取るので、この環境（外部通信が塞がれている）では
// 「重みが取れないときに固まらず MODEL_LOAD_FAILED になる」ことまでを見る。
import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
                '.json':'application/json', '.png':'image/png', '.md':'text/plain; charset=utf-8' };
const srv = http.createServer((req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel === '/' ? 'harness.html' : rel);
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${srv.address().port}/harness.html`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'] });
const p = await (await b.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(PAGE);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });

const R = {}; const ok = {};

// ① WebGPU の実測（この環境は swiftshader。実機の値はここに実機の数字が出る）
const diag = await p.evaluate(() => webgpuDiagnostics());
R['① 端末チェック(実測)'] = { webgpu: diag.webgpu, adapter: diag.adapter, f16: diag.f16,
  features: diag.features.slice(0, 6), limits: diag.limits, storage: diag.storage, adapterError: diag.adapterError };
ok.diag = diag.webgpu === true && diag.adapter === true && typeof diag.f16 === 'boolean';

// ② 同梱本体を同一オリジンからimportしてモデル一覧を読む（CDN不要の証明）
const list = await p.evaluate(async () => {
  const l = await WebLLMProvider.modelList({ adapter: 'webllm', moduleSource: 'vendor' });
  return { n: l.length, smallest: l.slice(0, 3), hasSmol: l.some(x => x.id === 'SmolLM2-360M-Instruct-q4f16_1-MLC') };
});
R['② 同梱本体からのモデル一覧'] = list;
ok.list = list.n > 100 && list.hasSmol;

// ③ 端末の保存状況（IndexedDB経路が動くか）
const cache = await p.evaluate(() => WebLLMProvider.cacheStatus(
  { adapter: 'webllm', moduleSource: 'vendor', model: 'SmolLM2-360M-Instruct-q4f16_1-MLC', indexedDB: true }));
R['③ 保存状況(未DL)'] = cache;
ok.cache = cache && cache.cached === false;

// ④ Worker往復: 存在しないモデルIDを渡す → Worker起動・本体import・エラーの往復が成立する
const bogus = await p.evaluate(async () => {
  try {
    await WebLLMProvider.ensureLoaded({ adapter: 'webllm', moduleSource: 'vendor',
      model: 'no-such-model-xyz', useWorker: true, indexedDB: true }, () => {}, undefined);
    return { thrown: false };
  } catch (e) { return { thrown: true, code: e.code, message: String(e.message || e).slice(0, 160) }; }
});
R['④ Worker往復(存在しないモデルID)'] = bogus;
ok.worker = bogus.thrown === true && bogus.code === 'MODEL_LOAD_FAILED';

// ⑤ 実モデル: 重みが取れない環境では固まらず失敗する（実機ではここでDLが走る）
const real = await p.evaluate(async () => {
  const t0 = Date.now();
  let last = null;
  try {
    await WebLLMProvider.ensureLoaded({ adapter: 'webllm', moduleSource: 'vendor',
      model: 'SmolLM2-360M-Instruct-q4f16_1-MLC', useWorker: true, indexedDB: true },
      pr => { last = pr; }, undefined);
    return { thrown: false, ms: Date.now() - t0, last };
  } catch (e) { return { thrown: true, code: e.code, retryable: e.retryable,
      message: String(e.message || e).slice(0, 200), ms: Date.now() - t0, last }; }
});
R['⑤ 実モデル(重み取得)'] = real;
ok.real = real.thrown === true && ['MODEL_LOAD_FAILED', 'RESOURCE_EXHAUSTED'].includes(real.code);

// ⑥ 画面の操作: 端末チェックボタンで診断が出る
await p.click('#adapterSeg button[data-ad="webllm"]');
await p.click('#wlDiag');
await p.waitForFunction(() => document.querySelector('#diagOut').textContent.includes('WebGPU'), null, { timeout: 15000 });
R['⑥ 画面の端末チェック'] = (await p.textContent('#diagOut')).split('\n').slice(0, 4).join(' / ');
ok.ui = (await p.textContent('#diagOut')).includes('shader-f16');

// ⑦ 例「内蔵LLM直列」を実行: adapterが内蔵LLMに切り替わり、重みが取れない環境では固まらず failed になる
await p.click('#exSeg button[data-ex="exW1"]');
R['⑦ 例で切り替わったadapter'] = await p.evaluate(() => document.querySelector('#adapterSeg button.on').dataset.ad);
const specProv = await p.evaluate(() => JSON.parse(document.querySelector('#spec').value).providers.local);
R['⑦ 例のproviders.local'] = specProv;
await p.click('#run');
await p.waitForFunction(() => /^state: (failed|success|cancelled)/.test(document.querySelector('#stateline').textContent),
  null, { timeout: 60000 });
R['⑦ 実行の結末'] = (await p.textContent('#stateline')).slice(0, 80);
R['⑦ ログ最終行'] = (await p.textContent('#log')).trim().split('\n').slice(-1)[0].slice(0, 160);
ok.exW = (await p.evaluate(() => document.querySelector('#adapterSeg button.on').dataset.ad)) === 'webllm'
  && specProv.adapter === 'webllm'
  && (await p.textContent('#log')).includes('MODEL_LOAD_FAILED');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v, null, 1)));

const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
