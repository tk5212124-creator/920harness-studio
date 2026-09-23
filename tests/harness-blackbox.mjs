// 「落ちたらログが取れない」を潰す。
// 実際に使われている大きいハーネス（v13.1）を画面へ貼って本物の「実行」で走らせ、
// **推論の途中でレンダラを本当にクラッシュさせる**（イベントは一切来ない）。
// そのあと開き直して、
//   ① どこで消えたか（始めたのに終わっていない記録）が残っている
//   ② 開いた直後に知らせが出て、記録をそのままコピーできる
//   ③ 捨てたら知らせが消える
// を確かめる。localStorage は同期なので、書き終わった分は落ちても消えないことが前提。
import fs from 'fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const here = new URL('.', import.meta.url).pathname;
const FILE = 'file://' + new URL('../harness.html', import.meta.url).pathname;
const spec = fs.readFileSync(here + 'fixtures/v13.1-token-association.json', 'utf8');
const stub = fs.readFileSync(here + 'fixtures/webllm-stub.js', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  permissions: ['clipboard-read', 'clipboard-write'] });
const R = {}, ok = {};
const errs = [];
const newPage = async () => {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(FILE);
  await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
  return p;
};
const tap = async (p, sel) => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const paste = async p => {
  await tap(p, '#viewSeg button[data-v="json"]');
  await p.evaluate(s => { const t = document.querySelector('#spec'); t.value = s; t.dispatchEvent(new Event('input')); }, spec);
  await p.waitForTimeout(600);
  await p.evaluate(stub);
  await p.evaluate(() => window.__installStub());
};

// ⓪ 自己テスト（開くだけで200件以上の実行を回す）が記録を埋めてしまわないこと
//    ここが埋まると、本物の実行の記録が押し出されて消える（v0.34.0 の実機で起きた）
let p = await newPage();
R['⓪ 開いた直後'] = await p.evaluate(() => { const r = window.__bb.read();
  return { 自己テストの記録: r ? r.rows.length : 0,
    自己テスト: window.__selfTest.pass + '/' + window.__selfTest.total,
    全部通る: window.__selfTest.pass === window.__selfTest.total,
    mute: window.__bb.state().mute }; });
ok.noSelfTestNoise = R['⓪ 開いた直後'].自己テストの記録 === 0 && R['⓪ 開いた直後'].全部通る;

// ① ふつうに最後まで走らせると、記録は「きれいに終わった」で閉じる
await paste(p);
await tap(p, '#runTop');
{ const t0 = Date.now();
  for (;;) { const st = await p.evaluate(() => document.querySelector('#stateline').textContent);
    if (/^state: (success|failed|cancelled|paused)/.test(st) || Date.now() - t0 > 90000) break;
    await p.waitForTimeout(400); } }
R['① ふつうの実行'] = await p.evaluate(() => { const r = window.__bb.read();
  const k = r.rows.map(x => x.e), c = r.rows.filter(x => x.e === 'call');
  return { state: document.querySelector('#stateline').textContent.slice(0, 40),
    件数: r.rows.length, 種類: [...new Set(k)], 最初: k.slice(0, 3), 最後: k[k.length - 1],
    推論: c.length, 字数がある: c.every(x => x.ch > 0), 時間がある: c.every(x => x.ms != null),
    モデル名がある: c.every(x => !!x.mdl), clean: r.clean, open: r.open,
    読み込み: r.rows.filter(x => x.e === 'load').length }; });
// 読み込みの記録に「文脈の窓」と「必要メモリの目安」が入っている（落ちたときの切り分けに要る）
R['① 読み込みの記録'] = await p.evaluate(() => {
  const l = window.__bb.read().rows.filter(x => x.e === 'load');
  return { 件数: l.length, 一件目: l[0] || null }; });
ok.loadFields = R['① 読み込みの記録'].件数 >= 1
  && R['① 読み込みの記録'].一件目.m === 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
ok.normal = R['① ふつうの実行'].clean === true && R['① ふつうの実行'].open === null
  && R['① ふつうの実行'].最初[0] === 'run' && R['① ふつうの実行'].最初[1] === 'dev'
  && R['① ふつうの実行'].最後 === 'end' && R['① ふつうの実行'].推論 === 21
  && R['① ふつうの実行'].字数がある && R['① ふつうの実行'].時間がある && R['① ふつうの実行'].モデル名がある
  && R['① ふつうの実行'].読み込み >= 1;

// ② きれいに終わった回のあとに開き直しても、知らせは出ない
await p.reload(); await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
R['② きれいに終わった次の起動'] = await p.evaluate(() => ({
  知らせ: !!document.querySelector('#bbOpenPrev'),
  前回のclean: (window.__bb.prev() || {}).clean }));
ok.noNoticeWhenClean = R['② きれいに終わった次の起動'].知らせ === false
  && R['② きれいに終わった次の起動'].前回のclean === true;

// ③ 3回目の推論の途中で、レンダラを本当にクラッシュさせる（pagehide も unload も来ない）
await paste(p);
await p.evaluate(() => { window.__stub.hangAt = 3; });
p.locator('#runTop').first().tap().catch(() => {});
await p.waitForFunction(() => { const r = window.__bb.read();
  return r && r.open && r.open.e === 'call' && r.open.i === 3; }, null, { timeout: 60000 });
const 落ちる直前 = await p.evaluate(() => window.__bb.read().open);
let crashed = false;
const cdp = await ctx.newCDPSession(p);
// Page.crash は返事を返す相手が死ぬので await しない。死んだページに触るのも避ける
cdp.send('Page.crash').catch(() => { crashed = true; });
await new Promise(r => setTimeout(r, 2000));
R['③ クラッシュ'] = { 落ちる直前, ページは死んだ: p.isClosed() || (await p.evaluate(() => 1).catch(() => 'dead')) === 'dead' };
ok.crashed = R['③ クラッシュ'].ページは死んだ === true && 落ちる直前.i === 3 && !!落ちる直前.n;

// ④ 開き直すと「どこで消えたか」が残っていて、知らせが出る
p = await newPage();
R['④ 開き直した'] = await p.evaluate(() => { const r = window.__bb.prev();
  const msg = [...document.querySelectorAll('.mini')].map(x => x.textContent)
    .find(t => /最後まで行かずに終わっている/.test(t)) || '';
  return { 知らせ: !!document.querySelector('#bbOpenPrev'), 文: msg.slice(0, 120),
    clean: r && r.clean, open: r && r.open, 最後に通った: r && r.cur,
    種類: r ? [...new Set(r.rows.map(x => x.e))] : null,
    端末: r ? (r.rows.find(x => x.e === 'dev') || null) : null }; });
// 落ちた回の「入れた値」と「最後に送った文」がそのまま読める（何を入力して落ちたかが分かる）
R['④ 入力と送った文'] = await p.evaluate(() => { const r = window.__bb.prev() || {};
  return { 入力: (r.input || {}).v || null,
    送った文: ((r.last || {}).msgs || '').slice(0, 90),
    送った先: { n: (r.last || {}).n, i: (r.last || {}).i, m: (r.last || {}).m,
      ctx: (r.last || {}).ctx, mt: (r.last || {}).mt },
    生成の途中: r.gen || null, 読み込みの途中: r.lprg || null }; });
ok.slots = /雨の日/.test(R['④ 入力と送った文'].入力 || '')
  && R['④ 入力と送った文'].送った文.length > 20
  && R['④ 入力と送った文'].送った先.i === 3
  && R['④ 入力と送った文'].送った先.n === R['④ 開き直した'].open.n
  && !!R['④ 入力と送った文'].読み込みの途中;
ok.notice = R['④ 開き直した'].知らせ === true && R['④ 開き直した'].clean === false
  && R['④ 開き直した'].open.e === 'call' && R['④ 開き直した'].open.i === 3
  && R['④ 開き直した'].open.n === 落ちる直前.n
  && /最後まで行かずに終わっている/.test(R['④ 開き直した'].文)
  && R['④ 開き直した'].種類.includes('load') && !!R['④ 開き直した'].端末;

// ⑤ 知らせから記録を開いて、そのままコピーできる
await tap(p, '#bbOpenPrev');
R['⑤ 記録を開く'] = await p.evaluate(() => ({
  見出し: (document.querySelector('#sheetBody h3') || {}).textContent || '',
  中身: (document.querySelector('#sheetBody pre') || {}).textContent || '',
  ボタン: [...document.querySelectorAll('#sheetBody button')].map(x => x.textContent) }));
await tap(p, '#bbCopyBtn');
const 貼れた = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
R['⑤ コピーした文'] = 貼れた.slice(0, 200);
ok.sheetSlots = /## 入力/.test(R['⑤ 記録を開く'].中身)
  && /## 最後にモデルへ送った文/.test(R['⑤ 記録を開く'].中身)
  && /雨の日/.test(R['⑤ 記録を開く'].中身);
ok.sheet = /途中で消えた/.test(R['⑤ 記録を開く'].中身)
  && /ここで消えた/.test(R['⑤ 記録を開く'].中身)
  && R['⑤ 記録を開く'].中身.includes(落ちる直前.n)
  && R['⑤ 記録を開く'].ボタン.length === 4
  && /落ちる前の記録/.test(貼れた) && /途中で消えた/.test(貼れた);

// ⑥ 「まとめてコピー」にも前回の記録が入る（相談先に貼る文が1つで済む）
await tap(p, '#bbCloseBtn');
await tap(p, '#repCopy');
const メモ = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
R['⑥ 調査用メモ'] = { 前回が入っている: /## 落ちる前の記録（前回/.test(メモ),
  今回が入っている: /## 落ちる前の記録（今回/.test(メモ), 字数: メモ.length };
ok.report = R['⑥ 調査用メモ'].前回が入っている && R['⑥ 調査用メモ'].今回が入っている;

// ⑥.4 「モデルの読み込み中に消えた」記録なら、知らせから省メモリにできる
{ const p2 = await ctx.newPage();
  p2.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p2.goto(FILE);
  await p2.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
  // 読み込み中に落ちた状態を作る（実機の記録と同じ形）
  await p2.evaluate(() => { window.__bb.clear();
    window.__bb.push('run', { tag: 'run', name: 'x', nodes: 3, edges: 2 });
    window.__bb.open('load', { n: '書く', a: 'webllm', m: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
      ctx: null, ctxSrc: '未指定(モデルの既定)', vram: 945 }); });
  await p2.reload(); await p2.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
  R['⑥.4 読み込み中に消えた'] = await p2.evaluate(() => ({
    知らせ: !!document.querySelector('#bbOpenPrev'),
    省メモリ: !!document.querySelector('#bbMemSave'),
    文: ([...document.querySelectorAll('.mini')].map(x => x.textContent)
          .find(t => /最後まで行かずに終わっている/.test(t)) || '').slice(0, 140) }));
  if (R['⑥.4 読み込み中に消えた'].省メモリ) {
    await p2.locator('#bbMemSave').first().tap(); await p2.waitForTimeout(300);
    R['⑥.4 省メモリを押した'] = await p2.evaluate(() => {
      const sp = JSON.parse(document.querySelector('#spec').value);
      const ov = Object.values(sp.providers || {}).map(d => (d.overrides || {}).context_window_size);
      return { providers: ov, 文: ([...document.querySelectorAll('.mini')].map(x => x.textContent)
        .find(t => /省メモリにした/.test(t)) || '').slice(0, 120) }; });
  }
  ok.loadNotice = R['⑥.4 読み込み中に消えた'].知らせ === true
    && R['⑥.4 読み込み中に消えた'].省メモリ === true
    && /モデルの読み込み/.test(R['⑥.4 読み込み中に消えた'].文)
    && /文脈の窓 未指定/.test(R['⑥.4 読み込み中に消えた'].文)
    && (R['⑥.4 省メモリを押した'] || {}).providers.some(v => v === 1024)
    && /省メモリにした/.test((R['⑥.4 省メモリを押した'] || {}).文 || '');
  await p2.close(); }

// ⑥.5 「1 Work Item」から入っても、実行の始まりと端末の限界が残る
//      （v0.34.0 では実行ボタン以外の入口が記録されず「実行: (実行前)」になった）
await p.evaluate(() => { window.__bb.clear(); window.__bb.state().runId = null; });
await tap(p, '#step'); await p.waitForTimeout(300);
await tap(p, '#step'); await p.waitForTimeout(600);
R['⑥.5 1 Work Item'] = await p.evaluate(() => { const r = window.__bb.read();
  return { 種類: r ? r.rows.map(x => x.e) : null, runId: (r || {}).runId,
    tag: r && r.rows[0] ? r.rows[0].tag : null }; });
ok.stepRecorded = R['⑥.5 1 Work Item'].種類 !== null
  && R['⑥.5 1 Work Item'].種類[0] === 'run' && R['⑥.5 1 Work Item'].種類[1] === 'dev'
  && R['⑥.5 1 Work Item'].tag === 'step' && !!R['⑥.5 1 Work Item'].runId;

// ⑦ 捨てたら知らせは出ない
await tap(p, '#bbOpenPrev');
await tap(p, '#bbClearBtn');
await p.reload(); await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
R['⑦ 捨てたあと'] = await p.evaluate(() => ({ 知らせ: !!document.querySelector('#bbOpenPrev'),
  前回: window.__bb.prev() }));
// 捨てたので「実行の始まり」が無い＝報せることが無い（開き直しで付く left / vis だけが残る）
ok.cleared = R['⑦ 捨てたあと'].知らせ === false
  && (R['⑦ 捨てたあと'].前回 === null
     || (R['⑦ 捨てたあと'].前回.startedRun === false && R['⑦ 捨てたあと'].前回.open === null));

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
