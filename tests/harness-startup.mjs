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

// ② 前回の続きがある端末（実機と同じ形: 型の無い schema を持つ改稿ループ）
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
R['② 続きを開いた'] = { JSONの名前: s2.metadata.name, 図: await canvasIds(),
  入出力欄: await p.$$eval('#ioOut [data-out]', e => e.map(x => x.dataset.out)),
  お知らせ: (await p.textContent('#resumeBanner')).replace(/\s+/g, ' ').slice(0, 60) };
// 図・JSON・入出力欄がすべて前回のハーネスになっていること（ここがずれていたのが不具合）
ok.restored = R['② 続きを開いた'].JSONの名前 === '改稿ループ'
  && JSON.stringify(R['② 続きを開いた'].図) === JSON.stringify(['in', 'draft', 'critic', 'result'])
  && JSON.stringify(R['② 続きを開いた'].入出力欄) === JSON.stringify(['result']);

// ②-2 前回のハーネスに直すところがあるなら、その場で直せるボタンが出る
R['②-2 検証'] = (await p.textContent('#vErr')).replace(/\s+/g, ' ').slice(0, 70);
ok.fixable = (await p.locator('#vErr button').count()) >= 1;

// ③ 「はじめから」で例に戻り、Checkpointが消える
ok.freshBtn = await p.isVisible('#cpFresh');
await tap('#cpFresh');
const s3 = await spec();
R['③ はじめから'] = { name: s3.metadata.name, 図: await canvasIds(),
  お知らせ消えた: !(await p.isVisible('#resumeBanner.show')),
  Checkpoint: await p.evaluate(() => localStorage.getItem('harness_vslice_cp_v090')),
  検証: (await p.textContent('#vErr')).trim() || '（エラーなし）' };
ok.fresh2 = R['③ はじめから'].name === '内蔵LLM直列' && R['③ はじめから'].Checkpoint === null
  && R['③ はじめから'].お知らせ消えた && R['③ はじめから'].検証 === '（エラーなし）';

// ④ そのまま実行できる（例はmockではないので、重みが無いこの環境では MODEL_LOAD_FAILED で終わる。
//    「検証で止まる」のではなく「実行に入る」ことを見る）
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed|cancelled)/.test(document.querySelector('#stateline').textContent), null, { timeout: 90000 });
R['④ そのまま実行'] = { state: (await p.textContent('#stateline')).slice(0, 50),
  ログ: (await p.textContent('#log')).replace(/\s+/g, ' ').slice(0, 80) };
ok.runs = !R['④ そのまま実行'].ログ.includes('VALIDATE') && R['④ そのまま実行'].ログ.includes('INPUT');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
