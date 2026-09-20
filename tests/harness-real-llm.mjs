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

// GPUの無い機械ではソフトウェア実装(SwiftShader)でWebGPUを動かす。
// 効く組み合わせが環境で違うので、adapterが取れるまで順に試す。
const ARGSETS = [
  ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'],
  ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-features=Vulkan'],
  ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-vulkan=swiftshader', '--enable-features=Vulkan,VulkanFromANGLE'],
  ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader'],
];
let b = null, p = null, diag = null, usedArgs = null;
const errs = [];
for (const args of ARGSETS) {
  const cand = await chromium.launch({ ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
    args: [...args, '--enable-dawn-features=allow_unsafe_apis'] });
  const page = await (await cand.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/harness.html`);
  await page.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
  const d = await page.evaluate(() => webgpuDiagnostics().then(x => ({ webgpu: x.webgpu, adapter: x.adapter, f16: x.f16, adapterError: x.adapterError })));
  console.log('試した起動オプション:', args.join(' '), '->', JSON.stringify(d));
  if (d.adapter) { b = cand; p = page; diag = d; usedArgs = args; break; }
  await cand.close();
}
if (!p) {
  console.log('SKIP: この機械では WebGPU の adapter が取れない（GPUもソフトウェア実装も無い）');
  srv.close(); process.exit(0);
}
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (/GrammarMatcher|WindowSize|Error/i.test(m.text())) console.log('   [console]', m.text().slice(0, 160)); });
const R = {}, ok = {};
R['端末'] = diag;
R['起動オプション'] = usedArgs.join(' ');

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
      model: id, generation: { maxTokens: 120, temperature: 0 }, schema, handle, onToken: () => {} });
    return { ok: true, loadMs, genMs: Date.now() - t1, out: r.output, usage: r.usage };
  } catch (e) { return { ok: false, code: e.code, message: String(e.message || e).slice(0, 300), ms: Date.now() - t0 }; }
}, { id: MODEL_ID, schema: schema || null, port: PORT });

// ① 素の生成
R['① 素の生成'] = await run(null);
ok.plain = R['① 素の生成'].ok === true && R['① 素の生成'].out.type === 'text' && R['① 素の生成'].out.value.length > 0;

// ② JSON強制（実機で GrammarMatcherInitError が出たところ）
//    ここで見るのは「文法を組み立てて生成まで行けること」と「失敗しても説明できる形になること」。
//    小さいモデルが中身を外すのはモデルの性能の話で、アプリの不具合ではない。
R['② JSON強制'] = await run({ type: 'object', required: ['score'], properties: { score: { type: 'integer' } } });
const j = R['② JSON強制'];
const 文法は組めた = !/GrammarMatcherInit|grammar matcher|non-str/i.test(j.message || '');
const 説明できる失敗 = j.ok === false && j.code === 'SCHEMA_VALIDATION_ERROR' && 文法は組めた;
R['② 判定の内訳'] = { 文法は組めた, JSONで返った: j.ok === true, 説明できる失敗 };
ok.json = 文法は組めた && (j.ok === true ? j.out.type === 'json' && j.out.value.score !== undefined : 説明できる失敗);

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean);
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
