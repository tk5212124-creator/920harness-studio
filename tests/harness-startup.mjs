// 開いた直後の状態を確かめる。
//  ① まっさらな端末: 例「内蔵LLM直列」が出て、何も押さずに実行できる（mockではない）
//  ② 前回の続き（Checkpoint）がある端末: 図・JSON・実行対象がすべて同じものになる
//     （実機では textarea だけ前回のSpecに戻っていて、画面は例のまま＝押しても例が動かなかった）
//  ③ 「はじめから」で例に戻り、Checkpointは消える
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const FILE = 'file://' + new URL('../harness.html', import.meta.url).pathname;
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));
const canvasIds = () => p.$$eval('.nd', e => e.map(x => x.dataset.id));

// ① まっさらな端末
await p.goto(FILE);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const s1 = await spec();
R['① 開いた直後'] = { name: s1.metadata.name, provider: (s1.providers.local || {}).adapter,
  mockなし: s1.nodes.every(n => !n.mock), 図: await canvasIds(), 検証: (await p.textContent('#vErr')).trim() || '（エラーなし）' };
ok.fresh = R['① 開いた直後'].provider === 'webllm' && R['① 開いた直後'].mockなし
  && R['① 開いた直後'].検証 === '（エラーなし）'
  && JSON.stringify(R['① 開いた直後'].図) === JSON.stringify(s1.nodes.map(n => n.id));

// ② 前回の続きがある端末（実機と同じ形: 前回が失敗している改稿ループ）
const 前回 = {
  metadata: { name: "改稿ループ", version: "1" },
  providers: { local: { adapter: "webllm", model: "SmolLM2-360M-Instruct-q4f16_1-MLC" } },
  nodes: [{ id: "in", type: "input" }, { id: "draft", type: "llm", provider: "local" },
          { id: "critic", type: "llm", provider: "local", routing: { mode: "first_match", onNoMatch: "error" },
            schema: { type: "object", required: ["score"], properties: { score: {} } } },
          { id: "result", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "draft", port: "in" } },
          { from: { node: "draft", port: "out" }, to: { node: "critic", port: "in" } },
          { from: { node: "critic", port: "out" }, to: { node: "draft", port: "in" }, priority: 0, loop: { id: "revise", max: 3, until: "critic.out.score >= 8" } },
          { from: { node: "critic", port: "out" }, to: { node: "result", port: "in" }, priority: 1, else: true }] };
await p.evaluate(sp => localStorage.setItem('harness_vslice_cp_v090', JSON.stringify(
  { runId: 'r1', status: 'failed', resumable: true, workQueue: [], specSnapshot: sp, errors: [] })), 前回);
await p.reload();
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const s2 = await spec();
R['② 続きがある端末で開いた直後'] = { JSONの名前: s2.metadata.name, 図: await canvasIds(),
  検証: (await p.textContent('#vErr')).trim() || '（エラーなし）',
  お知らせ: (await p.textContent('#resumeBanner')).replace(/\s+/g, ' ').slice(0, 60),
  Resumeは押せない: await p.locator('#resume').isDisabled() };
// 前回が失敗していても、開いた直後は「そのまま実行できる例」であること（ここが不具合だった）
ok.freshFirst = R['② 続きがある端末で開いた直後'].JSONの名前 === '内蔵LLM直列'
  && R['② 続きがある端末で開いた直後'].検証 === '（エラーなし）'
  && R['② 続きがある端末で開いた直後'].お知らせ.includes('前回の続きがある')
  && R['② 続きがある端末で開いた直後'].Resumeは押せない;

// ②-2 何も押さずに実行に入れる（検証で止まらない）
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed|cancelled)/.test(document.querySelector('#stateline').textContent), null, { timeout: 90000 });
R['②-2 そのまま実行'] = (await p.textContent('#log')).replace(/\s+/g, ' ').slice(0, 70);
ok.runsWithCp = !R['②-2 そのまま実行'].includes('VALIDATE') && R['②-2 そのまま実行'].includes('INPUT');

// ③ 「前回の続きを開く」を押したときだけ、前回のハーネスになる
await tap('#cpOpen');
const s3 = await spec();
R['③ 続きを開いた'] = { JSONの名前: s3.metadata.name, 図: await canvasIds(),
  入出力欄: await p.$$eval('#ioOut [data-out]', e => e.map(x => x.dataset.out)),
  直すボタン: await p.locator('#vErr button').count(), Resume: !(await p.locator('#resume').isDisabled()) };
ok.opened = R['③ 続きを開いた'].JSONの名前 === '改稿ループ'
  && JSON.stringify(R['③ 続きを開いた'].図) === JSON.stringify(['in', 'draft', 'critic', 'result'])
  && JSON.stringify(R['③ 続きを開いた'].入出力欄) === JSON.stringify(['result'])
  && R['③ 続きを開いた'].直すボタン >= 1 && R['③ 続きを開いた'].Resume;

// ④ 「はじめから」で例に戻り、Checkpointが消える
ok.freshBtn = await p.isVisible('#cpFresh');
await tap('#cpFresh');
const s4 = await spec();
R['④ はじめから'] = { name: s4.metadata.name, お知らせ消えた: !(await p.isVisible('#resumeBanner.show')),
  Checkpoint: await p.evaluate(() => localStorage.getItem('harness_vslice_cp_v090')),
  検証: (await p.textContent('#vErr')).trim() || '（エラーなし）' };
ok.fresh2 = R['④ はじめから'].name === '内蔵LLM直列' && R['④ はじめから'].Checkpoint === null
  && R['④ はじめから'].お知らせ消えた && R['④ はじめから'].検証 === '（エラーなし）';

// ⑤ 「捨てる」でも消える
await p.evaluate(sp => localStorage.setItem('harness_vslice_cp_v090', JSON.stringify(
  { runId: 'r2', status: 'failed', resumable: true, workQueue: [], specSnapshot: sp, errors: [] })), 前回);
await p.reload();
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
await tap('#cpDrop');
R['⑤ 捨てる'] = { Checkpoint: await p.evaluate(() => localStorage.getItem('harness_vslice_cp_v090')),
  お知らせ消えた: !(await p.isVisible('#resumeBanner.show')) };
ok.dropped = R['⑤ 捨てる'].Checkpoint === null && R['⑤ 捨てる'].お知らせ消えた;

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
