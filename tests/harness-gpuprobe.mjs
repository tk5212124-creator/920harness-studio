// GPU の見張り（Worker の中）が、本物の WebGPU で動くこと。
// WebLLM は GPU の確保・device の喪失・拾われなかったエラーを Worker の中の console に出すだけで、
// アプリに知らせない。そこで同じ見張りを Worker の頭に入れて、別の口で記録へ送る。
// ここでは同じ見張りの文を入れた Worker で、本物の WebGPU（swiftshader）を動かして確かめる:
//   device の取得と上限 / 大きな確保の前と後（確保中の量・最大） / 解放 / 検証エラー / Worker の console.error / device の喪失
// さらに、同梱の WebLLM を本物の Worker で起こし、WebLLM への命令が同じ口で届くことも見る（重みはこの環境では取れない）。
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
const URL0 = `http://127.0.0.1:${srv.address().port}/harness.html`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'] });
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(URL0);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 90000 });
const R = {}, ok = {};
R['① 見張りの Worker'] = await p.evaluate(async () => {
  window.__bb.clear(); window.__bb.push('run', { tag: 'gpu-probe' });
  const src = window.__dbg.eng.workerProbeSrc() +
    "self.onmessage=async e=>{const d=e.data;if(d&&d.__hsPort){__hsSetPort(e.ports[0]);return;}\n" +
    " const a=await navigator.gpu.requestAdapter();const dev=await a.requestDevice();\n" +
    " const big=dev.createBuffer({size:32*1024*1024,usage:GPUBufferUsage.STORAGE});\n" +
    " dev.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE});\n" +
    " big.destroy();\n" +
    " dev.createBuffer({size:16,usage:0});\n" +
    " console.error('Device lost, calling Instance.dispose() (試験)');\n" +
    " setTimeout(()=>dev.destroy(),300);\n" +
    " setTimeout(()=>self.postMessage('done'),900);};\n";
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
  const ch = new MessageChannel(); ch.port1.onmessage = ev => window.__dbg.eng.bbWorkerEvent(ev.data);
  w.postMessage({ __hsPort: 1 }, [ch.port2]);
  await new Promise(r => { w.onmessage = ev => { if (ev.data === 'done') r(); }; w.postMessage('go'); });
  await new Promise(r => setTimeout(r, 300));
  const rd = window.__bb.read();
  return { 行: rd.rows.filter(x => x.e !== 'run').map(x => x.e + (x.st ? '(' + x.st + ')' : '')),
    確保後: rd.rows.find(x => x.e === 'gpu' && x.st === '確保後') || null,
    喪失: rd.rows.find(x => x.e === 'glost') || null, エラー: rd.rows.find(x => x.e === 'gerr') || null,
    最後: rd.gpu };
});
const a = R['① 見張りの Worker'];
ok.device = a.行.includes('gdevreq') && a.行.includes('gdev');
ok.alloc = a.行.indexOf('gpu(確保前)') >= 0 && a.行.indexOf('gpu(確保前)') < a.行.indexOf('gpu(確保後)')
  && a.確保後.mb === 32 && a.確保後.liveMB === 32 && a.確保後.peakMB === 32;
ok.released = a.最後 && a.最後.liveMB === 0 && a.最後.peakMB === 32;
ok.uncaptured = !!a.エラー && a.エラー.type === 'GPUValidationError';
ok.workerConsole = a.行.includes('wlog');
ok.lost = !!a.喪失 && a.喪失.reason === 'destroyed' && a.喪失.peakMB === 32;

// ② 同梱の WebLLM を本物の Worker で起こす（重みは取れないので読み込みは失敗する。命令が届くところまで）
R['② 同梱WebLLMのWorker'] = await p.evaluate(async () => {
  window.__bb.clear(); window.__bb.push('run', { tag: 'webllm-worker' });
  let err = null;
  try { await window.__dbg.eng.PROVIDERS.webllm.ensureLoaded({ adapter: 'webllm', model: 'SmolLM2-360M-Instruct-q4f32_1-MLC', stallMs: 20000 }, () => {}, undefined); }
  catch (e) { err = e && e.code; }
  await new Promise(r => setTimeout(r, 500));
  return { err, 届いた命令: window.__bb.read().rows.filter(x => x.e === 'wmsg').map(x => x.kind) };
});
ok.webllmWorker = ['setAppConfig', 'setLogLevel', 'reload'].every(k => R['② 同梱WebLLMのWorker'].届いた命令.includes(k));

for (const [k, v] of Object.entries(R)) console.log(k + ': ' + JSON.stringify(v));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
