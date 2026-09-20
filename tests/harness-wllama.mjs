// CPUで動かす道（Wllama / GGUF / WebGPUなし）を、本体を差し替えて確かめる。
// 実物の重みは別（tests/harness-real-llm.mjs と CI でやる）。ここでは契約を見る:
//   ① ensureLoaded が GGUF の url と n_gpu_layers:0 を渡す（＝GPUを使わない）
//   ② streaming が onToken に流れ、usage が入る
//   ③ decode中の cancel で cancelled になり、出力は配送しない
//   ④ schema を付けると response_format(json_schema) で縛る
//   ⑤ 同梱本体（vendor/wllama）が実ブラウザから読める
import http from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
                '.json':'application/json', '.wasm':'application/wasm' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, '') === '/' ? 'harness.html' : p.slice(1));
  try {
    if (!statSync(file).isFile()) throw new Error('nf');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${PORT}/harness.html`);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};

// 本体を差し替えたモジュール（Wllama と CacheManager だけ持つ）
const STUB = `
export class CacheManager{
  async list(){return globalThis.__wlCache||[];}
  async getNameFromURL(u){return "n_"+u.split("/").pop();}
  async delete(n){globalThis.__wlCache=(globalThis.__wlCache||[]).filter(x=>x.name!==n);}
}
export class Wllama{
  constructor(pathConfig,cfg){globalThis.__wlNew={pathConfig,cfg};}
  setCompat(c){globalThis.__wlCompat=c;}
  async loadModelFromUrl(url,params){
    globalThis.__wlLoad={url,params};
    if(params&&params.progressCallback)params.progressCallback({loaded:5,total:10});
    if(String(url).includes("boom"))throw new Error("cannot open gguf");
  }
  async createChatCompletion(opt){
    globalThis.__wlOpt=opt;
    const toks=globalThis.__wlTokens||["は","い"];
    const delay=globalThis.__wlDelay||0;
    return (async function*(){
      for(const t of toks){
        if(delay)await new Promise(r=>setTimeout(r,delay));
        if(opt.abortSignal&&opt.abortSignal.aborted)return;
        yield {choices:[{index:0,delta:{content:t},finish_reason:null}]};
      }
      yield {choices:[{index:0,delta:{},finish_reason:"stop"}],usage:{prompt_tokens:11,completion_tokens:toks.length}};
    })();
  }
  async exit(){globalThis.__wlExit=(globalThis.__wlExit||0)+1;}
}`;
const stubUrl = await p.evaluate(src => URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), STUB);

const defOf = (extra = {}) => ({ adapter: 'wllama', model: 'stub-gguf',
  url: 'https://example.test/models/stub.gguf', contextSize: 1024, gpuLayers: 0,
  moduleUrl: stubUrl, ...extra });

// ① ロードの渡し方（GPUを使わない・文脈の長さ・自分の置き場のwasm）
R['① ロードの渡し方'] = await p.evaluate(async def => {
  ModelManager.reset();
  await ModelManager.ensureLoaded(def, PROVIDERS.wllama, undefined, null);
  return { load: globalThis.__wlLoad, wasm: (globalThis.__wlNew.pathConfig || {}).default,
    compat: globalThis.__wlCompat, offline: (globalThis.__wlNew.cfg || {}).allowOffline };
}, defOf());
ok.load = R['① ロードの渡し方'].load.url.endsWith('stub.gguf')
  && R['① ロードの渡し方'].load.params.n_gpu_layers === 0
  && R['① ロードの渡し方'].load.params.n_ctx === 1024
  && /\/vendor\/wllama\/wllama\.wasm$/.test(R['① ロードの渡し方'].wasm)
  && /\/vendor\/wllama\/compat\/wllama\.wasm$/.test(R['① ロードの渡し方'].compat.wasm);

// ② ハーネスとして動く（streaming と usage）
R['② 実行'] = await p.evaluate(async def => {
  ModelManager.reset(); globalThis.__wlTokens = ['CPU', 'で', '動く'];
  const sp = { metadata: { version: '1' }, providers: { cpu: def },
    nodes: [{ id: 'in', type: 'input' }, { id: 'a', type: 'llm', provider: 'cpu' }, { id: 'out', type: 'output' }],
    edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'a', port: 'in' } },
            { from: { node: 'a', port: 'out' }, to: { node: 'out', port: 'in' } }] };
  const toks = [];
  const r = await fullRun(sp, {}, null, makeController({ onToken: (n, t) => toks.push(t) }));
  return { status: r.status, out: r.result, toks, inTok: r.totals.inputTokens, outTok: r.totals.outputTokens };
}, defOf());
ok.run = R['② 実行'].status === 'success' && R['② 実行'].out.value === 'CPUで動く'
  && R['② 実行'].toks.length === 3 && R['② 実行'].inTok === 11 && R['② 実行'].outTok === 3;

// ③ decode中のcancel
R['③ cancel'] = await p.evaluate(async def => {
  ModelManager.reset(); globalThis.__wlTokens = ['a', 'b', 'c', 'd']; globalThis.__wlDelay = 25;
  const sp = { metadata: { version: '1' }, providers: { cpu: def },
    nodes: [{ id: 'in', type: 'input' }, { id: 'a', type: 'llm', provider: 'cpu' }, { id: 'out', type: 'output' }],
    edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'a', port: 'in' } },
            { from: { node: 'a', port: 'out' }, to: { node: 'out', port: 'in' } }] };
  const run = makeRun(sp, {}); startRun(sp, run);
  let fired = false;
  const c = makeController({ onToken: () => { if (!fired) { fired = true; setTimeout(() => requestCancel(run, null, c), 0); } } });
  await runUntilIdle(sp, run, null, null, c);
  const rec = (run.nodeRuns.a || [])[0];
  globalThis.__wlDelay = 0;
  return { status: run.status, node: rec && rec.status, errs: run.errors.length,
    delivered: run.deliveries.filter(d => d.fromNodeId === 'a').length };
}, defOf());
ok.cancel = R['③ cancel'].status === 'cancelled' && R['③ cancel'].node === 'cancelled'
  && R['③ cancel'].errs === 0 && R['③ cancel'].delivered === 0;

// ④ JSONで縛る
R['④ JSON強制'] = await p.evaluate(async def => {
  ModelManager.reset(); globalThis.__wlTokens = ['{"score": 7}'];
  const handle = await ModelManager.ensureLoaded(def, PROVIDERS.wllama, undefined, null);
  const r = await PROVIDERS.wllama.invoke({ input: { messages: [{ role: 'user', content: 'x' }] },
    model: 'stub-gguf', generation: { maxTokens: 40 }, schema: { type: 'object', required: ['score'] }, handle, onToken: () => {} });
  return { rf: globalThis.__wlOpt.response_format, out: r.output };
}, defOf());
ok.schema = R['④ JSON強制'].rf.type === 'json_schema' && R['④ JSON強制'].rf.json_schema.schema.required[0] === 'score'
  && R['④ JSON強制'].out.type === 'json' && R['④ JSON強制'].out.value.score === 7;

// ⑤ 落とせないときは理由が出る / ⑥ 別のモデルを読むと前のを片付ける
R['⑤ 落とせないとき'] = await p.evaluate(async def => {
  ModelManager.reset();
  try { await ModelManager.ensureLoaded(def, PROVIDERS.wllama, undefined, null); return { thrown: false }; }
  catch (e) { return { thrown: true, code: e.code, message: String(e.message || e).slice(0, 80) }; }
}, defOf({ url: 'https://example.test/models/boom.gguf' }));
ok.err = R['⑤ 落とせないとき'].thrown && R['⑤ 落とせないとき'].code === 'MODEL_LOAD_FAILED';

R['⑥ 片付け'] = await p.evaluate(async def => {
  ModelManager.reset(); globalThis.__wlExit = 0;
  await ModelManager.ensureLoaded(def, PROVIDERS.wllama, undefined, null);
  await ModelManager.ensureLoaded(Object.assign({}, def, { model: 'other', url: 'https://example.test/models/other.gguf' }),
    PROVIDERS.wllama, undefined, null);
  return { exits: globalThis.__wlExit, ready: Object.values(ModelManager.states).filter(x => x.status === 'ready').length };
}, defOf());
ok.single = R['⑥ 片付け'].exits >= 1 && R['⑥ 片付け'].ready === 1;

// ⑦ 同梱した本体が実ブラウザから読める（CDNに行かない）
R['⑦ 同梱本体'] = await p.evaluate(async () => {
  const u = new URL('vendor/wllama/index.js', location.href).href;
  const m = await import(u);
  const head = await fetch(new URL('vendor/wllama/wllama.wasm', location.href).href, { method: 'HEAD' });
  const c = await fetch(new URL('vendor/wllama/compat/wllama.wasm', location.href).href, { method: 'HEAD' });
  return { hasWllama: typeof m.Wllama === 'function', wasm: head.status, compat: c.status,
    version: m.Wllama.getLibllamaVersion ? m.Wllama.getLibllamaVersion() : '?' };
});
ok.vendor = R['⑦ 同梱本体'].hasWllama && R['⑦ 同梱本体'].wasm === 200 && R['⑦ 同梱本体'].compat === 200;

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
