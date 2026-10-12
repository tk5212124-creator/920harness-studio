// Tool（type:"tool" + tool:{kind}）を iPhone 相当のタッチ端末で確かめる。
//   外への通信は Playwright で横取りして返す（本物の Wikipedia・外部 API へは出ない）。
//   Embedding は同梱の Transformers.js を本物の Worker で動かし、モデルはテスト用の極小モデル
//   （tests/fixtures/embed/test/tiny-embed: 文字の埋め込みを平均するだけ。意味は分からない）を使う。
//   本物の多言語モデル（Hugging Face から取る）はこの検証環境から届かないので、ここでは確かめていない。
//
//   W  Wikipedia: 成功・0件・HTTP エラー・CORS・届かない・時間切れ・中断・許可していない接続先・JSON でない・オフライン
//   H  HTTP JSON: 大きさの上限・パラメータの差し込み・URL は入ってきた値で変わらない
//   R  Retry / Resume: 失敗したノードだけやり直す・保存した続きから動かしても通信をやり直さない
//   F  ファイル: 選ぶ画面・JSON・大きすぎ・UTF-8 でない・選んでいないと止まる・外への通信があると明示の許可を求める
//   P  許可: 実行のときに聞く・断ると通信しない・ノードの設定で取り消せる
//   U  エディタ: パレットから足す・種類を選ぶ・設定が JSON に入る・HSL と JSON の往復・古い type:"tool"
//   E  Embedding（本物の Worker）: 読み込み・次元・正規化・同じ入力で同じ結果・日本語・覚えた文・使い回し・中断・片付け・失敗
//   I  統合: 入力→概念→候補→Embedding で近さ→重複除去→MMR→判定→回答→点検→出力 ／ 入力→Wikipedia→根拠つき回答→出力
import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
const srv = http.createServer((req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const f = join(ROOT, rel === '/' ? 'harness.html' : rel);
  try { statSync(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
// 別のオリジン（localhost の別の番号）。CORS を許さない本物のサーバ（Playwright の横取りではブラウザが CORS を確かめないため）
let srv2Hits = 0;
const srv2 = http.createServer((req, res) => { srv2Hits++; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"secret":1}'); });
await new Promise(r => srv2.listen(0, '127.0.0.1', r));
const closed = http.createServer(); await new Promise(r => closed.listen(0, '127.0.0.1', r)); const closedPort = closed.address().port; await new Promise(r => closed.close(r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/* 外への通信の横取り。mode で返し方を変える */
let mode = 'ok'; const hits = [];
const WIKI = q => ({ batchcomplete: '', query: { searchinfo: { totalhits: q === '無い語' ? 0 : 2 },
  search: q === '無い語' ? [] : [{ title: '富士山', pageid: 101, snippet: '<span class="searchmatch">富士山</span>は日本一高い山', wordcount: 900, timestamp: '2026-01-01T00:00:00Z' },
                                  { title: '富士', pageid: 102, snippet: '富士は…', wordcount: 50 }] } });
await ctx.route(/^https:\/\/(ja\.wikipedia\.org|api\.example\.test|evil\.example\.test)\//, async route => {
  const req = route.request(); const u = new URL(req.url()); hits.push({ url: req.url(), mode });
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (mode === 'unreachable' || mode === 'offline') return route.abort(mode === 'offline' ? 'internetdisconnected' : 'failed');
  if (mode === 'slow') { await new Promise(r => setTimeout(r, 4000)); try { await route.fulfill({ status: 200, headers: cors, body: '{}' }); } catch {} return; }
  if (mode === '503') return route.fulfill({ status: 503, headers: cors, body: 'busy' });
  if (mode === 'badjson') return route.fulfill({ status: 200, headers: cors, body: '<html>not json</html>' });
  if (u.hostname === 'ja.wikipedia.org') {
    if (u.searchParams.get('prop') === 'extracts')
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ query: { pages: { 101: { pageid: 101, extract: '富士山は標高3776mの山。' }, 102: { pageid: 102, extract: '富士の説明。' } } } }) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(WIKI(u.searchParams.get('srsearch'))) });
  }
  if (u.hostname === 'evil.example.test') return route.fulfill({ status: 200, headers: cors, body: '{"stolen":true}' });
  if (u.pathname === '/redirect') return route.fulfill({ status: 302, headers: Object.assign({ location: 'https://evil.example.test/steal?q=' + (u.searchParams.get('q') || '') }, cors), body: '' });
  if (u.pathname === '/xss') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ x: '<img src="x" onerror="window.__xss=1">', s: '<script>window.__xss=2</script>' }) });
  if (u.pathname === '/big') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ s: 'x'.repeat(5000) }) });
  return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ items: [{ q: u.searchParams.get('q'), n: 1 }], path: u.pathname }) });
});

const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
let dialogs = [], dialogAnswer = true;
p.on('dialog', async d => { dialogs.push(d.message()); if (dialogAnswer) await d.accept(); else await d.dismiss(); });
await p.goto(`http://127.0.0.1:${srv.address().port}/harness.html`);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 180000 });
const R = {}, ok = {};
const tap = async sel => { try { await p.locator(sel).first().tap({ timeout: 8000 }); } catch (e) {
  console.error('TAP FAIL', sel, await p.evaluate(() => ({ bd: document.querySelector('#backdrop').className, sh: document.querySelector('#sheet').className, body: (document.querySelector('#sheetBody') || {}).textContent.slice(0, 200) })));
  await p.screenshot({ path: '/tmp/claude-0/-home-user-claude-shogi/e207f05c-ce45-5aeb-9f09-85f1750d6d6b/scratchpad/tapfail.png' }); throw e; } await p.waitForTimeout(150); };
const paste = async obj => { await p.evaluate(o => { const t = document.querySelector('#spec'); t.value = JSON.stringify(o, null, 1); t.dispatchEvent(new Event('input')); }, obj); await p.waitForTimeout(300); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));
const state = async () => { await p.waitForFunction(() => /^state: (success|failed|cancelled|paused|idle)/.test(document.querySelector('#stateline').textContent), null, { timeout: 30000 });
  return (await p.textContent('#stateline')).slice(0, 40); };
const logText = () => p.evaluate(() => (document.querySelector('#log') || {}).textContent || '');
const line = (id, tool, extra) => Object.assign({ metadata: { name: 't', version: '1' },
  nodes: [{ id: 'in', type: 'input' }, { id, type: 'tool', tool }, { id: 'o', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: id, port: 'in' } }, { from: { node: id, port: 'out' }, to: { node: 'o', port: 'in' } }] }, extra || {});
/* Runtime を直接回す（許可はこの端末の保存場所を触らない置き場にする） */
const run = (sp, input, opt) => p.evaluate(async ([sp, input, opt]) => {
  const E = __dbg.eng; if (opt && opt.grant) for (const o of opt.grant) E.toolNetGrant(o, 'test');
  const st = E.memStore(); const r = E.makeRun(sp, input); E.startRun(sp, r);
  const c = E.makeController({});
  const t = opt && opt.cancelAt ? setTimeout(() => E.requestCancel(r, st, c), opt.cancelAt) : null;
  const t0 = Date.now(); await E.runUntilIdle(sp, r, st, null, c);
  if (t) clearTimeout(t);
  const ex = Object.values(r.executions).find(e => e.nodeId !== 'in' && e.nodeId !== 'o');
  return { status: r.status, ms: Date.now() - t0, errors: r.errors.map(e => ({ kind: e.kind, stage: e.stage, retryable: e.retryable, message: e.message })),
    result: r.result ? r.result.value : null, totals: r.totals, exStatus: ex && ex.status,
    tool: ex && ex.attempts && ex.attempts.length ? ex.attempts[ex.attempts.length - 1].tool : null };
}, [sp, input, opt || null]);
await p.evaluate(() => { __dbg.eng.TOOL_PERM.mem = {}; });

// ---- W: Wikipedia ----
const wk = (extra) => line('wiki', Object.assign({ kind: 'wikipedia', lang: 'ja', limit: 2 }, extra || {}));
hits.length = 0; mode = 'ok';
const w0 = await run(wk(), { in: '富士山' });
R['W0 許可していない'] = { status: w0.status, err: w0.errors[0], 通信: hits.length };
ok.W0 = w0.status === 'failed' && w0.errors[0].kind === 'TOOL_PERMISSION_REQUIRED' && hits.length === 0;
const W = ['https://ja.wikipedia.org'];
hits.length = 0;
const w1 = await run(wk({ content: 'extract', extractChars: 8 }), { in: '富士山' }, { grant: W });
const q1 = hits[0] && new URL(hits[0].url).searchParams;
R['W1 成功'] = { status: w1.status, result: w1.result, 問い合わせ: q1 && Object.fromEntries(q1), 通信: hits.length, totals: { toolCalls: w1.totals.toolCalls, apiCalls: w1.totals.apiCalls }, 記録: w1.tool };
ok.W1 = w1.status === 'success' && w1.result.count === 2 && w1.result.total === 2 && w1.result.results[0].title === '富士山'
  && w1.result.results[0].pageid === 101 && w1.result.results[0].url === 'https://ja.wikipedia.org/wiki/%E5%AF%8C%E5%A3%AB%E5%B1%B1'
  && w1.result.results[0].snippet === '富士山は日本一高い山' && w1.result.results[0].extract === '富士山は標高37'
  && q1.get('action') === 'query' && q1.get('list') === 'search' && q1.get('srsearch') === '富士山' && q1.get('srlimit') === '2' && q1.get('origin') === '*'
  && hits.length === 2 && w1.totals.toolCalls === 2 && w1.totals.apiCalls === 0 && w1.tool.requests.length === 2 && w1.tool.requests.every(r => r.ok && !r.url.includes('?'));
const w2 = await run(wk(), { in: '無い語' });
R['W2 0件'] = { status: w2.status, result: w2.result };
ok.W2 = w2.status === 'success' && w2.result.count === 0 && w2.result.results.length === 0;
const errCase = async (m, extra) => { mode = m; hits.length = 0; const r = await run(wk(extra), { in: '富士山' }); mode = 'ok'; return { status: r.status, err: r.errors[0], ms: r.ms, 通信: hits.length, 記録: r.tool }; };
R['W3 HTTP 503（やり直し2回）'] = await errCase('503', { retries: 2 });
ok.W3 = R['W3 HTTP 503（やり直し2回）'].err.kind === 'TOOL_HTTP_ERROR' && R['W3 HTTP 503（やり直し2回）'].err.retryable === true
  && R['W3 HTTP 503（やり直し2回）'].通信 === 3 && R['W3 HTTP 503（やり直し2回）'].記録.retries === 2;
{ const H2 = `http://localhost:${srv2.address().port}`, H3 = `http://localhost:${closedPort}`;
  const c = await run(line('h', { kind: 'http_json', url: H2 + '/x' }), { in: 'x' }, { grant: [H2, H3] });
  const u = await run(line('h', { kind: 'http_json', url: H3 + '/x' }), { in: 'x' });
  R['W4 CORS（本物の別オリジン）'] = { err: c.errors[0], サーバに届いた: srv2Hits };
  R['W5b 届かない（閉じた番号）'] = { err: u.errors[0] };
  ok.W4 = c.errors[0].kind === 'TOOL_CORS_BLOCKED' && /推定/.test(c.errors[0].message) && srv2Hits >= 1 && u.errors[0].kind === 'TOOL_UNREACHABLE'; }
R['W5 届かない'] = await errCase('unreachable');
ok.W5 = R['W5 届かない'].err.kind === 'TOOL_UNREACHABLE';
R['W6 時間切れ（300ms）'] = await errCase('slow', { timeoutMs: 300 });
ok.W6 = R['W6 時間切れ（300ms）'].err.kind === 'TOOL_TIMEOUT' && R['W6 時間切れ（300ms）'].ms < 3000;
{ mode = 'slow'; const r = await run(wk(), { in: '富士山' }, { cancelAt: 300 }); mode = 'ok';
  R['W7 中断'] = { status: r.status, exStatus: r.exStatus, errors: r.errors, ms: r.ms, 記録: r.tool };
  ok.W7 = r.status === 'cancelled' && r.exStatus === 'cancelled' && r.errors.length === 0 && r.ms < 3000 && r.tool.cancelled === true; }
{ hits.length = 0; const r = await run(line('w', { kind: 'wikipedia', lang: 'en' }), { in: 'x' });
  R['W8 許可していない別の接続先'] = { err: r.errors[0], 通信: hits.length };
  ok.W8 = r.errors[0].kind === 'TOOL_PERMISSION_REQUIRED' && /en\.wikipedia/.test(r.errors[0].message) && hits.length === 0; }
R['W9 JSON でない'] = await errCase('badjson');
ok.W9 = R['W9 JSON でない'].err.kind === 'TOOL_BAD_JSON' && R['W9 JSON でない'].err.stage === 'parse';
await ctx.setOffline(true); R['W10 オフライン'] = await errCase('offline'); await ctx.setOffline(false);
ok.W10 = R['W10 オフライン'].err.kind === 'TOOL_OFFLINE';

// ---- H: HTTP JSON ----
const A = ['https://api.example.test'];
{ hits.length = 0;
  const h1 = await run(line('h', { kind: 'http_json', url: 'https://api.example.test/v1/items', params: { q: '{{{in}}}', lang: 'ja' }, pick: 'items.0' }), { in: 'https://evil.example/' }, { grant: A });
  const h2 = await run(line('h', { kind: 'http_json', url: 'https://api.example.test/big', maxBytes: 1000 }), { in: 'x' });
  const v = await p.evaluate(() => [__dbg.eng.validate({ nodes: [{ id: 'h', type: 'tool', tool: { kind: 'http_json', url: 'http://api.example.test/' } }], edges: [] }),
    __dbg.eng.validate({ nodes: [{ id: 'h', type: 'tool', tool: { kind: 'http_json', url: 'https://u:p@api.example.test/' } }], edges: [] }),
    __dbg.eng.validate({ nodes: [{ id: 'h', type: 'tool', tool: { kind: 'http_json', url: 'https://api.example.test/', timeoutMs: 999999, retries: 9 } }], edges: [] })]);
  R['H1 差し込み・pick'] = { result: h1.result, 送った先: hits.map(h => h.url) };
  R['H2 大きすぎ'] = h2.errors[0]; R['H3 検証'] = v;
  ok.H = h1.status === 'success' && h1.result.data.q === 'https://evil.example/' && h1.result.trusted === false
    && hits.filter(h => h.url.includes('/v1/items')).length === 1 && new URL(hits[0].url).origin === 'https://api.example.test' && new URL(hits[0].url).pathname === '/v1/items'
    && h2.errors[0].kind === 'TOOL_TOO_LARGE'
    && v[0].some(m => m.includes('https')) && v[1].some(m => m.includes('パスワード')) && v[2].some(m => m.includes('timeoutMs')) && v[2].some(m => m.includes('retries')); }

// 転送は追わない（許可していない接続先へ行かない）
{ hits.length = 0; const r = await run(line('h', { kind: 'http_json', url: 'https://api.example.test/redirect', params: { q: '{{{in}}}' } }), { in: '秘密' });
  R['H4 転送'] = { err: r.errors[0], 通信: hits.map(h => new URL(h.url).hostname) };
  ok.H4 = r.errors[0] && r.errors[0].kind === 'TOOL_REDIRECT_BLOCKED' && !hits.some(h => h.url.includes('evil.example.test')); }

// ---- R: Retry / Resume ----
{ const sp = wk();
  const r = await p.evaluate(async ([sp]) => {
    const E = __dbg.eng; const st = E.memStore(); const out = {};
    window.__setMode && 0;
    const run = E.makeRun(sp, { in: '富士山' }); E.startRun(sp, run);
    let g = 0; while (run.status === 'running' && g++ < 50) await E.processOneWorkItem(sp, run, st, null);
    out.first = { status: run.status, err: run.errors[0] && run.errors[0].kind };
    return out; }, [sp]);
  // いったん 503 にして失敗させてから、直して Retry
  mode = '503';
  const rr = await p.evaluate(async ([sp]) => { const E = __dbg.eng; const st = E.memStore();
    const run = E.makeRun(sp, { in: '富士山' }); E.startRun(sp, run);
    let g = 0; while (run.status === 'running' && g++ < 50) await E.processOneWorkItem(sp, run, st, null);
    window.__keepRun = { run, st }; return { status: run.status, err: run.errors[0] && run.errors[0].kind }; }, [sp]);
  mode = 'ok'; hits.length = 0;
  const rt = await p.evaluate(async ([sp]) => { const E = __dbg.eng; const { run, st } = window.__keepRun;
    const failed = Object.values(run.executions).find(e => e.status === 'failed');
    await E.retryExecution(sp, run, failed.execId, st, null);
    return { status: run.status, attempts: failed.attempts.length, result: run.result && run.result.value.count, toolCalls: run.totals.toolCalls }; }, [sp]);
  const retryHits = hits.length; hits.length = 0;
  const rs = await p.evaluate(async ([sp]) => { const E = __dbg.eng; const st = E.memStore();
    const run = E.makeRun(sp, { in: '富士山' }); E.startRun(sp, run); let g = 0;
    while (run.status === 'running' && g++ < 50) { await E.processOneWorkItem(sp, run, st, null);
      if (run.workQueue[0] && run.workQueue[0].phase === 'route' && run.workQueue[0].execId.startsWith('wiki@')) break; }
    const snap = JSON.parse(JSON.stringify(st.value)); const st2 = E.memStore(); st2.value = snap; const cp = st2.load();
    const before = cp.totals.toolCalls; await E.resumeRun(sp, cp, st2, null);
    return { status: cp.status, before, after: cp.totals.toolCalls, count: cp.result && cp.result.value.count }; }, [sp]);
  R['R Retry'] = { 失敗: rr, やり直し: rt, やり直しの通信: retryHits }; R['R Resume'] = Object.assign(rs, { 続きでの通信: hits.length - 1 });
  ok.R = rr.status === 'failed' && rr.err === 'TOOL_HTTP_ERROR' && rt.status === 'success' && rt.attempts === 2 && rt.result === 2 && retryHits === 1
    && rs.status === 'success' && rs.before === 1 && rs.after === 1 && rs.count === 2 && hits.length === 1; }

// ---- U: エディタ（パレットから足す・種類・設定・往復） ----
await paste({ metadata: { name: 'ed', version: '1' }, nodes: [{ id: 'in', type: 'input' }, { id: 'o', type: 'output' }], edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'o', port: 'in' } }] });
await tap('#viewSeg button[data-v="editor"]');
const paletteHas = (await p.locator('#addNode').count()) === 1;
{ await tap('#addNode'); await p.waitForTimeout(200);
  const btn = p.locator('[data-add="tool"]'); R['U パレットに Tool'] = await btn.count();
  await btn.first().tap(); await p.waitForTimeout(400); }
let sp1 = await spec(); const toolNode = sp1.nodes.find(n => n.type === 'tool');
R['U 足したノード'] = toolNode;
await tap('#shClose').catch(() => {});
await tap(`.nd[data-id="${toolNode.id}"]`);
await p.selectOption('select[data-f="__tkind"]', 'similarity'); await p.waitForTimeout(300);
await p.fill('input[data-f="tool.threshold"]', '0.4'); await p.waitForTimeout(200);
await p.selectOption('select[data-f="tool.model"]', 'mock'); await p.waitForTimeout(300);
const kindOpts = await p.locator('select[data-f="__tkind"] option').allTextContents();
const sheetTxt = await p.locator('#sheetBody').textContent();
await tap('#shClose').catch(() => {});
sp1 = await spec(); const tn = sp1.nodes.find(n => n.id === toolNode.id);
const rt = await p.evaluate(sp => { const E = __dbg.eng; const h = E.specToHSL(sp); const back = E.hslToSpec(h);
  return { hsl: h.split('\n').filter(l => l.includes('tool')), back }; }, sp1);
{ const c = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
  rt.same = c(rt.back.nodes) === c(sp1.nodes); delete rt.back; }
const legacyRev = await p.evaluate(() => __dbg.eng.reviewSpec({ nodes: [{ id: 'in', type: 'input' }, { id: 't', type: 'tool', tool: { kind: 'wikipedia', foo: 1 }, provider: 'x' }, { id: 'o', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 't', port: 'in' } }, { from: { node: 't', port: 'out' }, to: { node: 'o', port: 'in' } }] }).map(x => x.message));
R['U 設定'] = { tool: tn.tool, 選べる種類: kindOpts, HSL: rt, 診断: legacyRev };
ok.U = paletteHas && R['U パレットに Tool'] === 1 && toolNode.tool.kind === 'wikipedia' && tn.tool.kind === 'similarity' && tn.tool.threshold === 0.4
  && tn.tool.model === 'mock' && tn.tool.query === '{{{run_input.in}}}' && kindOpts.length === 7 && /正しさや確率ではない/.test(sheetTxt)
  && rt.same && legacyRev.some(m => m.includes('foo')) && legacyRev.some(m => m.includes('provider'));

// ---- P: 実行のときの許可（画面から） ----
await p.evaluate(() => { __dbg.eng.TOOL_PERM.mem = null; try { localStorage.removeItem('harness_tool_net_v1'); } catch (_) {} });
await paste(wk());
dialogs = []; dialogAnswer = false; hits.length = 0;
await tap('#run'); await p.waitForTimeout(800);
const deny = { dialogs: dialogs.slice(), 通信: hits.length, log: (await logText()).includes('許可しなかった') };
dialogs = []; dialogAnswer = true;
await tap('#run'); const stOk = await state();
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('harness_tool_net_v1') || '{}'));
dialogs = []; await tap('#run'); await state(); const askedAgain = dialogs.length;
await tap('#viewSeg button[data-v="editor"]'); await tap('.nd[data-id="wiki"]');
const permTxt = await p.locator('#sheetBody').textContent();
await tap('#tlNet'); const afterRevoke = await p.evaluate(() => JSON.parse(localStorage.getItem('harness_tool_net_v1') || '{}'));
await tap('#shClose').catch(() => {});
R['P 許可'] = { 断った: deny, 許した: stOk, 保存: Object.keys(stored.origins || {}), 二回目に聞いた: askedAgain, 取り消し後: Object.keys(afterRevoke.origins || {}) };
ok.P = deny.dialogs.length === 1 && deny.dialogs[0].includes('https://ja.wikipedia.org') && deny.通信 === 0 && deny.log
  && /success/.test(stOk) && (stored.origins || {})['https://ja.wikipedia.org'] && askedAgain === 0
  && /許可している/.test(permTxt) && !(afterRevoke.origins || {})['https://ja.wikipedia.org'];

// ---- X: 外から来た値に HTML・JavaScript が入っていても動かない（画面には文字として出る） ----
await paste(line('h', { kind: 'http_json', url: 'https://api.example.test/xss' }));
dialogs = []; dialogAnswer = true; await tap('#run'); const stX = await state();
await tap('#viewSeg button[data-v="editor"]'); await p.waitForTimeout(300);
const xss = await p.evaluate(() => ({ flag: window.__xss === undefined ? null : window.__xss, imgs: document.querySelectorAll('img[src="x"]').length,
  scripts: [...document.querySelectorAll('script')].filter(s => s.textContent.includes('__xss')).length,
  shown: (document.querySelector('#ioOut') || {}).textContent.includes('<img src') }));
R['X XSS'] = Object.assign({ state: stX }, xss);
ok.X = /success/.test(stX) && xss.flag === null && xss.imgs === 0 && xss.scripts === 0 && xss.shown;
await tap('#viewSeg button[data-v="json"]').catch(() => {});

// ---- F: ファイル ----
const fsp = (id, extra, more) => { const s = line(id, Object.assign({ kind: 'file', format: 'json' }, extra || {})); if (more) more(s); return s; };
await paste(fsp('f1'));
dialogs = []; await tap('#run'); await p.waitForTimeout(500);
const fileSheet = await p.locator('#sheetBody').textContent();
const notSelectedState = (await p.textContent('#stateline')).slice(0, 30);
await p.setInputFiles('[data-tf="f1"]', { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ 名前: '富士', n: 3 })) });
await p.waitForTimeout(300);
const fileStatus = await p.locator('[data-tfs="f1"]').textContent();
await tap('#tfRun'); const stF1 = await state();
const outF1 = await p.evaluate(() => __dbg.run().result.value);
// 大きすぎ・UTF-8 でない・JSON でない（ノードの設定から選ぶ）
const closeAny = async () => { if (await p.locator('#backdrop.show').count()) { R['開いていた画面'] = (R['開いていた画面'] || []).concat([(await p.locator('#sheetBody').textContent()).slice(0, 60)]); await p.locator('#shClose').first().tap({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(150); } };
const fileErr = async (id, extra, buf, name) => { await closeAny(); await paste(fsp(id, extra)); await tap('#viewSeg button[data-v="editor"]'); await tap(`.nd[data-id="${id}"]`);
  await p.setInputFiles(`[data-tf="${id}"]`, { name, mimeType: 'text/plain', buffer: buf }); await p.waitForTimeout(300);
  const s = await p.locator(`[data-tfs="${id}"]`).textContent(); await tap('#shClose').catch(() => {});
  await closeAny();
  await tap('#run'); await state(); return { 表示: s, err: await p.evaluate(() => __dbg.run().errors[0] && __dbg.run().errors[0].kind) }; };
R['F2 大きすぎ'] = await fileErr('f2', { maxBytes: 10 }, Buffer.from('x'.repeat(50)), 'big.txt');
R['F3 UTF-8 でない'] = await fileErr('f3', { format: 'text' }, Buffer.from([0x82, 0xa0, 0xff, 0xfe, 0x41]), 'sjis.txt');
R['F4 JSON でない'] = await fileErr('f4', {}, Buffer.from('{oops'), 'x.json');
// ファイルと外への通信が同じハーネスにある → 明示の許可を求める
await paste(fsp('f1', {}, s => { s.nodes.splice(2, 0, { id: 'w', type: 'tool', tool: { kind: 'wikipedia', lang: 'ja', query: '{{{in}}}' } });
  s.edges = [{ from: { node: 'in', port: 'out' }, to: { node: 'f1', port: 'in' } }, { from: { node: 'f1', port: 'out' }, to: { node: 'w', port: 'in' } }, { from: { node: 'w', port: 'out' }, to: { node: 'o', port: 'in' } }]; }));
await p.evaluate(() => __dbg.eng.toolNetGrant('https://ja.wikipedia.org', 'test'));
dialogs = []; dialogAnswer = false; hits.length = 0; await tap('#run'); await p.waitForTimeout(600);
const sendDeny = { dialogs: dialogs.slice(), 通信: hits.length };
dialogs = []; dialogAnswer = true; await tap('#run'); const stSend = await state();
R['F1 JSON'] = { 選ぶ画面: fileSheet.slice(0, 80), 実行前の状態: notSelectedState, 表示: fileStatus, 結果: outF1, state: stF1 };
R['F5 外へ出るかも'] = { 断った: sendDeny, 許した: stSend, 聞いた文: dialogs[0] && dialogs[0].slice(0, 80) };
ok.F = /ファイルを選ぶ/.test(fileSheet) && /読めた/.test(fileStatus) && /success/.test(stF1) && outF1.name === 'a.json' && outF1.data.名前 === '富士' && outF1.size > 0
  && R['F2 大きすぎ'].err === 'TOOL_FILE_TOO_LARGE' && R['F3 UTF-8 でない'].err === 'TOOL_BAD_ENCODING' && R['F4 JSON でない'].err === 'TOOL_BAD_JSON'
  && sendDeny.dialogs.length === 1 && /ファイル/.test(sendDeny.dialogs[0]) && sendDeny.通信 === 0 && /success/.test(stSend);

// ---- E: Embedding（同梱の Transformers.js を本物の Worker で） ----
await p.evaluate(() => { const E = __dbg.eng; E.TOOL_PERM.mem = {};
  E.EMBED_MODELS.push({ id: 'test/tiny-embed', label: 'テスト用の極小モデル', dims: 32, dtype: 'fp32' });
  E.EMBED_MODELS.push({ id: 'test/missing', label: '無いモデル', dims: 32, dtype: 'fp32' });
  E.EmbeddingManager.localModelPath = 'tests/fixtures/embed/'; E.EmbeddingManager.allowRemote = false; });
const T = 'test/tiny-embed';
const e1 = await run(line('e', { kind: 'embed', model: T }), { in: ['富士山', '富士山は日本の山', 'ねこ', 'いぬ'] });
const e1b = await run(line('e', { kind: 'embed', model: T }), { in: ['富士山', '富士山は日本の山', 'ねこ', 'いぬ'] });
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const v = e1.result && e1.result.vectors;
R['E1 読み込み・次元・正規化'] = v && { dims: e1.result.dims, count: e1.result.count, ノルム: v.map(x => Math.hypot(...x).toFixed(4)),
  '富士山↔富士山は日本の山': cos(v[0], v[1]).toFixed(3), '富士山↔ねこ': cos(v[0], v[2]).toFixed(3), 'ねこ↔いぬ': cos(v[2], v[3]).toFixed(3), 記録: e1.tool, ms: e1.ms };
R['E2 2回目'] = { 同じ: JSON.stringify(e1b.result) === JSON.stringify(e1.result), 記録: e1b.tool, totals: { embedCalls: e1b.totals.embedCalls, embedCacheHits: e1b.totals.embedCacheHits } };
ok.E1 = e1.status === 'success' && e1.result.dims === 32 && e1.result.count === 4 && v.every(x => Math.abs(Math.hypot(...x) - 1) < 1e-3)
  && cos(v[0], v[1]) > cos(v[0], v[2]) && cos(v[2], v[3]) < 0.999 && e1.tool.embed.loadMs > 0 && e1.tool.embed.modelReused === false;
ok.E2 = e1b.status === 'success' && JSON.stringify(e1b.result) === JSON.stringify(e1.result) && !e1b.totals.embedCalls && e1b.totals.embedCacheHits === 4
  && e1b.tool.embed.modelReused === true && e1b.tool.embed.loadMs === 0;
const mainLoaded = await p.evaluate(() => ({ main: performance.getEntriesByType('resource').filter(e => /transformers|ort-wasm|embed-worker/.test(e.name)).map(e => e.name.replace(/^.*\//, '') + ':' + e.initiatorType), worker: !!__dbg.eng.EmbeddingManager.worker,
  llmEngines: Object.keys(__dbg.eng.ModelManager.states || {}).length }));
R['E3 別スレッド'] = mainLoaded;
// 画面のスレッドは Transformers.js を import しない（harness.html に import が無い）。読むのは embed-worker.js だけ。
// ※ Chromium は Worker の module の取得も画面側の Resource Timing に出すので、それでは見分けない
mainLoaded.htmlImports = /import[^\n]*transformers/.test(readFileSync(join(ROOT, 'harness.html'), 'utf8'));
mainLoaded.workerImports = /from "\.\/vendor\/transformers\/transformers\.min\.js"/.test(readFileSync(join(ROOT, 'embed-worker.js'), 'utf8'));
ok.E3 = !mainLoaded.htmlImports && mainLoaded.workerImports && mainLoaded.worker && mainLoaded.llmEngines === 0;
const cands = ['富士山の高さ', '富士山は高い', '猫の飼い方', '京都の寺', '富士山の高さ'];
const s1 = await run(line('s', { kind: 'similarity', model: T, query: '富士山の高さ', topK: 3 }), { in: cands });
const d1 = await run(line('d', { kind: 'dedupe', model: T, threshold: 0.99 }), { in: cands });
const m1 = await run(line('m', { kind: 'mmr', model: T, query: '富士山の高さ', k: 3, lambda: 0.5 }), { in: cands });
R['E4 近さ・重複・MMR'] = { ranking: s1.result && s1.result.ranking, top: s1.result && s1.result.top.map(x => [x.index, x.score]),
  removed: d1.result && d1.result.removed, kept: d1.result && d1.result.keptIndex, mmr: m1.result && m1.result.order };
ok.E4 = s1.status === 'success' && s1.result.results.map(r => r.index).join() === '0,1,2,3,4' && s1.result.top[0].score > 0.999 && s1.result.top.length === 3
  && d1.status === 'success' && d1.result.removed.some(x => x.index === 4 && x.duplicateOf === 0) && !d1.result.keptIndex.includes(4)
  && m1.status === 'success' && [0, 4].includes(m1.result.order[0]) && m1.result.order.length === 3;
// 中断（Worker の返事を遅らせて、その間に止める）
const ab = await p.evaluate(async () => { const M = __dbg.eng.EmbeddingManager; const orig = M.call.bind(M); window.__keepCall = M.call;
  M.call = (msg, ...a) => msg.type === 'embed' ? new Promise(r => setTimeout(r, 800)).then(() => orig(msg, ...a)) : orig(msg, ...a); return true; });
const eAb = await run(line('e', { kind: 'embed', model: T }), { in: ['中断する文その1', '中断する文その2'] }, { cancelAt: 200 });
await p.evaluate(() => { __dbg.eng.EmbeddingManager.call = window.__keepCall; });
R['E5 中断'] = { status: eAb.status, ex: eAb.exStatus, errors: eAb.errors, ms: eAb.ms };
ok.E5 = ab && eAb.status === 'cancelled' && eAb.exStatus === 'cancelled' && eAb.errors.length === 0 && eAb.ms < 600;
// 片付け → 次はまた読み込む
await p.evaluate(() => __dbg.eng.EmbeddingManager.dispose());
const afterDispose = await p.evaluate(() => __dbg.eng.EmbeddingManager.status());
const e6 = await run(line('e', { kind: 'embed', model: T }), { in: '片付けたあと' });
R['E6 片付け'] = { 片付けた直後: afterDispose, 読み直し: e6.tool && e6.tool.embed };
ok.E6 = afterDispose.loaded.length === 0 && !afterDispose.worker && afterDispose.cacheSize === 0 && e6.status === 'success' && e6.tool.embed.loadMs > 0 && e6.result.vector.length === 32;
// 読み込めない・メモリが足りない
const e7 = await run(line('e', { kind: 'embed', model: 'test/missing' }), { in: 'x' });
await p.evaluate(() => { const M = __dbg.eng.EmbeddingManager; window.__keepLoad = M.load; M.load = async () => { throw new Error('RangeError: WebAssembly.Memory(): could not allocate memory'); }; });
const e8 = await run(line('e', { kind: 'embed', model: 'test/missing' }), { in: 'x' });
await p.evaluate(() => { __dbg.eng.EmbeddingManager.load = window.__keepLoad; });
const e9 = await run(line('e', { kind: 'embed', model: 'nope/unknown' }), { in: 'x' });
R['E7 失敗'] = { 無いモデル: e7.errors[0], メモリ: e8.errors[0], 知らないモデル: e9.errors[0] };
ok.E7 = e7.errors[0].kind === 'EMBED_MODEL_LOAD_FAILED' && e7.errors[0].stage === 'model_load' && e8.errors[0].kind === 'EMBED_RESOURCE_EXHAUSTED'
  && e9.status === 'failed' && /知らない Embedding モデル/.test(JSON.stringify(e9.errors));

// ---- I: 統合（例を画面で選び、Provider だけ mock・Embedding だけ極小モデルにして動かす） ----
await tap('#exSeg3 button[data-ex="exT2"]');
let s2 = await spec();
const mocks = { concepts: { fixed: { concepts: ['富士山', '高さ'] } }, ideas: { fixed: { candidates: ['富士山の標高', '富士山の高さは何メートルか', '富士山の高さは何メートルか', '富士山の登山道', '日本の山の高さ比べ', '猫の飼い方'] } },
  judge: { fixed: { use: ['富士山の標高'], reason: 'r' } }, answer: { echoPrompt: true }, check: { fixed: { ok: true } } };
for (const n of s2.nodes) { if (mocks[n.id]) { delete n.provider; n.mock = mocks[n.id]; } if (n.tool && n.tool.model) n.tool.model = T; }
delete s2.providers;
await paste(s2);
await tap('#run'); const stI1 = await state();
if (!/success/.test(stI1)) console.error('I1', stI1, await p.evaluate(() => JSON.stringify(__dbg.run().errors)));
const i1 = await p.evaluate(() => { const r = __dbg.run(); const ex = id => Object.values(r.executions).find(e => e.nodeId === id);
  const req = ex('judge').attempts[0].request.messages.map(m => m.content).join('\n');
  const val = id => { const h = (r.nodeRuns[id] || []).slice(-1)[0]; return h && h.out ? h.out.value : null; };
  return { status: r.status, near: val('near').ranking, uniq: val('uniq').removed, pick: val('pick').selected.map(x => x.text),
    judgeAsked: req, result: r.result.value, totals: r.totals }; });
const exportJSON = await spec();
const canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
const roundtrip = await p.evaluate(sp => { const E = __dbg.eng; return { v: E.validate(sp), back: E.hslToSpec(E.specToHSL(sp)) }; }, exportJSON);
roundtrip.same = canon(roundtrip.back.nodes) === canon(exportJSON.nodes) && canon(roundtrip.back.edges) === canon(exportJSON.edges); delete roundtrip.back;
R['I1 Embedding の流れ'] = { state: stI1, 近さの順: i1.near, 重複: i1.uniq, 選んだ: i1.pick, 判定に送った文の長さ: i1.judgeAsked.length,
  結果: String(i1.result).slice(0, 160), 使用量: { apiCalls: i1.totals.apiCalls, embedCalls: i1.totals.embedCalls, embedTexts: i1.totals.embedTexts, embedCacheHits: i1.totals.embedCacheHits }, 往復: roundtrip };
ok.I1 = /success/.test(stI1) && i1.uniq.length >= 1 && i1.pick.length >= 1 && i1.pick.length <= 4 && !/vector/.test(i1.judgeAsked) && i1.judgeAsked.length < 2000
  && /富士山の標高/.test(String(i1.result)) && i1.totals.apiCalls === 5 && i1.totals.embedCalls > 0 && roundtrip.v.length === 0 && roundtrip.same;
await tap('#exSeg3 button[data-ex="exT1"]');
let s3 = await spec();
for (const n of s3.nodes) if (n.id === 'answer') { delete n.provider; n.mock = { echoPrompt: true }; }
delete s3.providers;
await paste(s3);
dialogs = []; dialogAnswer = true; hits.length = 0;
await tap('#run'); const stI2 = await state();
const i2 = await p.evaluate(() => { const r = __dbg.run(); return { status: r.status, result: r.result && r.result.value, totals: r.totals }; });
R['I2 Wikipedia の流れ'] = { state: stI2, 結果: String(i2.result).slice(0, 240), 通信: hits.length, 使用量: { toolCalls: i2.totals.toolCalls, apiCalls: i2.totals.apiCalls } };
ok.I2 = /success/.test(stI2) && /富士山は標高3776mの山/.test(String(i2.result)) && /https:\/\/ja\.wikipedia\.org\/wiki\//.test(String(i2.result))
  && i2.totals.toolCalls === 2 && i2.totals.apiCalls === 1;

// samples/ の JSON・HSL が画面の例と同じ（取り込めば同じハーネスになる）
{ const res = [];
  for (const [k, f] of [['exT1', 'tool-wikipedia-answer'], ['exT2', 'tool-embedding-select']]) {
    await tap(`#exSeg3 button[data-ex="${k}"]`); const now = await spec();
    const js = JSON.parse(readFileSync(join(ROOT, 'samples', f + '.json'), 'utf8'));
    const fromHsl = await p.evaluate(t => __dbg.eng.hslToSpec(t), readFileSync(join(ROOT, 'samples', f + '.hsl'), 'utf8'));
    const v = await p.evaluate(sp => __dbg.eng.validate(sp), js);
    res.push({ f, json: canon([js.nodes, js.edges]) === canon([now.nodes, now.edges]), hsl: canon([fromHsl.nodes, fromHsl.edges]) === canon([now.nodes, now.edges]), 検証: v }); }
  R['samples'] = res; ok.samples = res.every(r => r.json && r.hsl && r.検証.length === 0); }
R['ページのエラー'] = errs;
ok.noPageErrors = errs.length === 0;
console.log(JSON.stringify(R, null, 1));
console.log(JSON.stringify(ok));
const pass = Object.values(ok).every(Boolean);
console.log(pass ? 'ALL PASS' : 'FAIL: ' + Object.entries(ok).filter(([, v]) => !v).map(([k]) => k).join(', '));
await b.close(); srv.close(); srv2.close();
process.exit(pass ? 0 : 1);
