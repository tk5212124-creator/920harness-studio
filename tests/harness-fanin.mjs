// 1つの入口に複数の線が入るとき（合流）の扱いと、ノード編集でのモデル選択、
// 入力直下の実行ボタンを、タッチ端末として確かめる。
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
const paste = async obj => { await tap('#btnImport'); await p.fill('#imText', JSON.stringify(obj)); await tap('#imGo'); await tap('#imApply'); };
const vErr = async () => (await p.textContent('#vErr')).replace(/\s+/g, ' ');

const 合流前 = {
  metadata: { name: "合流", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input", routing: { mode: "parallel", failurePolicy: "fail_fast" } },
          { id: "A", type: "llm", provider: "m", mock: { tag: "A" } },
          { id: "B", type: "llm", provider: "m", mock: { tag: "B" } },
          { id: "C", type: "llm", provider: "m", mock: { echoInput: true } },
          { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } },
          { from: { node: "in", port: "out" }, to: { node: "B", port: "in" } },
          { from: { node: "A", port: "out" }, to: { node: "C", port: "in" } },
          { from: { node: "C", port: "out" }, to: { node: "out", port: "in" } }] };

// ① 2本目を繋いだら、確認を出さずにそのまま受け取れる形になる
await paste(合流前);
await tap('.nd[data-id="B"] .port.pout');
await tap('.nd[data-id="C"] .port.pin');
R['① 繋いだ直後のお知らせ'] = (await p.textContent('#hint')).replace(/\s+/g, ' ').slice(0, 60);
ok.noSheet = !(await p.isVisible('#sheet.show'));      // 毎回の確認シートは出さない
const s1 = await spec();
R['① まとめた結果'] = { 'Cの入口': s1.nodes.find(n => n.id === 'C').inputs,
  位置: s1.edges.filter(e => e.to.node === 'C').map(e => e.position), 検証: await vErr() };
ok.many = s1.nodes.find(n => n.id === 'C').inputs.in.cardinality === 'many'
  && JSON.stringify(R['① まとめた結果'].位置) === '[0,1]' && R['① まとめた結果'].検証.trim() === '';
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['① 実行'] = (await p.textContent('#stateline')).slice(0, 90);
R['① 出力欄'] = (await p.textContent('#ioOut [data-out="out"]')).replace(/\s+/g, ' ').slice(0, 70);
ok.manyRun = R['① 実行'].includes('success') && R['① 出力欄'].includes('A1') && R['① 出力欄'].includes('B1');

// ② すでに壊れているSpecを取り込むと、その場で直せるボタンが出る
const 壊れた = JSON.parse(JSON.stringify(合流前));
壊れた.edges.push({ from: { node: "B", port: "out" }, to: { node: "C", port: "in" } });
await paste(壊れた);
R['② 取り込み直後の検証'] = (await vErr()).slice(0, 60);
const fixBtn = p.locator('#vFixFanIn');
ok.fixOffered = (await fixBtn.count()) === 1 && (await fixBtn.textContent()).includes('C の入口');
await fixBtn.tap(); await p.waitForTimeout(150);
await tap('#miMany');
R['② 直した後の検証'] = (await vErr()).trim() || '（エラーなし）';
ok.fixed = R['② 直した後の検証'] === '（エラーなし）';

// ③ 「Joinを挟む」を選ぶと Join ノードができて、そのまま実行できる
await paste(壊れた);
await tap('#vFixFanIn');
await tap('#miJoin');
const s3 = await spec();
const jn = s3.nodes.find(n => n.type === 'join');
R['③ 挟んだJoin'] = { id: jn && jn.id, op: jn && jn.op,
  Joinへの線: s3.edges.filter(e => jn && e.to.node === jn.id).map(e => `${e.from.node}#${e.position}`),
  Joinから: s3.edges.filter(e => jn && e.from.node === jn.id).map(e => e.to.node), 検証: (await vErr()).trim() };
ok.join = !!jn && R['③ 挟んだJoin'].Joinへの線.length === 2 && R['③ 挟んだJoin'].Joinから[0] === 'C'
  && R['③ 挟んだJoin'].検証 === '';
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['③ 実行'] = (await p.textContent('#stateline')).slice(0, 60);
ok.joinRun = R['③ 実行'].includes('success');

// ④ ノード編集で「内蔵LLM」を選ぶと providers ができ、モデルを一覧から選べる
await paste(合流前);
await tap('.nd[data-id="A"]');
await p.selectOption('[data-f="__prov"]', '__webllm'); await p.waitForTimeout(250);
const s4 = await spec();
R['④ 内蔵LLMを選ぶ'] = { providers: s4.providers, 'Aのprovider': s4.nodes.find(n => n.id === 'A').provider };
const modelSel = p.locator('[data-f="model"]');
R['④ モデルの選択肢'] = await modelSel.locator('option').allTextContents();
ok.builtin = s4.providers.local && s4.providers.local.adapter === 'webllm'
  && s4.nodes.find(n => n.id === 'A').provider === 'local'
  && R['④ モデルの選択肢'].some(t => /gemma3-1b/.test(t)) && R['④ モデルの選択肢'].some(t => /Qwen2\.5-0\.5B/.test(t));
await p.selectOption('[data-f="model"]', 'Llama-3.2-1B-Instruct-q4f16_1-MLC'); await p.waitForTimeout(250);
R['④ 選んだモデル'] = (await spec()).nodes.find(n => n.id === 'A').model;
ok.pickModel = R['④ 選んだモデル'] === 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
await tap('#shClose');

// ⑤ 入力の直下の実行ボタンが効く
await paste(合流前);
await tap('#runTop');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['⑤ 上の実行ボタン'] = (await p.textContent('#stateline')).slice(0, 40);
ok.runTop = R['⑤ 上の実行ボタン'].includes('success');

// ⑥ 直すところが残っているのに実行を押したら、押したそばに理由が出る（無反応にしない）
await paste(壊れた);
await tap('#runTop');
R['⑥ 実行できないときの表示'] = (await p.textContent('#ioStatus')).replace(/\s+/g, ' ').slice(0, 80);
ok.blockedShown = R['⑥ 実行できないときの表示'].includes('実行できない')
  && R['⑥ 実行できないときの表示'].includes('複数incoming');

// ⑦ 別々の分岐から来ている2本目は、確認を出さずに Join を1つ挟む
const 別分岐 = {
  metadata: { name: "別分岐", version: "1" }, providers: { m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input", routing: { mode: "parallel", failurePolicy: "fail_fast" } },
          { id: "A", type: "llm", provider: "m", mock: { tag: "A" }, routing: { mode: "parallel", failurePolicy: "fail_fast" } },
          { id: "B", type: "llm", provider: "m", mock: { tag: "B" }, routing: { mode: "parallel", failurePolicy: "fail_fast" } },
          { id: "X", type: "llm", provider: "m", mock: { echoInput: true }, inputs: { in: { type: "any", cardinality: "many" } } },
          { id: "Y", type: "llm", provider: "m", mock: { echoInput: true } },
          { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "A", port: "in" } },
          { from: { node: "in", port: "out" }, to: { node: "B", port: "in" } },
          { from: { node: "A", port: "out" }, to: { node: "X", port: "in" }, position: 0 },
          { from: { node: "B", port: "out" }, to: { node: "X", port: "in" }, position: 1 },
          { from: { node: "A", port: "out" }, to: { node: "Y", port: "in" } },
          { from: { node: "X", port: "out" }, to: { node: "out", port: "in" } }] };
await paste(別分岐);
await tap('.nd[data-id="B"] .port.pout');
await tap('.nd[data-id="Y"] .port.pin');      // B → Y（A と B は別々の分岐）
R['⑦ 繋いだ直後'] = (await p.textContent('#hint')).replace(/\s+/g, ' ').slice(0, 50);
ok.autoJoin = !(await p.isVisible('#sheet.show')) && R['⑦ 繋いだ直後'].includes('Join');
const s7b = await spec();
R['⑦ できたJoin'] = { join: s7b.nodes.filter(n => n.type === 'join').map(n => n.id), 検証: (await vErr()).trim() || '（エラーなし）' };
ok.autoJoinOk = R['⑦ できたJoin'].join.length >= 1 && R['⑦ できたJoin'].検証 === '（エラーなし）';
await tap('#reset');
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['⑦ 実行'] = (await p.textContent('#stateline')).slice(0, 40);
ok.autoJoinRun = R['⑦ 実行'].includes('success');

// ⑧ まとめて受け取ったあと、受け取り方をノード編集で変えられる
await paste(合流前);
await tap('.nd[data-id="B"] .port.pout');
await tap('.nd[data-id="C"] .port.pin');
await tap('.nd[data-id="C"]');
R['⑧ 受け取り方の選択肢'] = await p.locator('[data-f="__merge"] option').allTextContents();
ok.mergeUI = R['⑧ 受け取り方の選択肢'].length === 5 && R['⑧ 受け取り方の選択肢'][0].includes('改行');
await p.selectOption('[data-f="__merge"]', 'markdown'); await p.waitForTimeout(250);
await tap('#mgAuto');
R['⑧ 選んだ受け取り方'] = (await spec()).nodes.find(n => n.id === 'C').merge;
ok.mergeSet = R['⑧ 選んだ受け取り方'].op === 'markdown' && R['⑧ 選んだ受け取り方'].labels.join() === 'A,B';
await tap('#shClose');
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['⑧ 実行'] = (await p.textContent('#stateline')).slice(0, 40);
ok.mergeRun = R['⑧ 実行'].includes('success');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
