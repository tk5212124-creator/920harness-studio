// 実際に使われている大きいハーネス（v13.1・23ノード / 32線 / 21回推論）を
// **JSONを一切変えずに** 画面へ貼って、本物の「実行」ボタンで走らせる。
// モデルだけページ内で差し替える（JSON は触らない）。差し替えた engine は
// 本物の webllm と同じ形で KV を積むので、resetChat が効いているかが測れる。
import fs from 'fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const here = new URL('.', import.meta.url).pathname;
const spec = fs.readFileSync(here + 'fixtures/v13.1-token-association.json', 'utf8');
const stub = fs.readFileSync(here + 'fixtures/webllm-stub.js', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
let crashed = false; p.on('crash', () => { crashed = true; });
await p.goto('file://' + new URL('../harness.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
await p.evaluate(stub);
await p.evaluate(() => window.__installStub());

// ① JSON をそのまま貼る（1文字も変えない）
await tap('#viewSeg button[data-v="json"]');
await p.evaluate(s => { const t = document.querySelector('#spec'); t.value = s; t.dispatchEvent(new Event('input')); }, spec);
await p.waitForTimeout(700);
R['① 貼ったあと'] = await p.evaluate(() => ({
  検証: ((document.querySelector('#vErr') || {}).textContent || '').trim(),
  いま: ((document.querySelector('#nowSpec') || {}).textContent || '').slice(0, 70),
  図のノード: document.querySelectorAll('.nd').length }));
ok.loaded = R['① 貼ったあと'].検証 === '' && R['① 貼ったあと'].図のノード === 23;
// 貼っただけで JSON が書き換わっていないこと（画面が勝手に直さない）
R['① JSONそのまま'] = await p.evaluate(s => {
  const now = document.querySelector('#spec').value;
  const a = JSON.stringify(JSON.parse(s)), c = JSON.stringify(JSON.parse(now));
  return { 同じ: a === c, 文字数: [now.length, s.length] }; }, spec);
ok.untouched = R['① JSONそのまま'].同じ;

const runIt = async (killReset, oomAt) => {
  await p.evaluate(([k, o]) => { const S = window.__stub;
    S.calls = 0; S.resets = 0; S.kvPeak = 0; S.oomAt = o; S.oomFired = 0; S.loads = 0; S.releases = 0;
    window.__killReset = !!k; window.__dbg.eng.ModelManager.reset(); S.eng = null; }, [killReset, oomAt || null]);
  await tap('#runTop');
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const st = await p.evaluate(() => (document.querySelector('#stateline') || {}).textContent || '').catch(() => null);
    if (st === null) break;
    if (/^state: (success|failed|cancelled|paused)/.test(st)) break;
    await p.waitForTimeout(400); }
  return p.evaluate(() => ({
    line: ((document.querySelector('#stateline') || {}).textContent || '').slice(0, 150),
    S: { calls: window.__stub.calls, resets: window.__stub.resets, kvPeak: window.__stub.kvPeak,
         loads: window.__stub.loads, releases: window.__stub.releases, oomFired: window.__stub.oomFired },
    表の行: document.querySelectorAll('#nodeTable tbody tr').length,
    使用量: ((document.querySelector('#totals') || {}).textContent || '').replace(/\s+/g, ' '),
    赤字: [...document.querySelectorAll('#log span.l-err')].map(x => x.textContent.trim().slice(0, 140)).slice(0, 6),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null }));
};

// ② そのまま実行して最後まで通る
const a = await runIt(false, null);
R['② 実行'] = a;
ok.ran = /state: success/.test(a.line) && a.S.calls === 21 && a.表の行 === 23 && a.赤字.length === 0;
// 1回ごとに会話をリセットしている（KV が積まれない）
ok.resetEveryCall = a.S.resets === a.S.calls;

// ③ 直す前（resetChat を呼べない engine）と比べて、KV の山が小さくなっている
const bfr = await runIt(true, null);
R['③ 直す前と比べる'] = { 直す前のKV: bfr.S.kvPeak, いまのKV: a.S.kvPeak, resets: [bfr.S.resets, a.S.resets] };
ok.kvSmaller = bfr.S.resets === 0 && bfr.S.kvPeak > a.S.kvPeak * 5;

// ④ 途中でメモリ不足が起きても、engine を捨てて読み直して走りきる
const c = await runIt(false, 10);
R['④ 途中でOOM'] = c;
ok.oomRecover = /state: success/.test(c.line) && c.S.oomFired === 1 && c.S.releases === 1 && c.S.loads >= 1
  && c.赤字.some(x => /リセットが要る/.test(x));

// ⑤ 使用量に Checkpoint のコストが出ている
ok.cpShown = /続きの保存/.test(a.使用量) && /書いた合計/.test(a.使用量);

R['pageerror'] = errs; R['crashed'] = crashed;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0 && !crashed;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
