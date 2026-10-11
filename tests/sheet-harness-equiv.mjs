// 「方眼で動かす」: 同じハーネスを harness.html で走らせた結果と、方眼の数式にして走らせた結果が同じになるか。
// 実ハーネス v13.1（LLM 7種・Map 2つ・計算 11・点検）の provider を、同じオリジンに立てた OpenAI 互換のスタブへ向ける。
// スタブは送られた文だけから決まった答えを返す（同じ文には同じ答え）。
//   ① 変換が止まらない（断る理由が0件）・変換の数式が読める
//   ② ふつうの回: harness が送った文の集まり ＝ 方眼が送った文の集まり、各ノードの値・出力が一致
//   ③ 失敗の回: 連想の答えが途中で切れる（onTruncate:"use" で閉じ直す）、Judge が JSON でない（onBadOutput:"retry" で2回聞き直して
//      onError:"value" の値になる）。呼んだ回数・各ノードの値・出力が一致
//   ④ 画面から: 「方眼で動かす」→「方眼シートで開く」で、別のタブに方眼シートが開き、シートが1枚増える（今あるシートはそのまま）
//   ⑤ 写した関数が harness.html と一字一句同じ（tools/sync-harness-copy.mjs --check）
//   ⑥ 方眼で同じに動かせないハーネスは、理由を付けて断る
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const v13 = JSON.parse(fs.readFileSync(ROOT + '/tests/fixtures/v13.1-token-association.json', 'utf8'));

let mode = 'normal'; let log = [];
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return h; };
const VOC = ['読書', '映画鑑賞', '料理', 'パズル', 'ストレッチ', '日記', '音楽', '片付け', 'ボードゲーム', 'お菓子作り', '手紙', '昼寝'];
function answer(body) {
  const user = body.messages[body.messages.length - 1].content, h = hash(JSON.stringify(body.messages));
  const pick = (n, off) => Array.from({ length: n }, (_, i) => VOC[(h + off + i * 5) % VOC.length]);
  if (user.includes('conceptTokensだけ')) return JSON.stringify({ conceptTokens: ['雨の日', '家', 'できること'] });
  if (user.includes('wordsだけ')) {
    const t = JSON.stringify({ words: pick(6, 0) });
    if (mode === 'faults') return { text: t.slice(0, 30), fin: 'length' };       // 途中で切れる
    return t; }
  if (user.includes('tokenScoresとanswerUsefulness')) return JSON.stringify({ tokenScores: [50 + h % 50, 40 + (h >> 3) % 60, 55 + (h >> 5) % 45], answerUsefulness: 45 + (h >> 7) % 55 });
  if (user.includes('itemsだけ')) return JSON.stringify({ items: pick(3, 1) });
  if (user.includes('3項目の点数')) {
    if (mode === 'faults') return 'すみません、採点できません';                    // JSON でない
    return JSON.stringify({ questionFit: 60 + h % 40, specificity: 50 + (h >> 4) % 50, materialUse: 40 + (h >> 6) % 60 }); }
  return '答え' + h % 1000;
}
const srv = http.createServer((req, res) => {
  if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'stub' }] })); return; }
  if (req.url === '/v1/chat/completions') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      const body = JSON.parse(b); const who = req.headers['x-who'] || '?';
      log.push({ who, key: JSON.stringify({ m: body.messages, mt: body.max_tokens, t: body.temperature, p: body.top_p ?? null, rf: body.response_format || null }) });
      let a = answer(body); if (typeof a === 'string') a = { text: a, fin: 'stop' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: a.text }, finish_reason: a.fin }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    }); return;
  }
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const spec = JSON.parse(JSON.stringify(v13));
spec.providers.local = { adapter: 'openai_local', endpoint: BASE + '/v1', model: 'stub', stream: false,
  overrides: { context_window_size: 1024 }, generation: { maxTokens: 96, temperature: 0.45 } };
for (const n of spec.nodes) if (n.type === 'llm') n.model = 'stub';
const QUESTION = '雨の日に家でできることを3つ挙げて。';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://fonts.googleapis.com/**', r => r.abort());
const errs = []; const watch = pg => pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const hp = await ctx.newPage(); watch(hp);
await hp.goto(BASE + '/harness.html');
await hp.waitForFunction(() => window.__selfTest, null, { timeout: 180000 });
const R = {}, ok = {};
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// ① 変換
const conv = await hp.evaluate(([s, q]) => window.__dbg.eng.specToSheet(s, { in: q }), [spec, QUESTION]);
R['① 変換'] = { ok: conv.ok, 断る理由: conv.problems, 行: conv.rows && conv.rows.length, 動き方の注意: conv.warns && conv.warns.length };
ok.convert = conv.ok && conv.problems.length === 0 && conv.rows.length === v13.nodes.length;

async function harnessRun() {
  return await hp.evaluate(async ([s, q]) => {
    const run = await window.__dbg.eng.fullRun(s, { in: q });
    const outs = {}; for (const [id, h] of Object.entries(run.nodeRuns || {})) {
      const l = h.filter(x => x.status === 'success' || x.status === 'recovered').slice(-1)[0]; if (l && l.out) outs[id] = { type: l.out.type, value: l.out.value }; }
    return { status: run.status, result: run.result, outs, errors: (run.errors || []).map(e => e.node + ':' + e.kind) };
  }, [spec, QUESTION]);
}
// harness からの通信と方眼からの通信を分ける（ヘッダを付ける transport を両方に登録する）
let barText = '';
async function sheetRun(pg) {
  // 画面の「▶ ハーネスを実行」を押す（このシートの LLM だけを順に呼ぶ）
  barText = await pg.textContent('#demoRun'); await pg.click('#demoRun');
  await pg.waitForFunction(() => { const S = window.__sheet;
    return !S.LLMCore.running && !S.LLMQ.queue.length && !S.JSQ.busy && !S.JSQ.queue.length && !S.LLMQ.follow; }, null, { timeout: 120000, polling: 200 });
  await pg.waitForTimeout(300);
  return await pg.evaluate(rows => { const S = window.__sheet, E = S.engine, si = S.wb.active; S.paint();
    const o = {}; for (const r of rows) { if (r.inMap) continue; const v = E.cellValue(si, r.row - 1, 2);
      if (E.isErr(v)) o[r.id] = { err: v.err, msg: v.msg }; else o[r.id] = E.hDec(v); }
    return o; }, conv.rows);
}
async function openSheet() {
  const sp = await ctx.newPage(); watch(sp);
  await sp.goto(BASE + '/sheet.html');
  await sp.waitForFunction(() => window.__sheet);
  // 前の回の LLM の答え（方眼は端末に覚えておく）を消してから入れる
  await sp.evaluate(([k, v]) => { localStorage.removeItem('hogan-sheet.llm.v1'); localStorage.setItem(k, v); }, ['hogan-sheet.import.v1', JSON.stringify({ v: 1, sheet: conv.sheet, providers: conv.providers })]);
  await sp.goto(BASE + '/sheet.html?from=test#import'); await sp.waitForFunction(() => window.__sheet && window.__sheet.imported);
  return sp;
}
const tally = who => { const m = {}; for (const x of log) if (x.who === who) m[x.key] = (m[x.key] || 0) + 1; return m; };
const compareNodes = (h, s) => { const diff = [];
  for (const r of conv.rows) { if (r.inMap) continue; const a = h.outs[r.id], c = s[r.id];
    if (r.type === 'output') continue;
    if (r.type === 'map') continue;            // harness の nodeRuns の Map は「最後に戻った1件」。集めた配列は次のノード（選別）で比べる
    if (!a && c && c.err) continue;
    if (!a || !c || c.err || a.type !== c.type || !same(a.value, c.value)) diff.push({ id: r.id, harness: a && JSON.stringify(a).slice(0, 120), sheet: c && JSON.stringify(c).slice(0, 120) }); }
  return diff; };

for (const m of ['normal', 'faults']) {
  mode = m;
  // harness
  log = []; await hp.setExtraHTTPHeaders({ 'x-who': 'h' });
  const h = await harnessRun();
  // 方眼
  const sp = await openSheet(); await sp.setExtraHTTPHeaders({ 'x-who': 's' });
  const s = await sheetRun(sp);
  const th = tally('h'), ts = tally('s');
  const kh = Object.keys(th).sort(), ks = Object.keys(ts).sort();
  const outH = h.result, outS = s[conv.rows.find(r => r.type === 'output').id];
  const diff = compareNodes(h, s);
  const key = m === 'normal' ? '② ふつうの回' : '③ 失敗の回';
  R[key] = { harness: { status: h.status, 呼んだ回数: Object.values(th).reduce((a, b) => a + b, 0), 違う文: kh.length, errors: h.errors },
    方眼: { 呼んだ回数: Object.values(ts).reduce((a, b) => a + b, 0), 違う文: ks.length },
    送った文が同じ: JSON.stringify(kh) === JSON.stringify(ks),
    回数が違う文: kh.filter(k => th[k] !== ts[k]).map(k => [th[k], ts[k]]),
    出力が同じ: !!outH && !!outS && outH.type === outS.type && same(outH.value, outS.value),
    値が違うノード: diff, 出力: outS && JSON.stringify(outS.value).slice(0, 160) };
  R[key].ボタン = barText; ok[m + '_button'] = barText.includes('ハーネスを実行');
  ok[m + '_requests'] = R[key].送った文が同じ && kh.length >= (m === 'normal' ? 10 : 5) && kh.every(k => th[k] === ts[k]);
  ok[m + '_nodes'] = diff.length === 0;
  ok[m + '_output'] = R[key].出力が同じ;
  if (m === 'faults') ok.faults_retry = kh.some(k => th[k] === 3 && ts[k] === 3);   // 形に合わない答えは、もう2回聞く（合わせて3回）
  if (m === 'faults') ok.faults_happened = (h.outs['回答Judge'] && JSON.stringify(h.outs['回答Judge'].value)) === JSON.stringify(v13.nodes.find(n => n.id === '回答Judge').onErrorValue);
  await sp.close();
}

// ④ 画面から開く
{ mode = 'normal';
  await hp.click('#viewSeg button[data-v="json"]'); await hp.fill('#spec', JSON.stringify(spec)); await hp.waitForTimeout(400);
  await hp.click('#viewSeg button[data-v="editor"]'); await hp.waitForTimeout(300);
  await hp.locator('#btnSheet').click();
  await hp.waitForSelector('#cvOpen', { timeout: 5000 });
  const pop = hp.context().waitForEvent('page', { timeout: 10000 });
  await hp.locator('#cvOpen').click();
  const np = await pop; watch(np);
  await np.waitForFunction(() => window.__sheet && window.__sheet.imported, null, { timeout: 15000 });
  R['④ 画面から'] = await np.evaluate(() => ({ url: location.pathname + location.hash, 入れたシート: window.__sheet.imported.name,
    シートの数: window.__sheet.wb.sheets.length, 前からのシート: window.__sheet.wb.sheets.slice(0, -1).map(s => s.name),
    置き場が消えた: localStorage.getItem('hogan-sheet.import.v1') === null }));
  const a = R['④ 画面から'];
  ok.ui = a.url === '/sheet.html' && a.前からのシート.length >= 1 && a.置き場が消えた && a.シートの数 === a.前からのシート.length + 1;
}

// ⑤ 写した関数
try { R['⑤ 写した関数'] = execFileSync('node', [ROOT + '/tools/sync-harness-copy.mjs', '--check']).toString().trim(); ok.copy = true; }
catch (e) { R['⑤ 写した関数'] = String(e.stdout || e); ok.copy = false; }

// ⑥ 断るもの
R['⑥ 断る'] = await hp.evaluate(() => {
  const S = window.__dbg.eng.specToSheet;
  const base = () => ({ nodes: [{ id: 'in', type: 'input' }, { id: 'out', type: 'output' }], edges: [] });
  const loop = { nodes: [{ id: 'in', type: 'input' }, { id: 'L', type: 'loop', loop: { id: 'L', max: 3 } }, { id: 'out', type: 'output' }],
    edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'L', port: 'in' } }, { from: { node: 'L', port: 'out' }, to: { node: 'out', port: 'in' } }] };
  const mock = { nodes: [{ id: 'in', type: 'input' }, { id: 'a', type: 'llm', mock: { raw: 'x' } }, { id: 'out', type: 'output' }],
    edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'a', port: 'in' } }, { from: { node: 'a', port: 'out' }, to: { node: 'out', port: 'in' } }] };
  const runRef = { nodes: [{ id: 'in', type: 'input' }, { id: 'c', type: 'calc', lang: 'expr', code: 'run.apiCalls' }, { id: 'out', type: 'output' }],
    edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'c', port: 'in' } }, { from: { node: 'c', port: 'out' }, to: { node: 'out', port: 'in' } }] };
  const ok1 = S(base(), {});
  return { 'ループ': S(loop, {}).problems, 'mock': S(mock, {}).problems, 'run を読む式': S(runRef, {}).problems, '入力→出力だけ': ok1.ok };
});
{ const r = R['⑥ 断る']; ok.refuse = r['ループ'].length > 0 && r['mock'].length > 0 && r['run を読む式'].length > 0 && r['入力→出力だけ']; }

for (const [k, v] of Object.entries(R)) console.log(k + ': ' + JSON.stringify(v));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
