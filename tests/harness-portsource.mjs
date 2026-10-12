// 出口が運ぶもの（ports[].source）を、iPhone 相当のタッチ端末として画面から選んで確かめる。
//   ① 出口のプルダウンに「値のほか」（入ってきた値・送った文・エラー情報）が出る。LLM ノードには送った文がある・計算ノードには無い
//   ② 選ぶと JSON の ports[].source に入り、図の出口の名前も変わる
//   ③ エラー情報を選んで onError が止めるままなら、画面に注意が出て、実行前の検証で止まる
//   ④ onError を「このノードだけ止めて…」にして実行: 値の出口には流れず、送った文とエラー情報だけが出力に届く
//   ⑤ 成功する回: 値と送った文が届き、エラー情報は届かない
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + new URL('../harness.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 120000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));
const paste = async obj => { await p.evaluate(o => { const t = document.querySelector('#spec'); t.value = JSON.stringify(o, null, 1); t.dispatchEvent(new Event('input')); }, obj); await p.waitForTimeout(300); };
const nodeOf = async id => (await spec()).nodes.find(n => n.id === id);
const state = async () => { await p.waitForFunction(() => /^state: (success|failed|cancelled|paused)/.test(document.querySelector('#stateline').textContent), null, { timeout: 20000 });
  return (await p.textContent('#stateline')).slice(0, 60); };

const base = mock => ({
  metadata: { name: "出口", version: "1" },
  nodes: [{ id: "in", type: "input" },
          { id: "A", type: "llm", mock, prompt: { system: "要約する", template: { syntax: "mustache", mode: "interpolation_only", value: "文: {{{in}}}" } } },
          { id: "C", type: "calc", lang: "expr", code: "inputs[0]" },
          { id: "o1", type: "output" }, { id: "o2", type: "output" }, { id: "o3", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } },
          { from: { node: "A", port: "out" }, to: { node: "o1", port: "in" } },
          { from: { node: "in", port: "out" }, to: { node: "C", port: "in" } }] });

// ① プルダウン
await paste(base({ raw: "答え" }));
await tap('#viewSeg button[data-v="editor"]');
await tap('.nd[data-id="A"]');
await p.selectOption('[data-f="__split"]', 'split'); await p.waitForTimeout(300);
const optsA = await p.locator('[data-pf="key"][data-i="0"] option').allTextContents();
await tap('#shClose').catch(() => {});
await tap('.nd[data-id="C"]');
await p.selectOption('[data-f="__split"]', 'split'); await p.waitForTimeout(300);
const optsC = await p.locator('[data-pf="key"][data-i="0"] option').allTextContents();
await tap('#shClose').catch(() => {});
R['① 選べるもの'] = { LLM: optsA, 計算: optsC };
ok.options = optsA.some(t => t.startsWith('送った文')) && optsA.some(t => t.startsWith('エラー情報')) && optsA.some(t => t.startsWith('入ってきた値'))
  && !optsC.some(t => t.startsWith('送った文')) && optsC.some(t => t.startsWith('エラー情報'))
  && optsA.some(t => t.startsWith('返した原文')) && !optsC.some(t => t.startsWith('返した原文'));

// ② 選ぶと JSON と図に入る（A の出口: 1=値・2=送った文・3=エラー情報）
await tap('.nd[data-id="A"]');
while ((await p.locator('[data-pf="key"]').count()) < 3) { await tap('#pfAdd'); }
await p.selectOption('[data-pf="key"][data-i="1"]', '@request'); await p.waitForTimeout(250);
await p.selectOption('[data-pf="key"][data-i="2"]', '@error'); await p.waitForTimeout(250);
const a2 = await nodeOf('A');
R['② JSON'] = a2.ports; R['② 図の出口'] = await p.locator('.nd[data-id="A"] .plab').allTextContents();
ok.json = a2.ports[1].source === 'request' && a2.ports[2].source === 'error' && !a2.ports[0].source
  && R['② 図の出口'].includes('送った文') && R['② 図の出口'].includes('エラー情報');

// ③ onError が止めるままなら注意が出て、検証で止まる
const warnShown = await p.locator('#sheetBody').textContent();
await tap('#shClose').catch(() => {});
const s3 = await spec();
s3.edges.push({ from: { node: "A", port: a2.ports[1].id }, to: { node: "o2", port: "in" } },
              { from: { node: "A", port: a2.ports[2].id }, to: { node: "o3", port: "in" } });
await paste(s3);
R['③ 注意と検証'] = { 注意: /エラー情報の出口は/.test(warnShown), 検証: (await p.textContent('#vErr')).replace(/\s+/g, ' ').slice(0, 90) };
ok.guard = R['③ 注意と検証'].注意 && /エラー情報の出口/.test(R['③ 注意と検証'].検証);

// ④ onError を skip にして失敗させる → 送った文とエラー情報だけが届く
{ const s = await spec(); const a = s.nodes.find(n => n.id === 'A'); a.mock = { fail: 'generic' }; await paste(s); }
await tap('.nd[data-id="A"]');
await p.selectOption('[data-f="__onError"]', 'skip'); await p.waitForTimeout(300);
await tap('#shClose').catch(() => {});
await tap('#run');
R['④ 失敗の回'] = { state: await state() };
const outOf = id => p.evaluate(id => { const v = window.__dbg.nodeOut(id); return v ? v.value : '（届かない）'; }, id);
R['④ 失敗の回'].値 = await outOf('o1'); R['④ 失敗の回'].送った文 = await outOf('o2'); R['④ 失敗の回'].エラー = await outOf('o3');
ok.skipRun = /success/.test(R['④ 失敗の回'].state) && R['④ 失敗の回'].値 === '（届かない）'
  && R['④ 失敗の回'].送った文.messages && R['④ 失敗の回'].送った文.messages[1].content === '文: ' + (await p.evaluate(() => window.__dbg.eng.inputForRun().in))
  && R['④ 失敗の回'].エラー.code === 'PROVIDER_ERROR' && R['④ 失敗の回'].エラー.handledAs === 'skip';

// ⑤ 成功する回
{ const s = await spec(); s.nodes.find(n => n.id === 'A').mock = { raw: '答え' }; await paste(s); }
await tap('#run');
R['⑤ 成功の回'] = { state: await state(), 値: await outOf('o1'), 送った文: !!((await outOf('o2')).messages), エラー: await outOf('o3') };
ok.successRun = /success/.test(R['⑤ 成功の回'].state) && R['⑤ 成功の回'].値 === '答え' && R['⑤ 成功の回'].送った文 && R['⑤ 成功の回'].エラー === '（届かない）';

for (const [k, v] of Object.entries(R)) console.log(k + ': ' + JSON.stringify(v).slice(0, 400));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
