// このサイト自身がモデルを配っているとき（models_index.json がある）、
// 重みの取得先がそのサイトになることを、実際の通信を見て確かめる。
import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json' };
const INDEX = JSON.stringify({ models: [
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', path: 'models/SmolLM2-360M-Instruct-q4f16_1-MLC/resolve/main/', mb: 376, from: 'mlc-ai/SmolLM2-360M-Instruct-q4f16_1-MLC' }] });
const asked = [];
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  asked.push(p);
  if (p === '/models_index.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(INDEX); }
  if (p.startsWith('/models/')) { res.writeHead(404); return res.end('404'); }   // 実体は置かない（取りに来る先だけ見る）
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, '') === '/' ? 'harness.html' : p.slice(1));
  try {
    if (!statSync(file).isFile()) throw new Error('nf');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'] });
const p = await (await b.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${PORT}/harness.html`);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
await p.waitForFunction(() => window.siteModels === undefined || document.querySelector('#mdlList').textContent.includes('このサイトから取れる'), null, { timeout: 15000 }).catch(() => {});
const R = {}, ok = {};

// ① 一覧を読んで、モデルパネルに「このサイトから取れる」が出る
R['① パネルの表示'] = (await p.textContent('#mdlList')).includes('このサイトから取れる');
ok.listed = R['① パネルの表示'] === true;

// ② ノード編集のモデル一覧にも「このサイトから取れる」が出る
await p.click('.nd[data-id="write"]');
await p.waitForTimeout(300);
R['② ノード編集の選択肢'] = await p.locator('[data-f="__prov"] option').allTextContents();
const opts = await p.locator('[data-f="model"] option').allTextContents();
R['② モデルの選択肢'] = opts.filter(t => /SmolLM2-360M|Qwen2\.5-0\.5B-Instruct-q4f16/.test(t));
ok.def = R['② モデルの選択肢'].some(t => t.includes('SmolLM2-360M') && t.includes('このサイトから取れる'))
  && R['② モデルの選択肢'].some(t => t.includes('Qwen2.5-0.5B-Instruct-q4f16') && !t.includes('このサイトから取れる'));
await p.click('#shClose');

// ③ ダウンロードを押すと、このサイトに取りに行く（HuggingFaceではない）
asked.length = 0;
await p.click('#mdlList .mrow button[data-act="get"]');
await p.waitForFunction(() => /✗|✔|秒/.test(document.querySelector('#mdlMsg').textContent), null, { timeout: 60000 });
R['③ 結果'] = (await p.textContent('#mdlMsg')).replace(/\s+/g, ' ').slice(0, 90);
R['③ 取りに行った先'] = [...new Set(asked.filter(u => u.startsWith('/models/')))].slice(0, 3);
ok.fetched = R['③ 取りに行った先'].some(u => u.includes('/models/SmolLM2-360M-Instruct-q4f16_1-MLC/resolve/main/'));

// ④ 配っていない端末（models_index.json が無い）では、今までどおり何も足さない
const p2 = await (await b.newContext()).newPage();
await p2.route('**/models_index.json', r => r.fulfill({ status: 404, body: 'no' }));
await p2.goto(`http://127.0.0.1:${PORT}/harness.html`);
await p2.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
await p2.waitForTimeout(500);
R['④ 配っていないとき'] = (await p2.textContent('#mdlList')).includes('このサイトから取れる');
ok.absent = R['④ 配っていないとき'] === false;
await p2.close();

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
