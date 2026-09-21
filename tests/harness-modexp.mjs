// モジュール（部分ハーネスの再利用）と「くらべる（実験）」を、
// iPhone相当のタッチ端末として操作して確かめる。
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + new URL('../harness.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));
const paste = async obj => { await p.evaluate(o => { const t = document.querySelector('#spec'); t.value = JSON.stringify(o, null, 1); t.dispatchEvent(new Event('input')); }, obj); await p.waitForTimeout(250); };
const vErr = async () => (await p.textContent('#vErr')).replace(/\s+/g, ' ').trim();

const base = {
  metadata: { name: "書き直し", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" },
          { id: "書く", type: "llm", provider: "m", mock: { tag: "案" } },
          { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "書く", port: "in" } },
          { from: { node: "書く", port: "out" }, to: { node: "out", port: "in" } }] };

// ① 「書き出す」から、いまのハーネスをモジュールにする
await paste(base);
await tap('#btnExport');
await p.fill('#exModName', '書き直し'); await p.fill('#exModVer', '2');
await tap('#exModSave');
R['① 作ったあと'] = await p.textContent('#exModInfo');
const s1 = await spec();
R['① modules'] = { keys: Object.keys(s1.modules || {}), version: (s1.modules || {})['書き直し'].version,
  中のノード: ((s1.modules || {})['書き直し'].spec.nodes || []).map(n => n.id) };
ok.saveModule = R['① modules'].keys.join() === '書き直し' && R['① modules'].version === '2'
  && R['① modules'].中のノード.join() === 'in,書く,out'
  && R['① 作ったあと'].includes('入口 in') && !(s1.modules['書き直し'].spec.modules);
await tap('#shClose');

// ② モジュールノードを足して、入口・出口が見える
await tap('#addNode'); await tap('[data-add="module"]');
R['② 選択肢'] = await p.locator('[data-f="module"] option').allTextContents();
R['② 説明'] = (await p.textContent('#sheetBody')).replace(/\s+/g, ' ');
ok.moduleNode = R['② 選択肢'].some(t => t.includes('書き直し（v2')) && R['② 説明'].includes('入口: in')
  && R['② 説明'].includes('出口: out');
const modId = (await spec()).nodes.find(n => n.type === 'module').id;
await tap('#shClose');

// ③ モジュールを2か所から呼ぶ形にして実行する（展開されて中のノード名が出る）
await paste({ ...base, metadata: { name: "外側", version: "1" },
  modules: { "書き直し": { version: "2", spec: base } },
  nodes: [{ id: "in", type: "input", routing: { mode: "parallel", failurePolicy: "fail_fast" } },
          { id: "w1", type: "module", module: "書き直し" },
          { id: "w2", type: "module", module: "書き直し" },
          { id: "jn", type: "join", op: "json_array", inputs: { items: { type: "any", cardinality: "many" } } },
          { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "w1", port: "in" } },
          { from: { node: "in", port: "out" }, to: { node: "w2", port: "in" } },
          { from: { node: "w1", port: "out" }, to: { node: "jn", port: "items" }, position: 0 },
          { from: { node: "w2", port: "out" }, to: { node: "jn", port: "items" }, position: 1 },
          { from: { node: "jn", port: "out" }, to: { node: "out", port: "in" } }] });
R['③ 検証'] = await vErr() || '（エラーなし）';
await tap('#runTop');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 20000 });
R['③ 実行'] = (await p.textContent('#stateline')).slice(0, 70);
R['③ ログ'] = (await p.textContent('#log')).includes('w1__書く') && (await p.textContent('#log')).includes('モジュール w1');
R['③ 表のノード'] = await p.locator('#nodeTable tbody tr td:first-child').allTextContents();
ok.moduleRun = R['③ 検証'] === '（エラーなし）' && R['③ 実行'].includes('success')
  && R['③ ログ'] && R['③ 表のノード'].includes('w1__書く') && R['③ 表のノード'].includes('w2__書く');

// ④ 再帰は検証で落ちる
await paste({ metadata: { name: "再帰", version: "1" },
  modules: { A: { version: "1", spec: { nodes: [{ id: "i", type: "input" }, { id: "m", type: "module", module: "A" }, { id: "o", type: "output" }], edges: [] } } },
  nodes: [{ id: "in", type: "input" }, { id: "m", type: "module", module: "A" }, { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "m", port: "in" } },
          { from: { node: "m", port: "out" }, to: { node: "out", port: "in" } }] });
R['④ 再帰の検証'] = await vErr();
ok.recursion = /再帰/.test(R['④ 再帰の検証']);

// ⑤ くらべる（実験）: 2つの入力 × 2回ずつ を順番にまわして表にする
await paste({ metadata: { name: "ためし", version: "3" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" },
          { id: "A", type: "llm", provider: "m", mock: { fixed: { score: 7 } },
            schema: { type: "object", required: ["score"], properties: { score: { type: "integer" } } } },
          { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } },
          { from: { node: "A", port: "out" }, to: { node: "out", port: "in" } }] });
await tap('#btnExp');
await p.fill('#expIn', '質問1\n{"in":"質問2"}');
await p.fill('[data-f="__expN"]', '2');
await p.fill('[data-f="__expPick"]', 'score');
await tap('#expRun');
await p.waitForFunction(() => /終わり/.test((document.querySelector('#expOut') || {}).textContent || ''), null, { timeout: 40000 });
R['⑤ 見出し'] = await p.locator('#expOut .exprows thead th').allTextContents();
R['⑤ 行数'] = await p.locator('#expOut .exprows tbody tr').count();
R['⑤ 1行目'] = await p.locator('#expOut .exprows tbody tr').first().locator('td').allTextContents();
R['⑤ 集計'] = { 見出し: await p.locator('#expOut .expstats thead th').allTextContents(),
  行: await p.locator('#expOut .expstats tbody tr').first().locator('td').allTextContents() };
ok.experiment = R['⑤ 行数'] === 4 && R['⑤ 見出し'].includes('score') && R['⑤ 見出し'].includes('呼出')
  && R['⑤ 1行目'][2] === 'success' && R['⑤ 1行目'][3] === '1';
// 集計は 変種 × 入力 ごと（2入力 × 2回 = 2行）で、成功率と result.score の平均が出る
ok.expStats = R['⑤ 集計'].見出し.includes('成功率') && R['⑤ 集計'].見出し.includes('result.score 平均')
  // 実験で見たい失敗の内訳も列になっている
  && ['形エラー率', '切れて再試行', '形違いで再試行', '代わりの値で通した率', '止めたノード', 'エラーの種類']
       .every(h => R['⑤ 集計'].見出し.includes(h))
  && (await p.locator('#expOut .expstats tbody tr').count()) === 2
  && R['⑤ 集計'].行[2] === '2' && R['⑤ 集計'].行[5] === '100%';
// 途中結果は残る（開き直しても消えない）
await tap('#shClose'); await tap('#btnExp'); await p.waitForTimeout(300);
R['⑤ 開き直し'] = await p.locator('#expOut .exprows tbody tr').count();
ok.expKeep = R['⑤ 開き直し'] === 4;
await tap('#expClear'); await p.waitForTimeout(200);
ok.expClear = (await p.locator('#expOut .exprows tbody tr').count()) === 0;
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
