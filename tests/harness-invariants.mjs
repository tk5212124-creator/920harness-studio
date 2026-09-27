// 終わった Run に「実際には動いていないのに running」が残らないこと（状態の食い違い）。
// ChatGPT からの報告（v0.31.1 の trace で branchGroups と output の attempt が running のまま）の回帰テスト。
// 10通りの形を Runtime で走らせ、stateViolations（Run を読むだけの自己点検）が空であることを見る。
// 最後に、実際に使われている大きいハーネス（v13.1・Map の中に並列）を画面の「実行」で走らせて同じことを見る。
import fs from 'fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const here = new URL('.', import.meta.url).pathname;
const FILE = 'file://' + new URL('../harness.html', import.meta.url).pathname;
const bigSpec = fs.readFileSync(here + 'fixtures/v13.1-token-association.json', 'utf8');
const stub = fs.readFileSync(here + 'fixtures/webllm-stub.js', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(FILE);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });

const R = await p.evaluate(async () => {
  const E = window.__dbg.eng;
  const PAR = { mode: 'parallel', failurePolicy: 'fail_fast' };
  const base = (nodes, edges) => ({ metadata: { name: 't', version: '1' }, providers: { m: { adapter: 'mock' } }, nodes, edges });
  const ed = (a, b2, extra) => Object.assign({ from: { node: a, port: 'out' }, to: { node: b2, port: 'in' } }, extra || {});
  const calc = (id, code, extra) => Object.assign({ id, type: 'calc', lang: 'js', code }, extra || {});
  const S = {};
  // 1. input -> calc -> output
  S['1 input→calc→output'] = base([{ id: 'in', type: 'input' }, calc('c', 'return 1;'), { id: 'out', type: 'output' }],
    [ed('in', 'c'), ed('c', 'out')]);
  // 2. 並列（A→B, A→C）両方成功・それぞれ出力へ
  S['2 並列 両方成功'] = base([{ id: 'in', type: 'input' }, calc('A', 'return 1;', { routing: PAR }),
    calc('B', 'return 2;'), calc('C', 'return 3;'), { id: 'o1', type: 'output' }, { id: 'o2', type: 'output' }],
    [ed('in', 'A'), ed('A', 'B'), ed('A', 'C'), ed('B', 'o1'), ed('C', 'o2')]);
  // 3. 並列 → 合流（join）
  S['3 並列→合流'] = base([{ id: 'in', type: 'input', routing: PAR }, calc('A', 'return "a";'), calc('B', 'return "b";'),
    { id: 'jn', type: 'join', op: 'json_array', inputs: { items: { type: 'any', cardinality: 'many' } } }, { id: 'out', type: 'output' }],
    [ed('in', 'A'), ed('in', 'B'), { from: { node: 'A', port: 'out' }, to: { node: 'jn', port: 'items' }, position: 0 },
     { from: { node: 'B', port: 'out' }, to: { node: 'jn', port: 'items' }, position: 1 }, ed('jn', 'out')]);
  // 4. 並列 + fail_fast 3本とも成功（下流にもう1段ある）
  S['4 fail_fast 全部成功'] = base([{ id: 'in', type: 'input', routing: PAR }, calc('A', 'return 1;'), calc('A2', 'return 11;'),
    calc('B', 'return 2;'), calc('C', 'return 3;'),
    { id: 'jn', type: 'join', op: 'json_array', inputs: { items: { type: 'any', cardinality: 'many' } } }, { id: 'out', type: 'output' }],
    [ed('in', 'A'), ed('in', 'B'), ed('in', 'C'), ed('A', 'A2'),
     { from: { node: 'A2', port: 'out' }, to: { node: 'jn', port: 'items' }, position: 0 },
     { from: { node: 'B', port: 'out' }, to: { node: 'jn', port: 'items' }, position: 1 },
     { from: { node: 'C', port: 'out' }, to: { node: 'jn', port: 'items' }, position: 2 }, ed('jn', 'out')]);
  // 5. 並列 + fail_fast 片方失敗（Run は failed。兄弟は cancel、group は failed）
  S['5 fail_fast 片方失敗'] = base([{ id: 'in', type: 'input', routing: PAR }, calc('A', 'throw new Error("わざと");'),
    calc('B', 'return 2;'), calc('B2', 'return 3;'),
    { id: 'jn', type: 'join', op: 'json_array', inputs: { items: { type: 'any', cardinality: 'many' } } }, { id: 'out', type: 'output' }],
    [ed('in', 'A'), ed('in', 'B'), ed('B', 'B2'),
     { from: { node: 'A', port: 'out' }, to: { node: 'jn', port: 'items' }, position: 0 },
     { from: { node: 'B2', port: 'out' }, to: { node: 'jn', port: 'items' }, position: 1 }, ed('jn', 'out')]);
  // 6. Map 本体が1本道 / 8. Map の done のあと通常ノードへ
  const mapNodes = body => [{ id: 'in', type: 'input' }, calc('列', 'return ["x","yy","zzz"];'),
    { id: '各件', type: 'map', map: { id: '各件' } }, ...body, calc('あと', 'return inputs[0];'), { id: 'out', type: 'output' }];
  S['6 Map 1本道 ＋ 8 done後に通常ノード'] = base(mapNodes([calc('判定', 'return String(value).length;')]),
    [ed('in', '列'), ed('列', '各件', { position: 0 }), ed('各件', '判定', { mapRole: 'body' }),
     ed('判定', '各件', { map: { id: '各件' }, position: 1 }), ed('各件', 'あと', { mapRole: 'done' }), ed('あと', 'out')]);
  // 7. Map の本体の中で並列（今回のハーネスと同じ形）
  S['7 Map本体の中で並列'] = base(mapNodes([calc('分ける', 'return value;', { routing: PAR }),
    calc('P1', 'return String(inputs[0]).length;'), calc('P2', 'return String(inputs[0]).toUpperCase();'),
    { id: '合わせ', type: 'join', op: 'json_array', inputs: { items: { type: 'any', cardinality: 'many' } } }]),
    [ed('in', '列'), ed('列', '各件', { position: 0 }), ed('各件', '分ける', { mapRole: 'body' }),
     ed('分ける', 'P1'), ed('分ける', 'P2'),
     { from: { node: 'P1', port: 'out' }, to: { node: '合わせ', port: 'items' }, position: 0 },
     { from: { node: 'P2', port: 'out' }, to: { node: '合わせ', port: 'items' }, position: 1 },
     ed('合わせ', '各件', { map: { id: '各件' }, position: 1 }), ed('各件', 'あと', { mapRole: 'done' }), ed('あと', 'out')]);
  // 9. 最後のノードから assert と output へ並列（ChatGPT の trace の fork#12 と同じ形）
  S['9 最後から点検と出力へ並列'] = base([{ id: 'in', type: 'input' }, calc('評価', 'return {score:9};', { routing: PAR }),
    { id: '点検', type: 'assert', lang: 'expr', onFail: 'continue', asserts: [{ name: '8点以上', expr: '評価.out.score >= 8', severity: 'fail' }] },
    { id: 'out', type: 'output' }],
    [ed('in', '評価'), ed('評価', '点検'), ed('評価', 'out')]);
  // 10. onError で止める／代わりの値（output 以外の早抜けの経路）
  S['10a onError=skip'] = base([{ id: 'in', type: 'input', routing: PAR }, calc('A', 'throw new Error("x");', { onError: 'skip' }),
    calc('B', 'return 1;'), { id: 'out', type: 'output' }], [ed('in', 'A'), ed('in', 'B'), ed('B', 'out')]);
  S['10b onError=value'] = base([{ id: 'in', type: 'input' }, calc('A', 'throw new Error("x");', { onError: 'value', onErrorValue: 5 }),
    { id: 'out', type: 'output' }], [ed('in', 'A'), ed('A', 'out')]);
  S['10c Map onItemError=null'] = base(mapNodes([calc('判定', 'if(value==="yy")throw new Error("x");return 1;')]).map(n => n.id === '各件' ? Object.assign({}, n, { onItemError: 'null' }) : n),
    [ed('in', '列'), ed('列', '各件', { position: 0 }), ed('各件', '判定', { mapRole: 'body' }),
     ed('判定', '各件', { map: { id: '各件' }, position: 1 }), ed('各件', 'あと', { mapRole: 'done' }), ed('あと', 'out')]);
  const out = {};
  // 11. fail_fast で落ちたあと Retry で走りきる（Retry は group と branch を running に戻す。終わったら確定し直す）
  { const sp = S['5 fail_fast 片方失敗'];
    const run = await E.fullRun(sp, { in: 'q' }, E.memStore(), null);
    const before = Object.values(run.branchGroups).map(g => g.status + '[' + Object.values(g.branches).map(x => x.status).join(',') + ']');
    const failed = Object.values(run.executions).find(e => e.status === 'failed');
    const fixed = JSON.parse(JSON.stringify(sp));
    fixed.nodes.find(n => n.id === 'A').code = 'return 1;';
    await E.retryExecution(fixed, run, failed.execId, E.memStore(), null, null);
    out['11 fail_fast の後 Retry で走りきる'] = { status: run.status, 違反: E.stateViolations(run), 前: before,
      groups: Object.values(run.branchGroups).map(g => g.activationId + ':' + g.status + '[' + Object.values(g.branches).map(x => x.status).join(',') + ']'),
      Aのattempts: failed.attempts.map(a => a.status) }; }
  for (const [name, sp] of Object.entries(S)) {
    const v = E.validate(sp);
    if (v.length) { out[name] = { validate: v }; continue; }
    const run = await E.fullRun(sp, { in: 'q' }, E.memStore(), null);
    const outAtt = Object.values(run.executions).filter(e => (sp.nodes.find(n => n.id === e.nodeId) || {}).type === 'output')
      .map(e => e.status + '/' + ((e.attempts || []).slice(-1)[0] || {}).status);
    out[name] = { status: run.status, 違反: E.stateViolations(run),
      groups: Object.values(run.branchGroups).map(g => g.activationId + ':' + g.status + '[' + Object.values(g.branches).map(x => x.status).join(',') + ']'),
      output: outAtt };
  }
  return out;
});

// 実際のハーネス（v13.1）を画面から走らせる
await p.locator('#viewSeg button[data-v="json"]').first().tap();
await p.evaluate(s => { const t = document.querySelector('#spec'); t.value = s; t.dispatchEvent(new Event('input')); }, bigSpec);
await p.waitForTimeout(600);
await p.evaluate(stub); await p.evaluate(() => window.__installStub());
await p.locator('#runTop').first().tap();
{ const t0 = Date.now();
  for (;;) { const st = await p.evaluate(() => document.querySelector('#stateline').textContent);
    if (/^state: (success|failed)/.test(st) || Date.now() - t0 > 90000) break;
    await p.waitForTimeout(300); } }
R['v13.1 実ハーネス（画面から）'] = await p.evaluate(() => { const run = window.__dbg.run();
  const tr = window.__dbg.eng.traceReport(window.__dbg.spec(), run);
  return { status: run.status, 違反: window.__dbg.eng.stateViolations(run),
    groups: Object.values(run.branchGroups).length,
    runningGroups: Object.values(run.branchGroups).filter(g => g.status === 'running').length,
    trace_running_groups: (tr.branchGroups || []).filter(g => g.status === 'running').length }; });

const ok = {};
for (const [k, v] of Object.entries(R)) {
  console.log(k + ': ' + JSON.stringify(v));
  const expectFailed = /片方失敗/.test(k);
  ok[k] = !v.validate && (v.違反 || []).length === 0 && v.status === (expectFailed ? 'failed' : 'success');
}
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
