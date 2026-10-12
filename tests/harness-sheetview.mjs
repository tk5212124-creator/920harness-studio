// 方眼タブ（エディタ・JSON と並ぶ3つ目の書き方）。1つのセルが1つのノード（=NODE.種類(設定…)）で、図と同じ並び。
// 方眼で直すと図と JSON にすぐ入るか。
//   ① 出せるハーネスはセル（=NODE.〇〇）で出る・図と同じ並び／書けないハーネスは理由が出る（表は出さない）
//   ② 往復: ハーネス → 方眼 → ハーネス が一字一句同じ（v13.1 と、例のうち方眼で書けるもの全部）
//   ③ 方眼で直す（v13.1）: LLM の system・Map の中のノード・失敗したときの値（設定の onError）・空いたセルに書いてノードを足す・
//      セルを消してノードを消す・セルを動かすと図の位置が動く（参照は前の番地のままでも追う）・読めない数式／ノードでないものは入れない・
//      消えるキーのある種類の変更は断る・入力のセル・改行のあるセルは改行を残して直す・元に戻す・選んだセルのノード名
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
const cellsNow = () => frame().evaluate(() => { const o = {}; const sh = window.__sheet.wb.sheets[0];
  for (const [k, c] of Object.entries(sh.cells)) if (c.v != null && c.v !== '') o[k] = { v: String(c.v), nid: c.nid || null }; return o; });
const addrOf = async id => { const c = await cellsNow(); for (const [k, x] of Object.entries(c)) if (x.nid === id) return k; return null; };
const rc = a => { const m = /^([A-Z]+)(\d+)$/.exec(a); return { r: +m[2] - 1, c: m[1].charCodeAt(0) - 65 }; };
const edit = async (addr, v) => { const p = rc(addr); await frame().evaluate(([r, c, v]) => window.__sheet.commitValue(r, c, v), [p.r, p.c, v]); await settle(); };
const toastNow = () => frame().evaluate(() => document.getElementById('toast').textContent);
const fOf = async id => (await cellsNow())[await addrOf(id)].v;

// ① 出る・断る
await hp.tap('#exSeg2 button[data-ex="ex5"]'); await tapView('sheet'); await settle();
{ const c = await cellsNow();
  R['① 例 mock並列'] = Object.fromEntries(Object.entries(c).map(([k, x]) => [k, x.nid + ' ' + x.v.slice(0, 40)]));
  ok.show = Object.keys(c).length === 5 && /^=NODE\.INPUT\(/.test(c.A1.v) && c.A1.nid === 'in' && /^=NODE\.LLM\(/.test(c.A2.v) && /^=NODE\.LLM\(/.test(c.B2.v)
    && /^=NODE\.JOIN\(/.test(c.A3.v) && /^=NODE\.OUTPUT\(A3\)$/.test(c.A4.v); }
await hp.tap('#exSeg2 button[data-ex="ex1"]'); await hp.waitForTimeout(500);
R['① 例 mock改稿ループ'] = await hp.evaluate(() => ({ 理由: !document.getElementById('svProblems').hidden, 文: document.getElementById('svProblems').textContent.slice(0, 80),
  表: document.getElementById('svFrame').style.display }));
ok.refuse = R['① 例 mock改稿ループ'].理由 && R['① 例 mock改稿ループ'].表 === 'none';

// ② 往復
R['② 往復'] = await hp.evaluate(v13 => { const E = window.__dbg.eng; const out = {}; const specs = { v13: JSON.parse(v13) };
  for (const id of [...document.querySelectorAll('[data-ex]')].map(b => b.dataset.ex)) { document.querySelector(`[data-ex="${id}"]`).click(); specs[id] = JSON.parse(JSON.stringify(window.__dbg.spec())); }
  for (const [k, s] of Object.entries(specs)) { const c = E.specToSheet(s, {}, { embed: true }); if (!c.ok) { out[k] = '書けない'; continue; }
    const r = E.sheetToSpec(c.sheet.cells, s, c); out[k] = JSON.stringify(r.spec) === JSON.stringify(s) ? '同じ' : '違う'; }
  return out; }, v13);
ok.roundtrip = Object.values(R['② 往復']).filter(x => x === '同じ').length >= 7 && !Object.values(R['② 往復']).includes('違う');

// ③ v13.1 を方眼で直す
await loadJSON(v13);
const S0 = await spec();
{ // 図と同じ並び（縦に流れる。回答Judge は右、点検と出力は下に並ぶ）
  const c = await cellsNow(); const at = Object.fromEntries(Object.entries(c).map(([k, x]) => [x.nid, k]));
  R['③ 並び'] = at;
  ok.layout = at.in === 'B1' && at['契約'] === 'B2' && rc(at['回答Judge']).c > rc(at['最終']).c && rc(at['点検']).r === rc(at.out).r && rc(at.out).r > rc(at['最終']).r; }
{ // a. LLM の system を数式の中で直す（ほかは変わらない）
  const a = await addrOf('回答生成'); await edit(a, (await fOf('回答生成')).replace('元質問へ直接答える。', '元の質問へ直接答える。'));
  const s = await spec(); const n = s.nodes.find(n => n.id === '回答生成'), n0 = S0.nodes.find(n => n.id === '回答生成');
  const rest = JSON.stringify(Object.assign({}, n, { prompt: null })) === JSON.stringify(Object.assign({}, n0, { prompt: null }));
  R['③a system'] = { system: n.prompt.system.slice(0, 14), ほかは同じ: rest, 線は同じ: JSON.stringify(s.edges) === JSON.stringify(S0.edges), 式: (await fOf('回答生成')).slice(0, 40) };
  ok.system = n.prompt.system.startsWith('元の質問へ直接答える。') && rest && R['③a system'].線は同じ && /^=NODE\.LLM\(/.test(R['③a system'].式); }
{ // b. Map の中のノード（Map のセルの LET の中）
  const a = await addrOf('関連度1Map'); await edit(a, (await fOf('関連度1Map')).replace('候補語1個を評価する。', '候補語を1個だけ評価する。'));
  const s = await spec(); R['③b Map の中'] = s.nodes.find(n => n.id === '関連度1__Judge').prompt.system.slice(0, 14);
  ok.mapBody = R['③b Map の中'].startsWith('候補語を1個だけ評価する。') && s.nodes.find(n => n.id === '関連度2__Judge').prompt.system.startsWith('候補語1個を評価する。'); }
{ // c. 失敗したときの値（設定の中の onErrorValue）
  const a = await addrOf('連想1'); const f0 = await fOf('連想1');
  await edit(a, f0.replace('""onErrorValue"":{""words"":[]}', '""onErrorValue"":{""words"":[""雨""]}'));
  const n = (await spec()).nodes.find(n => n.id === '連想1');
  R['③c onError'] = { 前の式に設定がある: f0.includes('""onError"":""value""'), onError: n.onError, onErrorValue: n.onErrorValue };
  ok.onError = R['③c onError'].前の式に設定がある && n.onError === 'value' && JSON.stringify(n.onErrorValue) === '{"words":["雨"]}'; }
let addedAt = null, addedId = null;
{ // d. 空いたセルに =NODE.〇〇(…) → ノードが増え、参照で線がつながる。位置は図にも入る
  const k = await addrOf('契約'); addedAt = 'F2';
  await edit(addedAt, `=NODE.JS("return x.question","","x",${k})`);
  const s = await spec(); addedId = (await cellsNow())[addedAt] && (await cellsNow())[addedAt].nid;
  const n = s.nodes.find(n => n.id === addedId); const e = s.edges.find(e => e.to.node === addedId);
  R['③d 足す'] = { 名前: addedId, 中身: n && n.lang + ' / ' + n.code, 線: e && `${e.from.node}→${e.to.node} as ${e.as}`, 図の位置: s.metadata.layout[addedId] };
  ok.add = !!n && n.type === 'calc' && n.lang === 'js' && n.code === 'return x.question' && e && e.from.node === '契約' && e.as === 'x'
    && !!s.metadata.layout[addedId] && s.metadata.layout[addedId].x > S0.metadata.layout['回答Judge'].x; }
{ // e. セルを消す → ノードと線が消える
  await edit(addedAt, '');
  const s = await spec(); R['③e 消す'] = { ノード: s.nodes.some(n => n.id === addedId), 線: s.edges.some(e => e.to.node === addedId), セル: !!(await cellsNow())[addedAt] };
  ok.remove = !R['③e 消す'].ノード && !R['③e 消す'].線 && !R['③e 消す'].セル; }
{ // f. セルを動かす（切り取り→貼り付け）→ 図の位置が動く。ほかのセルの参照は前の番地のままでも追いかける
  const from = await addrOf('回答Judge'); const p = rc(from); const to = String.fromCharCode(65 + p.c + 1) + (p.r + 1);
  await frame().evaluate(([a, b]) => { const S = window.__sheet; S.pushUndo(); const sh = S.wb.sheets[0]; sh.cells[b] = sh.cells[a]; delete sh.cells[a]; S.paint(); S.save(); }, [from, to]);
  await settle();
  const s = await spec();
  R['③f 動かす'] = { 前: from, 後: await addrOf('回答Judge'), x: [S0.metadata.layout['回答Judge'].x, s.metadata.layout['回答Judge'].x],
    線は同じ: JSON.stringify(s.edges) === JSON.stringify((await spec()).edges) && s.edges.filter(e => e.from.node === '回答Judge' || e.to.node === '回答Judge').length === S0.edges.filter(e => e.from.node === '回答Judge' || e.to.node === '回答Judge').length,
    最終の式: (await fOf('最終')).includes(to) };
  ok.move = R['③f 動かす'].後 === to && s.metadata.layout['回答Judge'].x > S0.metadata.layout['回答Judge'].x && R['③f 動かす'].線は同じ && R['③f 動かす'].最終の式; }
{ // g. 読めない数式・ノードでないものは入れない（元に戻り、理由が出る）
  const before = JSON.stringify(await spec()); const a = await addrOf('選別1'); const f0 = await fOf('選別1');
  await edit(a, '=SUM(1,2)');
  const t1 = await toastNow(); const back1 = (await fOf('選別1')) === f0;
  await edit('H30', 'メモ');
  const t2 = await toastNow(); const gone = !(await cellsNow()).H30;
  R['③g 入れない'] = { 戻った: back1, 理由1: t1.slice(0, 60), メモは消えた: gone, 理由2: t2.slice(0, 60), 同じ: JSON.stringify(await spec()) === before };
  ok.reject = back1 && gone && R['③g 入れない'].同じ && /入れなかった/.test(t1) && /ノードだけ/.test(t2); }
{ // h. 種類を変えると消えるキーがある → 断る
  const before = JSON.stringify(await spec()); const a = await addrOf('回答生成');
  await edit(a, '=NODE.JS("return 1","")');
  R['③h 種類'] = { 理由: (await toastNow()).slice(0, 70), 同じ: JSON.stringify(await spec()) === before };
  ok.retype = R['③h 種類'].同じ && /消えるもの/.test(R['③h 種類'].理由); }
{ // i. 入力のセルは実行の入力（ハーネスの JSON は変えない）
  const before = JSON.stringify(await spec()); const a = await addrOf('in');
  await edit(a, '=NODE.INPUT("晴れの日に外でできることを2つ挙げて。")');
  R['③i 入力'] = { 入力欄: await hp.evaluate(() => document.querySelector('#ioIn [data-in="in"]').value), 同じ: JSON.stringify(await spec()) === before };
  ok.input = R['③i 入力'].入力欄 === '晴れの日に外でできることを2つ挙げて。' && R['③i 入力'].同じ; }
{ // j. 改行のあるセルは、改行を残せる欄で直す
  const p = rc(await addrOf('契約'));
  await frame().evaluate(([r, c]) => { window.__sheet.select(r, c); document.getElementById('fx').focus(); }, [p.r, p.c]);
  await hp.waitForTimeout(300);
  const opened = await frame().evaluate(() => !document.getElementById('modal').hidden && document.getElementById('panel').dataset.kind === 'long');
  await frame().evaluate(() => { const ta = document.getElementById('leTa'); ta.value = ta.value.replace('return {question:q,expectedCount};', 'return {question:q,expectedCount};\n// 方眼で足した行'); document.getElementById('leOk').click(); });
  await settle();
  const code = (await spec()).nodes.find(n => n.id === '契約').code;
  R['③j 改行'] = { 欄が開いた: opened, 行数: code.split('\n').length, 末尾: code.slice(-12) };
  ok.longEdit = opened && code.endsWith('\n// 方眼で足した行') && code.split('\n').length === JSON.parse(v13).nodes.find(n => n.id === '契約').code.split('\n').length + 1; }
{ // k. 方眼の「元に戻す」も図と JSON に入る
  await frame().evaluate(() => document.getElementById('bUndo').click()); await settle();
  const code = (await spec()).nodes.find(n => n.id === '契約').code;
  ok.undo = code === JSON.parse(v13).nodes.find(n => n.id === '契約').code; R['③k 元に戻す'] = ok.undo; }
{ // l. セルを選ぶと、下にノードの名前が出る
  const p = rc(await addrOf('概念分解'));
  await frame().evaluate(([r, c]) => window.__sheet.select(r, c), [p.r, p.c]); await hp.waitForTimeout(200);
  R['③l 名前'] = await frame().evaluate(() => document.getElementById('stat').textContent.slice(0, 40));
  ok.name = R['③l 名前'].includes('ノード「概念分解」'); }

// ④ 方眼の中で実行（mock 並列）— LLM はこのページの Provider で動く
await hp.tap('#exSeg2 button[data-ex="ex5"]'); await settle();
{ const h = await hp.evaluate(async () => { const r = await window.__dbg.eng.fullRun(JSON.parse(JSON.stringify(window.__dbg.spec())), window.__dbg.eng.inputForRun()); return r.result; });
  const f = frame();
  const bar = await f.evaluate(() => document.getElementById('demoRun').textContent);
  await f.evaluate(() => document.getElementById('demoRun').click());
  await f.waitForFunction(() => { const S = window.__sheet; return !S.LLMCore.running && !S.LLMQ.queue.length && !S.JSQ.busy && !S.LLMQ.follow; }, null, { timeout: 30000, polling: 200 });
  const s = await f.evaluate(() => { const S = window.__sheet, E = S.engine; S.paint(); const sh = S.wb.sheets[0]; let at = null;
    for (const [k, c] of Object.entries(sh.cells)) if (c.nid === 'out') at = E.parseA1(k);
    const v = E.cellValue(0, at.r, at.c); return { out: E.isErr(v) ? v : E.hDec(v), engine: Object.values(S.ModelManager.states).some(x => x && x.handle) }; });
  R['④ 方眼で実行'] = { ボタン: bar, harness: JSON.stringify(h), 方眼: JSON.stringify(s.out), 方眼でengineを作った: s.engine };
  ok.run = bar.includes('ハーネスを実行') && JSON.stringify(h) === JSON.stringify(s.out) && !s.engine; }

// ⑤ 例を切り替えると方眼も変わる
await hp.tap('#exSeg button[data-ex="exL2"]'); await settle();
{ const c = await cellsNow(); R['⑤ 切り替え'] = Object.entries(c).map(([k, x]) => k + ':' + x.v.split('(')[0]).join(' ');
  ok.follow = R['⑤ 切り替え'] === 'A1:=NODE.INPUT A2:=NODE.LLM B2:=NODE.LLM A3:=NODE.JOIN A4:=NODE.OUTPUT'; }

// ⑥ 開き直しても残る
{ const id = (await spec()).nodes.find(n => n.type === 'llm').id; const a = await addrOf(id);
  const f0 = await fOf(id); const f1 = f0.replace(/^=NODE\.LLM\("([^"]*)",/, '=NODE.LLM("$1","開き直しても残る system",').replace(/,"開き直しても残る system",(""|"(?:[^"]|"")*")?,/, ',"開き直しても残る system",');
  await edit(a, f1);
  const sys1 = (await spec()).nodes.find(n => n.id === id).prompt.system;
  await hp.waitForTimeout(600);
  await hp.reload(); await hp.waitForFunction(() => window.__selfTest, null, { timeout: 180000 });
  const s = await spec(); R['⑥ 開き直す'] = { 直したとき: sys1, 開き直したあと: (s.nodes.find(n => n.id === id).prompt || {}).system };
  ok.persist = sys1 === '開き直しても残る system' && R['⑥ 開き直す'].開き直したあと === sys1; }

for (const [k, v] of Object.entries(R)) console.log(k + ': ' + JSON.stringify(v));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close(); srv.close();
process.exit(all ? 0 : 1);
