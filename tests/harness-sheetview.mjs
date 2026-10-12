// 方眼タブ（エディタ・JSON と並ぶ3つ目の書き方）。方眼で直すと図と JSON にすぐ入るか。
//   ① 出せるハーネスは表で出る／書けないハーネスは理由が出る（表は出さない）
//   ② 往復: ハーネス → 方眼 → ハーネス が一字一句同じ（v13.1 と、例のうち方眼で書けるもの全部）
//   ③ 方眼で直す（v13.1）: 名前（D）・LLM の system・Map の中のノード・ノード名（A）・行を足す・数式で線をつなぐ・
//      A を消す・読めない数式は入れない・消えるキーのある種類の変更は断る・入力の行・改行のあるセルは改行を残して直す・元に戻す
//   ④ 方眼の中で実行（mock 並列）: LLM はこのページの Provider で動き、答えは harness の実行と同じ
//   ⑤ 例を切り替えると方眼も変わる
//   ⑥ 方眼で直したものは、開き直しても残る
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const v13 = fs.readFileSync(ROOT + '/tests/fixtures/v13.1-token-association.json', 'utf8');
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route('https://fonts.googleapis.com/**', r => r.abort());
const hp = await ctx.newPage();
const errs = []; hp.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await hp.goto(BASE + '/harness.html');
await hp.waitForFunction(() => window.__selfTest, null, { timeout: 180000 });
const R = {}, ok = {};
const spec = () => hp.evaluate(() => JSON.parse(JSON.stringify(window.__dbg.spec())));
const frame = () => hp.frame({ url: /sheet\.html/ });
const tapView = v => hp.tap(`#viewSeg button[data-v="${v}"]`);
const loadJSON = async t => { await tapView('json'); await hp.fill('#spec', t); await hp.waitForTimeout(400); await tapView('sheet'); await settle(); };
async function settle() {
  await hp.waitForFunction(() => window.__dbg.eng.SV().ready, null, { timeout: 15000 });
  await hp.waitForTimeout(450);
  const f = frame(); if (f) await f.waitForFunction(() => !window.__sheet.EMB.waiting, null, { timeout: 8000 });
  await hp.waitForTimeout(150);
}
const cellsNow = () => frame().evaluate(() => { const o = {}; const sh = window.__sheet.wb.sheets[0]; for (const [k, c] of Object.entries(sh.cells)) if (c.v != null && c.v !== '') o[k] = String(c.v); return o; });
const rowOf = async id => { const c = await cellsNow(); for (const [k, v] of Object.entries(c)) if (/^A\d+$/.test(k) && v === id) return +k.slice(1); return null; };
const edit = async (row, col, v) => { await frame().evaluate(([r, c, v]) => window.__sheet.commitValue(r - 1, c, v), [row, col, v]); await settle(); };
const toastNow = () => frame().evaluate(() => document.getElementById('toast').textContent);

// ① 出る・断る
await hp.tap('#exSeg2 button[data-ex="ex5"]'); await tapView('sheet'); await settle();
{ const c = await cellsNow();
  R['① 例 mock並列'] = { 行: Object.keys(c).filter(k => /^A\d+$/.test(k)).length - 1, C3: c.C3 };
  ok.show = R['① 例 mock並列'].行 === 5 && /^=HLLM\(/.test(c.C3); }
await hp.tap('#exSeg2 button[data-ex="ex1"]'); await hp.waitForTimeout(500);
R['① 例 mock改稿ループ'] = await hp.evaluate(() => ({ 理由: !document.getElementById('svProblems').hidden, 文: document.getElementById('svProblems').textContent.slice(0, 80),
  表: document.getElementById('svFrame').style.display }));
ok.refuse = R['① 例 mock改稿ループ'].理由 && R['① 例 mock改稿ループ'].表 === 'none' && /loop|ループ|first_match/.test(R['① 例 mock改稿ループ'].文);

// ② 往復
R['② 往復'] = await hp.evaluate(v13 => { const E = window.__dbg.eng; const out = {}; const specs = { v13: JSON.parse(v13) };
  for (const id of [...document.querySelectorAll('[data-ex]')].map(b => b.dataset.ex)) { document.querySelector(`[data-ex="${id}"]`).click(); specs[id] = JSON.parse(JSON.stringify(window.__dbg.spec())); }
  for (const [k, s] of Object.entries(specs)) { const c = E.specToSheet(s, {}, { embed: true }); if (!c.ok) { out[k] = '書けない'; continue; }
    const r = E.sheetToSpec(c.sheet.cells, s, c.rows); out[k] = JSON.stringify(r.spec) === JSON.stringify(s) ? '同じ' : '違う'; }
  return out; }, v13);
ok.roundtrip = Object.values(R['② 往復']).filter(x => x === '同じ').length >= 7 && !Object.values(R['② 往復']).includes('違う');

// ③ v13.1 を方眼で直す
await loadJSON(v13);
const S0 = await spec();
{ // a. 名前（label）
  const r = await rowOf('概念分解'); await edit(r, 3, '語に分ける');
  const s = await spec(); R['③a 名前'] = s.nodes.find(n => n.id === '概念分解').label;
  ok.label = R['③a 名前'] === '語に分ける' && (await hp.inputValue('#spec')).includes('"label": "語に分ける"'); }
{ // b. LLM の system を数式の中で直す（ほかは変わらない）
  const r = await rowOf('回答生成'); const c = (await cellsNow())['C' + r];
  await edit(r, 2, c.replace('元質問へ直接答える。', '元の質問へ直接答える。'));
  const s = await spec(); const n = s.nodes.find(n => n.id === '回答生成'), n0 = S0.nodes.find(n => n.id === '回答生成');
  const rest = JSON.stringify(Object.assign({}, n, { prompt: null })) === JSON.stringify(Object.assign({}, n0, { prompt: null }));
  R['③b system'] = { system: n.prompt.system.slice(0, 14), ほかは同じ: rest, 線は同じ: JSON.stringify(s.edges) === JSON.stringify(S0.edges) };
  ok.system = n.prompt.system.startsWith('元の質問へ直接答える。') && rest && R['③b system'].線は同じ; }
{ // c. Map の中のノード（Map の行の LET の中）
  const r = await rowOf('関連度1Map'); const c = (await cellsNow())['C' + r];
  await edit(r, 2, c.replace('候補語1個を評価する。', '候補語を1個だけ評価する。'));
  const s = await spec(); R['③c Map の中'] = s.nodes.find(n => n.id === '関連度1__Judge').prompt.system.slice(0, 14);
  ok.mapBody = R['③c Map の中'].startsWith('候補語を1個だけ評価する。') && s.nodes.find(n => n.id === '関連度2__Judge').prompt.system.startsWith('候補語1個を評価する。'); }
{ // d. ノード名（A）
  const r = await rowOf('準備'); await edit(r, 0, '準備X');
  const s = await spec();
  R['③d 名前を変える'] = { ノード: s.nodes.some(n => n.id === '準備X') && !s.nodes.some(n => n.id === '準備'),
    線: s.edges.filter(e => e.from.node === '準備X' || e.to.node === '準備X').length, 位置: !!(s.metadata.layout['準備X']) && !s.metadata.layout['準備'] };
  const n0 = S0.edges.filter(e => e.from.node === '準備' || e.to.node === '準備').length;
  ok.rename = R['③d 名前を変える'].ノード && R['③d 名前を変える'].線 === n0 && n0 > 0 && R['③d 名前を変える'].位置; }
let added = null;
{ // e. 空いた行に A と B → ノードが増える。C に数式を書くと線がつながる
  const c = await cellsNow(); const last = Math.max(...Object.keys(c).filter(k => /^A\d+$/.test(k)).map(k => +k.slice(1)));
  const r = last + 2;
  await edit(r, 0, 'メモ計算');                                          // A だけ（書きかけ）: 消えずに残る
  const kept = (await cellsNow())['A' + r] === 'メモ計算' && !(await spec()).nodes.some(n => n.id === 'メモ計算');
  await edit(r, 1, 'calc');
  let s = await spec(); const n = s.nodes.find(n => n.id === 'メモ計算');
  const rr = await rowOf('メモ計算'), rk = await rowOf('契約');
  await edit(rr, 2, `=JS("return x.question","x",$C$${rk},"@node","メモ計算")`);
  s = await spec(); const n2 = s.nodes.find(n => n.id === 'メモ計算'); const e = s.edges.find(e => e.to.node === 'メモ計算');
  R['③e 足す'] = { 書きかけは残る: kept, 足した: !!n, 既定: n && n.lang + ' / ' + n.code, 位置: !!s.metadata.layout['メモ計算'],
    数式のあと: n2 && n2.lang + ' / ' + n2.code, 線: e && `${e.from.node}→${e.to.node} as ${e.as}` };
  ok.add = kept && !!n && n.lang === 'expr' && R['③e 足す'].位置 && n2.lang === 'js' && n2.code === 'return x.question' && e && e.from.node === '契約' && e.as === 'x';
  added = rr; }
{ // f. A を消す → ノードと線が消える
  await edit(added, 0, '');
  const s = await spec(); R['③f 消す'] = { ノード: s.nodes.some(n => n.id === 'メモ計算'), 線: s.edges.some(e => e.to.node === 'メモ計算') };
  R['③f 消す'].残った行 = Object.entries(await cellsNow()).filter(([k, v]) => /^[A-D]\d+$/.test(k) && +k.slice(1) === added).length;
  ok.remove = !R['③f 消す'].ノード && !R['③f 消す'].線 && R['③f 消す'].残った行 === 0; }
{ // g. 読めない数式は入れない（元に戻り、理由が出る）
  const before = JSON.stringify(await spec()); const r = await rowOf('選別1'); const c0 = (await cellsNow())['C' + r];
  await edit(r, 2, '=SUM(1,2)');
  R['③g 読めない'] = { 戻った: (await cellsNow())['C' + r] === c0, 理由: (await toastNow()).slice(0, 60), 同じ: JSON.stringify(await spec()) === before };
  ok.reject = R['③g 読めない'].戻った && R['③g 読めない'].同じ && /入れなかった/.test(R['③g 読めない'].理由); }
{ // h. 種類を変えると消えるキーがある → 断る
  const before = JSON.stringify(await spec()); const r = await rowOf('回答生成');
  await edit(r, 1, 'calc');
  R['③h 種類'] = { 理由: (await toastNow()).slice(0, 70), 同じ: JSON.stringify(await spec()) === before };
  ok.retype = R['③h 種類'].同じ && /消えるもの/.test(R['③h 種類'].理由); }
{ // i. 入力の行は実行の入力（ハーネスの JSON は変えない）
  const before = JSON.stringify(await spec()); const r = await rowOf('in');
  await edit(r, 2, '晴れの日に外でできることを2つ挙げて。');
  R['③i 入力'] = { 入力欄: await hp.evaluate(() => document.querySelector('#ioIn [data-in="in"]').value), 同じ: JSON.stringify(await spec()) === before };
  ok.input = R['③i 入力'].入力欄 === '晴れの日に外でできることを2つ挙げて。' && R['③i 入力'].同じ; }
{ // j. 改行のあるセルは、改行を残せる欄で直す
  const r = await rowOf('契約');
  await frame().evaluate(([r]) => { window.__sheet.select(r - 1, 2); document.getElementById('fx').focus(); }, [r]);
  await hp.waitForTimeout(300);
  const opened = await frame().evaluate(() => !document.getElementById('modal').hidden && document.getElementById('panel').dataset.kind === 'long');
  await frame().evaluate(() => { const ta = document.getElementById('leTa'); ta.value = ta.value.replace('return {question:q,expectedCount};', 'return {question:q,expectedCount};\n// 方眼で足した行'); document.getElementById('leOk').click(); });
  await settle();
  const code = (await spec()).nodes.find(n => n.id === '契約').code;
  R['③j 改行'] = { 欄が開いた: opened, 改行が残る: code.split('\n').length, 末尾: code.slice(-12) };
  ok.longEdit = opened && code.endsWith('\n// 方眼で足した行') && code.split('\n').length === JSON.parse(v13).nodes.find(n => n.id === '契約').code.split('\n').length + 1; }

{ // k. 方眼の「元に戻す」も図と JSON に入る（いま直した改行の追加が戻る）
  await frame().evaluate(() => document.getElementById('bUndo').click()); await settle();
  const code = (await spec()).nodes.find(n => n.id === '契約').code;
  R['③k 元に戻す'] = { 末尾: code.slice(-14) };
  ok.undo = code === JSON.parse(v13).nodes.find(n => n.id === '契約').code; }

// ④ 方眼の中で実行（mock 並列）— LLM はこのページの Provider で動く
await hp.tap('#exSeg2 button[data-ex="ex5"]'); await settle();
{ const h = await hp.evaluate(async () => { const r = await window.__dbg.eng.fullRun(JSON.parse(JSON.stringify(window.__dbg.spec())), window.__dbg.eng.inputForRun()); return r.result; });
  const f = frame();
  const bar = await f.evaluate(() => document.getElementById('demoRun').textContent);
  await f.evaluate(() => document.getElementById('demoRun').click());
  await f.waitForFunction(() => { const S = window.__sheet; return !S.LLMCore.running && !S.LLMQ.queue.length && !S.JSQ.busy && !S.LLMQ.follow; }, null, { timeout: 30000, polling: 200 });
  const s = await f.evaluate(() => { const S = window.__sheet, E = S.engine; S.paint(); const sh = S.wb.sheets[0]; let r = 0;
    for (let i = 2; i < 40; i++) if (sh.cells['B' + i] && sh.cells['B' + i].v === 'output') r = i;
    const v = E.cellValue(0, r - 1, 2); return { out: E.isErr(v) ? v : E.hDec(v), engine: Object.values(S.ModelManager.states).some(x => x && x.handle) }; });
  R['④ 方眼で実行'] = { ボタン: bar, harness: JSON.stringify(h), 方眼: JSON.stringify(s.out), 方眼でengineを作った: s.engine };
  ok.run = bar.includes('ハーネスを実行') && JSON.stringify(h) === JSON.stringify(s.out) && !s.engine; }

// ⑤ 例を切り替えると方眼も変わる
await hp.tap('#exSeg button[data-ex="exL2"]'); await settle();
{ const c = await cellsNow(); R['⑤ 切り替え'] = Object.keys(c).filter(k => /^B\d+$/.test(k)).map(k => c[k]).join(',');
  ok.follow = R['⑤ 切り替え'] === '種類,input,llm,llm,join,output'; }

// ⑥ 開き直しても残る
{ const r = await rowOf((await spec()).nodes.find(n => n.type === 'llm').id); await edit(r, 3, '開き直しても残る名前');
  await hp.waitForTimeout(600);
  await hp.reload(); await hp.waitForFunction(() => window.__selfTest, null, { timeout: 180000 });
  const s = await spec(); R['⑥ 開き直す'] = s.nodes.map(n => n.label).filter(Boolean);
  ok.persist = R['⑥ 開き直す'].includes('開き直しても残る名前'); }

for (const [k, v] of Object.entries(R)) console.log(k + ': ' + JSON.stringify(v));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
