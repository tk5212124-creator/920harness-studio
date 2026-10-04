// 方眼シート（sheet.html）— 数式エンジン（配列・こぼれ・LET/LAMBDA・ループ）と =LLM() を、
// 実ブラウザで確かめる。LLM は同じオリジンに立てた OpenAI 互換のスタブ（SSE）と mock で通す。
//   node tests/sheet.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const hits = []; let failNext = false;
const srv = http.createServer((req, res) => {
  if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'stub' }] })); return; }
  if (req.url === '/v1/chat/completions') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      const body = JSON.parse(b); hits.push(body);
      if (failNext) { failNext = false; res.writeHead(500); res.end('internal failure'); return; }
      const user = body.messages[body.messages.length - 1].content;
      const input = (user.split('入力:\n')[1] || '').split('\n\nJSON')[0];
      let out;
      if (user.startsWith('短く')) out = [...input].slice(0, Math.ceil([...input].length / 2)).join('');
      else if (user.startsWith('分類')) out = JSON.stringify({ answer: input.includes('遅') ? '否定' : '肯定' });
      else if (user.startsWith('キーワード')) out = JSON.stringify({ answer: ['表計算', 'LLM', 'ループ'] });
      else out = '要約です';
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const half = Math.ceil(out.length / 2);
      for (const piece of [out.slice(0, half), out.slice(half)])
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    }); return;
  }
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.route('https://fonts.googleapis.com/**', r => r.abort());
await p.goto(BASE + '/sheet.html');
await p.waitForFunction(() => window.__sheet, null, { timeout: 15000 });

const results = []; let bad = 0;
const ok = (name, cond, got) => { results.push(`${cond ? '✓' : '✗'} ${name}${cond ? '' : '  → ' + JSON.stringify(got)}`); if (!cond) bad++; };

// ブックを差し替えて、指定セルの表示値を返す
const run = (cells, read, extra) => p.evaluate(([cells, read, extra]) => {
  const S = window.__sheet, E = S.engine;
  const sh = E.newSheet('T'); for (const [k, v] of Object.entries(cells)) sh.cells[k] = { v };
  const book = { sheets: [sh], active: 0, names: (extra && extra.names) || {}, llm: Object.assign(E.DEFAULT_LLM(), (extra && extra.llm) || {}) };
  if (extra && extra.llm && extra.llm.providers) book.llm.providers = Object.assign(E.DEFAULT_LLM().providers, extra.llm.providers);
  S.wb = book; E.recalc();
  return read.map(k => { const q = E.parseA1(k); return E.fmtVal(E.cellValue(0, q.r, q.c)); });
}, [cells, read, extra]);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 配列とこぼれ ----
let v = await run({ A1: '=SEQUENCE(3)', B1: '=A1#*10' }, ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'A4']);
ok('SEQUENCE が下へこぼれ、A1# で受けて計算できる', eq(v, ['1', '2', '3', '10', '20', '30', '']), v);
v = await run({ A1: '=SEQUENCE(3)', A2: 'じゃま' }, ['A1', 'A2']);
ok('こぼれ先にデータがあると #SPILL!', eq(v, ['#SPILL!', 'じゃま']), v);
v = await run({ A1: '1', A2: '2', A3: '3', B1: '=A1:A3*2', C1: '=SUM(B1#)' }, ['B1', 'B2', 'B3', 'C1']);
ok('範囲どうしの計算が配列になり、SUM がこぼれ全体を読む', eq(v, ['2', '4', '6', '12']), v);
v = await run({ A1: '=TRANSPOSE(SEQUENCE(3))', A3: '=SORT(VSTACK(3,1,2))', B3: '=UNIQUE(VSTACK("a","A","b"))', C3: '=FILTER(SEQUENCE(6),ISEVEN(SEQUENCE(6)))' },
  ['A1', 'B1', 'C1', 'A3', 'A4', 'A5', 'B3', 'B4', 'B5', 'C3', 'C4', 'C5']);
ok('TRANSPOSE・SORT・UNIQUE・FILTER', eq(v, ['1', '2', '3', '1', '2', '3', 'a', 'b', '', '2', '4', '6']), v);

// ---- LET / LAMBDA / 名前 ----
v = await run({ A1: '=LET(価格,1280,税率,0.1,ROUND(価格*(1+税率),0))', A2: '=LAMBDA(x,x*2)(21)', A3: '=階乗(5)', A4: '=LAMBDA(x,x)', A5: '=無限(1)' }, ['A1', 'A2', 'A3', 'A4', 'A5'],
  { names: { '階乗': '=LAMBDA(n,IF(n<=1,1,n*階乗(n-1)))', '無限': '=LAMBDA(n,無限(n+1))' } });
ok('LET・LAMBDA の即時呼び出し・名前付き再帰・呼ばない LAMBDA・深すぎる再帰', eq(v, ['1408', '42', '120', '#CALC!', '#LOOP!']), v);

// ---- ループ ----
v = await run({
  A1: '=LOOP(1,LAMBDA(s,i,s<=1000),LAMBDA(s,i,s*2))',
  A2: '=ITERATE(1,10,LAMBDA(s,i,s*2))',
  A3: '=REDUCE(0,SEQUENCE(10),LAMBDA(a,x,a+x))',
  A4: '=LOOP(1,LAMBDA(s,i,TRUE),LAMBDA(s,i,s+1),50)',
  B1: '=LOOPLIST(6,LAMBDA(s,i,s<>1),LAMBDA(s,i,IF(ISEVEN(s),s/2,3*s+1)))',
  C1: '=FOR(1,5,LAMBDA(i,i*i))', D1: '=SCAN(0,SEQUENCE(4),LAMBDA(a,x,a+x))', E1: '=MAP(SEQUENCE(3),LAMBDA(x,IF(ISODD(x),"奇","偶")))',
  F1: '=MAKEARRAY(2,3,LAMBDA(r,c,r*10+c))'
}, ['A1', 'A2', 'A3', 'A4', 'B1', 'B5', 'B9', 'B10', 'C5', 'D4', 'E2', 'F1', 'H2']);
ok('LOOP・ITERATE・REDUCE・上限で #LOOP!・LOOPLIST・FOR・SCAN・MAP・MAKEARRAY',
  eq(v, ['1024', '1024', '55', '#LOOP!', '6', '16', '1', '', '25', '10', '偶', '11', '23']), v);

// ---- 行の挿入で参照がずれる（既存の動きを壊していない） ----
v = await p.evaluate(() => window.__sheet.engine.shiftFormula('=SUM(A1:A3)+$B$1+Sheet2!C4', 2, 1));
ok('貼り付けの参照ずらし（相対だけ動く）', v === '=SUM(B3:B5)+$B$1+Sheet2!D6', v);

// ---- LLM: mock（手動モード） ----
const LLMEX = { llm: { providers: { test: { adapter: 'mock', delayMs: 50 } }, def: 'test' } };
v = await run({ A1: '=LLM("分類",,"肯定|否定")' }, ['A1'], LLMEX);
ok('手動モードでは呼ばずに #未実行', eq(v, ['#未実行']), v);
await p.evaluate(() => window.__sheet.runPending());
await p.waitForFunction(() => !window.__sheet.LLMCore.running && !window.__sheet.LLMQ.queue.length && window.__sheet.LLMCore.results.size > 0, null, { timeout: 5000 });
v = await p.evaluate(() => { const E = window.__sheet.engine; E.recalc(); return E.fmtVal(E.cellValue(0, 0, 0)); });
ok('実行すると mock の答え（schema に合う値）が入る', v === '肯定', v);

// ---- LLM: OpenAI 互換のスタブ（自動モード） ----
const STUB = { llm: { auto: true, def: 'stub', providers: { stub: { adapter: 'openai_local', endpoint: BASE + '/v1', model: 'stub', generation: { maxTokens: 64, temperature: 0 } } } } };
const settle = () => p.waitForFunction(() => { const S = window.__sheet; return !S.LLMCore.running && !S.LLMQ.queue.length; }, null, { timeout: 8000 }).then(() => p.waitForTimeout(80));
const readNow = keys => p.evaluate(keys => { const S = window.__sheet, E = S.engine; S.paint(); return keys.map(k => { const q = E.parseA1(k); return E.fmtVal(E.cellValue(0, q.r, q.c)); }); }, keys);
await p.evaluate(() => { localStorage.clear(); window.__sheet.LLMCore.results.clear(); window.__sheet.LLMCore.errors.clear(); });
hits.length = 0;
v = await run({ A1: '起動が遅い', A2: '使いやすい', B1: '=LLM("分類して",A1,"肯定|否定")', B2: '=LLM("分類して",A2,"肯定|否定")', C1: '=LLM("要約",A1)', D1: '=LLM("キーワード",A1,"リスト")' }, ['B1', 'B2'], STUB);
ok('自動モードでは順番待ちに入る', v.every(x => x === '#待機中' || x === '#実行中'), v);
for (let i = 0; i < 4; i++) { await settle(); await p.evaluate(() => window.__sheet.paint()); }
await settle();
v = await readNow(['B1', 'B2', 'C1', 'D1', 'D2', 'D3']);
ok('SSE で受けた答えが入る（分類・文章・リストは縦に広がる）', eq(v, ['否定', '肯定', '要約です', '表計算', 'LLM', 'ループ']), v);
const h0 = hits[0];
ok('送った中身: system＋指示＋入力、JSON 指定、temperature 0、stream', !!h0 && h0.messages[0].role === 'system' && h0.messages[1].content.includes('入力:\n起動が遅い')
  && h0.response_format && h0.response_format.type === 'json_object' && h0.temperature === 0 && h0.stream === true && h0.max_tokens === 64, h0);
const n1 = hits.length;
await readNow(['B1']); await readNow(['B1']); await p.waitForTimeout(200);
ok('同じ問いは呼び直さない（キャッシュ）', hits.length === n1 && n1 === 4, { n1, now: hits.length });

// 失敗は #LLM! のまま残り、自動では再試行しない
failNext = true;
await p.evaluate(() => { const S = window.__sheet; const sh = S.wb.sheets[0]; sh.cells.E1 = { v: '=LLM("要約","別の文")' }; S.paint(); });
await settle();
v = await readNow(['E1']); const n2 = hits.length;
const msg = await p.evaluate(() => { const E = window.__sheet.engine; return E.cellValue(0, 0, 4).msg; });
await readNow(['E1']); await p.waitForTimeout(200);
ok('サーバの失敗は #LLM! と理由（PROVIDER_ERROR）、再試行しない', v[0] === '#LLM!' && /PROVIDER_ERROR/.test(msg) && hits.length === n2, { v, msg, n2, now: hits.length });
await p.evaluate(() => window.__sheet.rerun({ r1: 0, c1: 4, r2: 0, c2: 4 }));
await settle(); v = await readNow(['E1']);
ok('「選択範囲を再実行」で呼び直して直る', v[0] === '要約です' && hits.length === n2 + 1, { v, hits: hits.length });

// LLM を LOOP の中で使う（答えが来るたびに次の周が進む）
await p.evaluate(() => { const S = window.__sheet; S.wb.sheets[0].cells.F1 = { v: '=LOOP("あいうえおかきくけこさしすせ",LAMBDA(s,i,LEN(s)>3),LAMBDA(s,i,LLM("短く",s)))' }; S.paint(); });
for (let i = 0; i < 6; i++) { await settle(); await p.evaluate(() => window.__sheet.paint()); }
v = await readNow(['F1']);
ok('LOOP の中の LLM が周ごとに答えを受けて終わる（14→7→4→2字）', v[0] === 'あい', v);

// ---- 画面: 最初に開くデモ ----
await p.evaluate(() => { localStorage.clear(); });
await p.reload(); await p.waitForFunction(() => window.__sheet, null, { timeout: 15000 });
const d0 = await p.evaluate(() => ({ tab: document.querySelector('.tab.on').textContent, bar: !document.querySelector('#demoBar').hidden,
  btn: document.querySelector('#demoRun').textContent, b4: [...document.querySelectorAll('#tbl tbody tr')[3].querySelectorAll('td')][1].textContent,
  idle: !window.__sheet.LLMCore.running && !window.__sheet.LLMQ.queue.length }));
ok('開くとデモのシートで「▶ デモを実行」が出て、まだ何も呼んでいない', d0.tab === 'デモ' && d0.bar && d0.btn === '▶ デモを実行' && d0.b4 === '#未実行' && d0.idle, d0);
const chip = await p.textContent('#llmChip');
ok('LLM の数式があると「▶ LLMを実行（n件）」が出る（勝手には呼ばない）', /LLMを実行（\d+件）/.test(chip), chip);
// 実ブラウザの WebGPU はここに無いので、device を mock に差し替えて「押したら最後まで埋まる」流れを見る
await p.evaluate(() => { const S = window.__sheet; S.wb.llm.providers.device = { adapter: 'mock', delayMs: 30 }; S.paint(); });
await p.locator('#demoRun').tap();
await p.waitForFunction(() => { const S = window.__sheet; return !S.LLMCore.running && !S.LLMQ.queue.length && !S.LLMQ.follow; }, null, { timeout: 15000 });
await p.waitForTimeout(150);
const d1 = await p.evaluate(() => { const S = window.__sheet, E = S.engine; const g = (si, k) => { const q = E.parseA1(k); return E.fmtVal(E.cellValue(si, q.r, q.c)); };
  return { b: ['B4', 'B5', 'B6', 'B7', 'B8', 'B9'].map(k => g(0, k)), c4: g(0, 'C4'), f4: g(0, 'F4'), f7: g(0, 'F7'), e10: g(0, 'E10'), a13: g(0, 'A13'), a14: g(0, 'A14'),
    other: g(2, 'I2'), bar: document.querySelector('#demoTx').textContent }; });
ok('押すとデモの LLM セルが全部埋まり、集計（COUNTIF・AVERAGE・FILTER）も追従する', d1.b.every(x => x === '肯定') && /^\d+$/.test(d1.c4) && d1.f4 === '6' && d1.f7 !== '' && !d1.f7.startsWith('#') && d1.e10 === 'なし', d1);
ok('LOOP の中の LLM は押し直さなくても周が進んで終わる', d1.a13.startsWith('(mock)') && /^\d+字$/.test(d1.a14), d1);
ok('デモの実行は他のシートの LLM を呼ばない', d1.other === '#未実行', d1.other);
ok('終わるとバーが「完了」になる', d1.bar.startsWith('完了'), d1.bar);
await p.screenshot({ path: path.join(ROOT, 'docs', 'sheet-mobile.png') });
await p.locator('.tab', { hasText: '関数の例' }).tap(); await p.waitForTimeout(300);
const cellsText = await p.evaluate(() => [...document.querySelectorAll('#tbl tbody tr')[1].querySelectorAll('td')].slice(0, 3).map(td => td.textContent));
ok('「関数の例」シートの SEQUENCE / MAP が画面に出る', cellsText[0] === '1' && cellsText[1] === '1' && cellsText[2] === '奇数', cellsText);
ok('ページのエラーなし', errs.length === 0, errs);

console.log(results.join('\n'));
console.log(bad ? `\n${bad} 件 失敗` : `\n全 ${results.length} 件 OK`);
await b.close(); srv.close();
process.exit(bad ? 1 : 0);
