// 「構造を文にして出す → LLMに直させる → その出力を口に入れるとノードと線になる」往復を確認する。
// ③ではローカルLLM（OpenAI互換）の代わりに stub サーバを挿して、返答が実際に図になるところまで通す。
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + new URL('../harness.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 30000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const spec = () => p.evaluate(() => JSON.parse(document.querySelector('#spec').value));

// AIが返してくる想定の「直したハーネス」（前置きと ``` 付き＝よくある形）
const AI_REPLY = `わかりました。並列で2案を作ってJoinでまとめる形に直しました。

\`\`\`hsl
# hsl/1
harness "2案くらべ" v1

provider m = mock

node in: input
  route parallel failure fail_fast
node A: llm m
  prompt "案1: {{{in}}}"
  mock {"tag":"案A"}
node B: llm m
  prompt "案2: {{{in}}}"
  mock {"tag":"案B"}
node jn: join
  op json_array
  inputs {"items":{"type":"any","cardinality":"many"}}
node out: output

in -> A
in -> B
A -> jn.items position 0
B -> jn.items position 1
jn -> out
\`\`\`

必要なら点数で選ぶ分岐も足せます。`;

// ① 渡す文面: 文法と今の構造と指示が入る
await tap('#exSeg2 button[data-ex="ex1"]');
await tap('#btnAI');
await p.fill('[data-f="__inst"]', '並列で2案作ってJoinでまとめて');
await tap('#aiMake');
const prompt = await p.inputValue('#aiPrompt');
R['① 渡す文面'] = { 文字数: prompt.length, 文法: prompt.includes('HSL v1 の書き方'),
  いまの構造: prompt.includes('node draft: llm'), 指示: prompt.includes('並列で2案作ってJoinでまとめて'),
  出力形式の指定: prompt.includes('HSL の全文だけ') };
ok.prompt = Object.values(R['① 渡す文面']).slice(1).every(Boolean) && prompt.length > 800;

// ② 返答の取り出しが頑健か（``` 付き・前置き付き・裸・JSON・複数fence）
R['② 取り出し'] = await p.evaluate(reply => {
  const t = s => { try { const r = extractHarnessText(s); return r.kind + ':' + r.text.split('\n')[0].slice(0, 20); } catch (e) { return 'ERR:' + (e.message || e).slice(0, 20); } };
  return {
    fence付き: t(reply),
    裸: t('harness "x" v1\nnode in: input\nnode out: output\nin -> out'),
    前置きのみ: t('こう直しました:\nharness "y" v1\nnode in: input\nnode out: output\nin -> out'),
    JSON: t('```json\n{"nodes":[{"id":"in","type":"input"}],"edges":[]}\n```'),
    文章だけ: t('すみません、よく分かりませんでした。')
  };
}, AI_REPLY);
ok.extract = R['② 取り出し'].fence付き.startsWith('hsl:') && R['② 取り出し'].裸.startsWith('hsl:')
  && R['② 取り出し'].前置きのみ.startsWith('hsl:') && R['② 取り出し'].JSON.startsWith('json:')
  && R['② 取り出し'].文章だけ.startsWith('ERR:');

// ③ 口に貼る → 差分 → 適用 → 図が変わる
await p.fill('#aiIn', AI_REPLY);
await tap('#aiRead');
const diffText = await p.textContent('#aiResult');
R['③ 差分'] = diffText.replace(/\s+/g, ' ').slice(0, 180);
ok.diff = diffText.includes('+ ノード A') && diffText.includes('+ つながり in -> A') && diffText.includes('- ノード draft');
await tap('#aiApply');
const s3 = await spec();
R['③ 適用後'] = { name: s3.metadata.name, nodes: s3.nodes.map(n => n.id), edges: (s3.edges || []).length,
  図のノード数: await p.locator('.nd').count(), 図の線: await p.locator('#edges path.hit').count() };
ok.apply = s3.metadata.name === '2案くらべ' && s3.nodes.length === 5 && s3.edges.length === 5
  && R['③ 適用後'].図のノード数 === 5 && R['③ 適用後'].図の線 === 5;

// ④ 適用したものがそのまま動く
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['④ 実行'] = (await p.textContent('#stateline')).slice(0, 110);
ok.run = R['④ 実行'].includes('success') && R['④ 実行'].includes('案A');

// ⑤ 壊れた返答は、行番号付きで断り、AIに返す文面を出す
await tap('#btnAI');
await p.fill('#aiIn', '```\nharness "壊" v1\nnode a: llm\n  知らない設定 1\n```');
await tap('#aiRead');
R['⑤ 壊れた返答'] = (await p.textContent('#aiResult')).replace(/\s+/g, ' ').slice(0, 100);
ok.badReply = (await p.locator('#aiErrCopy').count()) === 1 && R['⑤ 壊れた返答'].includes('読み取れない');

// ⑥ この端末のLLM（stub）にやらせる → 返答が口に入り、差分が出て、適用でノードになる
await tap('#shClose');
await p.evaluate(reply => {
  const enc = s => new TextEncoder().encode(s);
  registerTransport('t', async (url, init) => {
    if (/\/models$/.test(url)) return new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const body = new ReadableStream({ start(c) {
      for (const chunk of reply.match(/[\s\S]{1,40}/g))
        c.enqueue(enc('data: ' + JSON.stringify({ choices: [{ delta: { content: chunk } }] }) + '\n\n'));
      c.enqueue(enc('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 120 } }) + '\n\n'));
      c.enqueue(enc('data: [DONE]\n\n')); c.close();
    } });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  });
}, AI_REPLY);
await tap('#btnImport');
await p.fill('#imText', JSON.stringify({ metadata: { name: "やらせる前", version: "1" },
  providers: { local: { adapter: "openai_local", endpoint: "http://stub/v1", model: "m1", transport: "t" }, m: { adapter: "mock" } },
  nodes: [{ id: "in", type: "input" }, { id: "a", type: "llm", provider: "m", mock: { text: "x" } }, { id: "out", type: "output" }],
  edges: [{ from: { node: "in", port: "out" }, to: { node: "a", port: "in" } }, { from: { node: "a", port: "out" }, to: { node: "out", port: "in" } }] }));
await tap('#imGo');
await tap('#btnAI');
await p.selectOption('[data-f="__aiProv"]', 'local');
await tap('#aiRun');
await p.waitForFunction(() => document.querySelector('#aiResult') && document.querySelector('#aiResult').textContent.includes('適用'), null, { timeout: 20000 });
R['⑥ LLMの返答が口に入った'] = { 返答の長さ: (await p.inputValue('#aiIn')).length,
  情報: (await p.textContent('#aiRunInfo')).slice(0, 40),
  差分: (await p.textContent('#aiResult')).replace(/\s+/g, ' ').slice(0, 120) };
await tap('#aiApply');
const s6 = await spec();
R['⑥ 適用後'] = { name: s6.metadata.name, nodes: s6.nodes.length, 図: await p.locator('.nd').count() };
ok.localLoop = s6.metadata.name === '2案くらべ' && s6.nodes.length === 5 && R['⑥ 適用後'].図 === 5;

// ⑦ route を書き忘れた返答は、適用する前に検証エラーとして示し、AIに返す文面を出す
await tap('#btnAI');
await p.fill('#aiIn', AI_REPLY.replace('  route parallel failure fail_fast\n', ''));
await tap('#aiRead');
R['⑦ route抜けの返答'] = (await p.textContent('#aiResult')).replace(/\s+/g, ' ').slice(-140);
ok.validateBeforeApply = R['⑦ route抜けの返答'].includes('検証エラー') && R['⑦ route抜けの返答'].includes('routing.mode')
  && (await p.locator('#aiErrCopy2').count()) === 1;
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
