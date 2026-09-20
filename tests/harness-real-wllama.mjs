// 本物の GGUF を CPU（WASM）で動かす。WebGPU を使わない道の実測。
//   GGUF_PATH=<….gguf> node tests/harness-real-wllama.mjs
// 重みが無ければ SKIP。ヘッダは GitHub Pages と同じ（COOP/COEP なし＝シングルスレッド）にして、
// 実機に近い条件で測る。
import http from 'node:http';
import { readFileSync, statSync, existsSync, createReadStream } from 'node:fs';
import { extname, join, normalize, basename } from 'node:path';
let pw;
try { pw = (await import('playwright')).default || await import('playwright'); }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const { chromium } = pw;
const CHROMIUM = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const ROOT = new URL('..', import.meta.url).pathname;
const GGUF = process.env.GGUF_PATH || '';
if (!GGUF || !existsSync(GGUF)) { console.log('SKIP: GGUFが無い（GGUF_PATH で渡す）'); process.exit(0); }
const GGUF_NAME = basename(GGUF);
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
                '.json':'application/json', '.wasm':'application/wasm', '.gguf':'application/octet-stream' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/w/' + GGUF_NAME) {
    const st = statSync(GGUF);
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = +m[1], end = m[2] ? +m[2] : st.size - 1;
      res.writeHead(206, { 'Content-Type': 'application/octet-stream', 'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'ETag': '"t"' });
      return createReadStream(GGUF, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'ETag': '"t"' });
    return createReadStream(GGUF).pipe(res);
  }
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, '') === '/' ? 'harness.html' : p.slice(1));
  try {
    if (!statSync(file).isFile()) throw new Error('nf');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;

const b = await chromium.launch({ ...(CHROMIUM ? { executablePath: CHROMIUM } : {}) });
const p = await (await b.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (/error|fail|warn/i.test(m.text())) console.log('   [console]', m.text().slice(0, 140)); });
await p.goto(`http://127.0.0.1:${PORT}/harness.html`);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};

const url = `http://127.0.0.1:${PORT}/w/${GGUF_NAME}`;
const run = async (schema, maxTokens) => p.evaluate(async ({ url, schema, maxTokens }) => {
  const def = { adapter: 'wllama', model: 'real-gguf', url, contextSize: 1024, gpuLayers: 0, stallMs: 900000 };
  const t0 = Date.now();
  try {
    ModelManager.reset();
    const handle = await ModelManager.ensureLoaded(def, PROVIDERS.wllama, undefined, null);
    const loadMs = Date.now() - t0;
    const t1 = Date.now();
    const r = await PROVIDERS.wllama.invoke({
      input: { messages: [{ role: 'user', content: schema ? '5点満点で7点の評価をJSONで返して' : '日本語で1文だけ自己紹介して。' }] },
      model: 'real-gguf', generation: { maxTokens, temperature: 0.2 }, schema, handle, onToken: () => {} });
    return { ok: true, loadMs, genMs: Date.now() - t1, out: r.output, usage: r.usage };
  } catch (e) { return { ok: false, code: e.code, message: String(e.message || e).slice(0, 250), ms: Date.now() - t0 }; }
}, { url, schema: schema || null, maxTokens: maxTokens || 48 });

R['① 素の生成'] = await run(null, 48);
ok.plain = R['① 素の生成'].ok === true && R['① 素の生成'].out.type === 'text' && R['① 素の生成'].out.value.length > 0;

R['② JSON強制'] = await run({ type: 'object', required: ['score'], properties: { score: { type: 'integer' } } }, 48);
const j = R['② JSON強制'];
ok.json = j.ok === true ? (j.out.type === 'json' && j.out.value.score !== undefined)
  : (j.code === 'SCHEMA_VALIDATION_ERROR');     // 中身を外すのはモデルの性能の話

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean);
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
