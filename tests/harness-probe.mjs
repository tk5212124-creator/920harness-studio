// 落ちる原因の切り分け（端末で試す）が、落ちても続きから進むこと。
// モデルは差し替え（stub）。条件 A → E → F → J を選んで始め、E の推論の途中でレンダラを本当に落とす。
//  ① 条件ごとにページが読み込み直される（毎回まっさら）
//  ② 落ちた条件は「落ちた・最後に通った境界」として残り、次の条件へ進む
//  ③ F は resetChat を呼ばない／ほかは呼ぶ
//  ④ 全部終わると結果が出て、コピーできる
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'fs';
const here = new URL('.', import.meta.url).pathname;
const FILE = 'file://' + new URL('../harness.html', import.meta.url).pathname;
const stub = fs.readFileSync(here + 'fixtures/webllm-stub.js', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  permissions: ['clipboard-read', 'clipboard-write'] });
const errs = [], R = {}, ok = {};
let p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(FILE); await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
// 自分のハーネスを開いておく。切り分けは何度も読み込み直すが、終わったあとも同じハーネスのままであること
// （v0.38.0 の実機で「始めるを押したらハーネスが初期化された」）
const mine = { metadata: { name: '切り分けの前に開いていたハーネス' }, providers: { m: { adapter: 'mock' } },
  nodes: [{ id: 'in', type: 'input' }, { id: 'x', type: 'llm', provider: 'm', mock: { text: 'x' } }, { id: 'out', type: 'output' }],
  edges: [{ from: { node: 'in' }, to: { node: 'x' } }, { from: { node: 'x' }, to: { node: 'out' } }] };
await p.locator('#viewSeg button[data-v="json"]').first().tap();
await p.fill('#spec', JSON.stringify(mine)); await p.waitForTimeout(700);
await p.locator('#viewSeg button[data-v="editor"]').first().tap();

// 始める（A, E, F, J だけ選ぶ）
await p.locator('#probeOpen').first().tap(); await p.waitForTimeout(200);
await p.evaluate(() => { document.querySelectorAll('.prCase').forEach(x => { x.checked = ['A', 'E', 'F', 'J'].includes(x.value); }); });
// 始めるとページが読み込み直される。新しいページで stub を入れる（自己テストが終わってから・始まる3秒の間に）
const seen = [];
const armStub = async (hangAt) => {
  await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
  await p.evaluate(stub);
  await p.evaluate(h => { window.__installStub(); window.__stub.hangAt = h; }, hangAt);
  const st = await p.evaluate(() => { const P = JSON.parse(localStorage.getItem('hsprobe.v1') || 'null'); return P && { idx: P.idx, id: P.order[P.idx] }; });
  seen.push(st && st.id); return st;
};
await Promise.all([p.waitForNavigation(), p.locator('#prStart').first().tap()]);
// A（読み込みだけ）
let st = await armStub(null);
await p.waitForNavigation({ timeout: 30000 });
// E（推論の途中で落とす）
st = await armStub(1);
await p.waitForFunction(() => { const r = window.__bb.read(); return r && r.step && /7 create直前/.test(r.step.s); }, null, { timeout: 30000 });
R['E の最後の境界（落とす直前）'] = await p.evaluate(() => window.__bb.read().step.s);
(await ctx.newCDPSession(p)).send('Page.crash').catch(() => {});
await new Promise(r => setTimeout(r, 1500));
p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(FILE);
// F（resetChat なし）
st = await armStub(null);
const rF0 = await p.evaluate(() => window.__stub.resets);
await p.waitForNavigation({ timeout: 30000 });
// J（この読み込みの時点で、F の記録は「きれいに終わった回」として取り置かれている）
st = await armStub(null);
R['F の境界'] = await p.evaluate(() => { const k = window.__bb.kept('last');
  return k ? k.rows.filter(x => x.e === 'step').map(x => x.s) : null; });
await p.waitForNavigation({ timeout: 30000 });
// 全部終わったら結果のシートが出る
await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
await p.waitForFunction(() => { const P = JSON.parse(localStorage.getItem('hsprobe.v1') || 'null'); return P && !P.active; }, null, { timeout: 30000 });
await p.waitForTimeout(500);
R['条件の順番（読み込みごと）'] = seen;
R['結果'] = await p.evaluate(() => { const P = JSON.parse(localStorage.getItem('hsprobe.v1'));
  return Object.fromEntries(P.order.map(id => [id, { status: P.results[id].status, lastStep: P.results[id].lastStep || null,
    calls: (P.results[id].calls || []).length, loadMs: P.results[id].loadMs != null }])); });
R['シート'] = await p.evaluate(() => (document.querySelector('#sheetBody pre') || {}).textContent || '');
await p.locator('#prCopy').first().tap();
const copied = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));

R['終わったあとのハーネス'] = await p.evaluate(() => JSON.parse(document.querySelector('#spec').value).metadata.name);
ok.keepHarness = R['終わったあとのハーネス'] === mine.metadata.name;
const res = R['結果'];
ok.order = JSON.stringify(seen) === JSON.stringify(['A', 'E', 'F', 'J']);
ok.crashRecorded = res.E.status === 'crashed' && /7 create直前/.test(res.E.lastStep || '');
ok.continued = res.A.status === 'ok' && res.F.status === 'ok' && res.J.status === 'ok' && res.F.calls === 1 && res.J.calls === 1;
ok.sheet = /\*\*落ちた\*\*/.test(R['シート']) && /最後に通った境界: 7 create直前/.test(R['シート']) && /完走/.test(R['シート']);
ok.copy = /落ちる原因の切り分け/.test(copied) && /E\s+\*\*落ちた\*\*/.test(copied);
// F は resetChat を呼ばず、それ以外の境界（1〜12）はそろっている
const fs2 = R['F の境界'] || [];
ok.noResetInF = fs2.includes('3-4 resetChatしない（切り分け）') && !fs2.includes('3 resetChat開始')
  && ['1 engine取得開始','2 engine取得完了','5 形式の準備開始','6 形式の準備完了','7 create直前','8 create直後',
      '9 最初のchunk','10 生成完了','11 形の検査開始','12 形の検査完了'].every(x => fs2.includes(x));
// 何かが動いている途中に切り分けの続きが来ても、始めない・完走と書かない・読み込み直さない・記録を上書きしない
// （v0.39.0 の実機: 開いている途中に押した実行と重なり、断られたのに「完走」と書いて 0.4秒後に読み込み直し、実行を止めた）
{ const q = await ctx.newPage(); q.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await q.goto(FILE); await q.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
  await q.evaluate(() => {
    localStorage.setItem('hsprobe.v1', JSON.stringify({ active: true, order: ['A', 'F'], idx: 0, results: {}, startedAt: Date.now(),
      opts: { model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', ctx: 1024, prefill: null, worker: true } }));
    window.__sameページ = 1;
    window.__dbg.eng.exclusive('実行', () => new Promise(r => { window.__release = r; }));   // 実行の途中
    window.__bb.push('run', { tag: 'run' }); window.__bb.push('log', { k: 'cp', m: '人が押した実行' });
    window.__dbg.eng.probeResume(); });
  await q.waitForTimeout(4200);
  R['動いている途中に来た切り分け'] = await q.evaluate(() => { const P = JSON.parse(localStorage.getItem('hsprobe.v1'));
    const r = window.__bb.read();
    return { 同じページ: window.__sameページ === 1, A: P.results.A || null, 続きが残る: P.active && P.idx === 0,
      知らせ: (document.querySelector('#probeBanner') || {}).textContent || '',
      切り分けの記録: r.rows.filter(x => x.e === 'run' && /^probe:/.test(x.tag || '')).length,
      最後の行: r.rows[r.rows.length - 1].m || r.rows[r.rows.length - 1].e }; });
  const w = R['動いている途中に来た切り分け'];
  ok.probeWaitsBusy = w.同じページ && w.A === null && w.続きが残る && /始めなかった/.test(w.知らせ) && /続ける/.test(w.知らせ)
    && w.切り分けの記録 === 0 && w.最後の行 === '人が押した実行';
  await q.evaluate(() => window.__release()); await q.close(); }
R['シート'] = R['シート'].slice(0, 700);
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
