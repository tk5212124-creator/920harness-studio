// JSON タブの欄に HSL を貼っても取り込める（JSON でも HSL でも読む）。
//  ① 貼り付け … 欄が JSON に直り、図が変わる。中身は元の JSON と同じ
//  ② 打っている途中（貼り付けではない入力）… 欄は HSL のまま・図だけ変わる。そのまま実行できる
//  ③ 外部の LLM の返事（前置きの文＋```hsl のコードブロック）を貼る … 取り込める
//  ④ 欄から離れる（change）… JSON に直る
//  ⑤ どちらでも読めない … HSL なら何行目か、「{」で始まるなら JSON の理由を出す。図は前のまま
import fs from 'fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const here = new URL('.', import.meta.url).pathname;
const FILE = 'file://' + new URL('../harness.html', import.meta.url).pathname;
const bigJson = fs.readFileSync(here + 'fixtures/v13.1-token-association.json', 'utf8');
const stub = fs.readFileSync(here + 'fixtures/webllm-stub.js', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(FILE);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
await p.locator('#viewSeg button[data-v="json"]').first().tap();
const R = {}, ok = {};
const hsl = await p.evaluate(j => window.__dbg.eng.specToHSL(JSON.parse(j)), bigJson);
const state = () => p.evaluate(() => ({ 欄の先頭: document.querySelector('#spec').value.trim().slice(0, 12),
  欄はJSON: (() => { try { JSON.parse(document.querySelector('#spec').value); return true; } catch (_) { return false; } })(),
  図のノード: document.querySelectorAll('.nd').length,
  検証: (document.querySelector('#vErr').textContent || '').trim().slice(0, 120),
  ヒント: (document.querySelector('#hint') || {}).textContent || '' }));
// 貼り付けと同じ出来事を起こす（paste → 値が入る → input(insertFromPaste)）
const paste = t => p.evaluate(t => { const el = document.querySelector('#spec');
  el.dispatchEvent(new Event('paste')); el.value = t;
  el.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' })); }, t);
const typeIn = t => p.evaluate(t => { const el = document.querySelector('#spec'); el.value = t;
  el.dispatchEvent(new InputEvent('input', { inputType: 'insertText' })); }, t);
// 中身が同じか（図の配置など見た目だけのキー metadata.layout / sizes / flow / bends は比べない）
const same = () => p.evaluate(j => {
  const st = v => Array.isArray(v) ? '[' + v.map(st).join(',') + ']'
    : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + st(v[k])).join(',') + '}'
    : JSON.stringify(v);
  const core = o => { const c = JSON.parse(JSON.stringify(o));
    if (c.metadata) { delete c.metadata.layout; delete c.metadata.sizes; delete c.metadata.flow; delete c.metadata.bends; }
    return c; };
  const a = core(JSON.parse(j)), b2 = core(JSON.parse(document.querySelector('#spec').value));
  const diffs = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b2)])) if (st(a[k]) !== st(b2[k])) diffs.push(k);
  return diffs; }, bigJson);

// 最初に別のハーネスを載せておく（切り替わったことが分かるように）
await paste(JSON.stringify({ metadata: { name: '前のもの' }, nodes: [{ id: 'in', type: 'input' }, { id: 'out', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'out', port: 'in' } }] }));
await p.waitForTimeout(300);

// ① 貼り付け
await paste(hsl); await p.waitForTimeout(500);
R['① 貼り付け'] = Object.assign(await state(), { 元のJSONとの違い: await same() });
ok.paste = R['① 貼り付け'].欄はJSON && R['① 貼り付け'].図のノード === 23 && R['① 貼り付け'].検証 === ''
  && /HSL を読み込んで JSON に直した/.test(R['① 貼り付け'].ヒント) && R['① 貼り付け'].元のJSONとの違い.length === 0;

// ② 打っている途中（欄は HSL のまま）→ そのまま実行できる
await paste(JSON.stringify({ metadata: { name: '前のもの' }, nodes: [{ id: 'in', type: 'input' }, { id: 'out', type: 'output' }],
  edges: [{ from: { node: 'in', port: 'out' }, to: { node: 'out', port: 'in' } }] }));
await typeIn(hsl); await p.waitForTimeout(500);
R['② 打っている途中'] = await state();
ok.typing = !R['② 打っている途中'].欄はJSON && R['② 打っている途中'].図のノード === 23
  && /HSL として読めた/.test(R['② 打っている途中'].ヒント);
await p.evaluate(stub); await p.evaluate(() => window.__installStub());
await p.locator('#runTop').first().tap();
for (const t0 = Date.now(); ;) { const st = await p.evaluate(() => document.querySelector('#stateline').textContent);
  if (/^state: (success|failed)/.test(st) || Date.now() - t0 > 90000) break; await p.waitForTimeout(300); }
R['② そのまま実行'] = await p.evaluate(() => ({ 状態: document.querySelector('#stateline').textContent.slice(0, 40),
  HSLとして読んだ: [...document.querySelectorAll('#log span')].some(x => /HSL として読んだ/.test(x.textContent)),
  推論: window.__stub.calls }));
ok.runFromHsl = /success/.test(R['② そのまま実行'].状態) && R['② そのまま実行'].HSLとして読んだ && R['② そのまま実行'].推論 === 21;

// ③ 外部の LLM の返事をそのまま貼る（前置き＋コードブロック）
await paste('直したハーネスです。\n\n```hsl\n' + hsl + '\n```\n\n以上です。'); await p.waitForTimeout(500);
R['③ LLMの返事'] = Object.assign(await state(), { 元のJSONとの違い: await same() });
ok.llmReply = R['③ LLMの返事'].欄はJSON && R['③ LLMの返事'].図のノード === 23 && R['③ LLMの返事'].元のJSONとの違い.length === 0;

// ④ 打ってから欄を離れる（change）
await typeIn(hsl); await p.evaluate(() => document.querySelector('#spec').dispatchEvent(new Event('change')));
await p.waitForTimeout(400);
R['④ 欄を離れた'] = await state();
ok.change = R['④ 欄を離れた'].欄はJSON && R['④ 欄を離れた'].図のノード === 23;

// ⑤ どちらでも読めない
await typeIn('node A: llm local\nこれは壊れた行 -> ->'); await p.waitForTimeout(300);
R['⑤ 壊れたHSL'] = await state();
await typeIn('{"nodes": [ '); await p.waitForTimeout(300);
R['⑤ 壊れたJSON'] = await state();
ok.errors = /HSL: /.test(R['⑤ 壊れたHSL'].検証) && /JSON としても HSL としても読めない/.test(R['⑤ 壊れたHSL'].検証)
  && R['⑤ 壊れたHSL'].図のノード === 23
  && /JSON: /.test(R['⑤ 壊れたJSON'].検証) && R['⑤ 壊れたJSON'].図のノード === 23;

for (const [k, v] of Object.entries(R)) console.log(k + ': ' + JSON.stringify(v));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
