// 本物のモデルで、本当に推論できるかを確かめる（重みが取れる環境でだけ動く）。
// 既定では「このサイトが配るモデル」を、ローカルのHTTPサーバから配って試す。
//   MODEL_DIR=<mlc-chat-config.json のあるディレクトリ> で重みの場所を渡す。
// ここで見るのは、実機で出た事故そのもの:
//   ① 素の生成ができる
//   ② schema を付けた生成（JSON強制）が GrammarMatcherInitError にならず、JSONで返る
import http from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
// Claude Code の環境と GitHub Actions の両方で動くようにする
let pw;
try { pw = (await import('playwright')).default || await import('playwright'); }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const { chromium } = pw;
const CHROMIUM = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const ROOT = new URL('..', import.meta.url).pathname;
const MODEL_DIR = process.env.MODEL_DIR || '';
const MODEL_ID = process.env.MODEL_ID || 'SmolLM2-360M-Instruct-q4f16_1-MLC';
if (!MODEL_DIR || !existsSync(join(MODEL_DIR, 'mlc-chat-config.json'))) {
  console.log('SKIP: 重みが無い（MODEL_DIR に mlc-chat-config.json のあるディレクトリを渡す）');
  process.exit(0);
}
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
                '.json':'application/json', '.wasm':'application/wasm', '.bin':'application/octet-stream' };
const PREFIX = `/models/${MODEL_ID}/resolve/main/`;
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (p === '/models_index.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ models: [{ id: MODEL_ID, path: PREFIX.slice(1), mb: 0 }] }));
  }
  if (p.startsWith(PREFIX)) file = join(MODEL_DIR, p.slice(PREFIX.length));
  else file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, '') === '/' ? 'harness.html' : p.slice(1));
  try {
    if (!statSync(file).isFile()) throw new Error('nf');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;

const b = await chromium.launch({ ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan',
         '--enable-dawn-features=allow_unsafe_apis'] });
const p = await (await b.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (/GrammarMatcher|WindowSize|Error/i.test(m.text())) console.log('   [console]', m.text().slice(0, 160)); });
await p.goto(`http://127.0.0.1:${PORT}/harness.html`);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};

R['端末'] = await p.evaluate(() => webgpuDiagnostics().then(d => ({ webgpu: d.webgpu, adapter: d.adapter, f16: d.f16 })));

const run = async (schema) => p.evaluate(async ({ id, schema, port }) => {
  const def = { adapter: 'webllm', model: id, useWorker: false, indexedDB: true, moduleSource: 'vendor',
    weightsUrl: `http://127.0.0.1:${port}/models/${id}/resolve/main/`, stallMs: 600000 };
  const t0 = Date.now();
  try {
    const handle = await ModelManager.ensureLoaded(def, PROVIDERS.webllm, undefined, null);
    const loadMs = Date.now() - t0;
    const t1 = Date.now();
    const r = await PROVIDERS.webllm.invoke({
      input: { messages: [{ role: 'user', content: schema ? '5点満点で3点の評価をJSONで返して' : 'Say hello in one short sentence.' }] },
      model: id, generation: { maxTokens: 40, temperature: 0 }, schema, handle, onToken: () => {} });
    return { ok: true, loadMs, genMs: Date.now() - t1, out: r.output, usage: r.usage };
  } catch (e) { return { ok: false, code: e.code, message: String(e.message || e).slice(0, 300), ms: Date.now() - t0 }; }
}, { id: MODEL_ID, schema: schema || null, port: PORT });

// ① 素の生成
R['① 素の生成'] = await run(null);
ok.plain = R['① 素の生成'].ok === true && R['① 素の生成'].out.type === 'text' && R['① 素の生成'].out.value.length > 0;

// ② JSON強制（実機で GrammarMatcherInitError が出たところ）
R['② JSON強制'] = await run({ type: 'object', required: ['score'], properties: { score: {} } });
ok.json = R['② JSON強制'].ok === true && R['② JSON強制'].out.type === 'json'
  && R['② JSON強制'].out.value.score !== undefined;

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean);
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
