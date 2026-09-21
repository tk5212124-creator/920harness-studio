// 外部LLMとの往復を確認する。
//   ① 書き出す（AIに渡す1枚）→ 人が外部LLMに貼る → ② 返ってきた文を口に入れる → 差分 → 適用
// アプリの中からLLMを呼ぶ仕組みは持たない（外部でやる方針のため）。
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

// 外部LLMが返してくる想定の文（前置きと ``` 付き＝よくある形）
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

// ① 「AIに渡す1枚」に文法・いまの構造・指摘・依頼が入る
await tap('#exSeg2 button[data-ex="ex1"]');
await tap('#btnExport');
await p.fill('[data-f="__inst"]', '並列で2案作ってJoinでまとめて');
await p.waitForTimeout(200);
const sheet1 = await p.inputValue('#exText');
R['① 渡す1枚'] = { 文字数: sheet1.length, 文法: sheet1.includes('HSL v1 の書き方'),
  いまの構造: sheet1.includes('node draft: llm'), 指摘: sheet1.includes('いま出ている指摘'),
  依頼: sheet1.includes('並列で2案作ってJoinでまとめて'), 出力形式: sheet1.includes('HSL の全文だけ') };
ok.sheet = Object.values(R['① 渡す1枚']).slice(1).every(Boolean) && sheet1.length > 1500;
// HSLだけ / JSONだけ にも切り替わる
await tap('#exMode button[data-m="hsl"]');
const onlyHsl = await p.inputValue('#exText');
await tap('#exMode button[data-m="json"]');
const onlyJson = await p.inputValue('#exText');
R['① 切替'] = { hsl: onlyHsl.split('\n')[0], json: onlyJson.split('\n')[0] };
ok.modes = onlyHsl.startsWith('# hsl/1') && onlyJson.startsWith('{');
await tap('#shClose');

// ② 返答の取り出しが頑健か
R['② 取り出し'] = await p.evaluate(reply => {
  const t = s => { try { const r = extractHarnessText(s); return r.kind + ':' + r.text.split('\n')[0].slice(0, 16); } catch (e) { return 'ERR'; } };
  return { fence付き: t(reply), 裸: t('harness "x" v1\nnode in: input\nnode out: output\nin -> out'),
    前置き付き: t('こう直しました:\nharness "y" v1\nnode in: input\nnode out: output\nin -> out'),
    JSON: t('```json\n{"nodes":[{"id":"in","type":"input"}],"edges":[]}\n```'),
    文章だけ: t('すみません、よく分かりませんでした。') };
}, AI_REPLY);
ok.extract = ['fence付き', '裸', '前置き付き'].every(k => R['② 取り出し'][k].startsWith('hsl:'))
  && R['② 取り出し'].JSON.startsWith('json:') && R['② 取り出し'].文章だけ === 'ERR';

// ③ 口に貼る → 差分が出る → 適用して図が変わる
await tap('#btnImport');
await p.fill('#imText', AI_REPLY);
await tap('#imGo');
const diffText = await p.textContent('#imResult');
R['③ 差分'] = diffText.replace(/\s+/g, ' ').slice(0, 170);
ok.diff = diffText.includes('+ ノード A') && diffText.includes('+ つながり in -> A') && diffText.includes('- ノード draft');
await tap('#imApply');
const s3 = await spec();
R['③ 適用後'] = { name: s3.metadata.name, nodes: s3.nodes.map(n => n.id),
  図のノード: await p.locator('.nd').count(), 図の線: await p.locator('#edges path.hit').count() };
ok.apply = s3.metadata.name === '2案くらべ' && s3.nodes.length === 5
  && R['③ 適用後'].図のノード === 5 && R['③ 適用後'].図の線 === 5;

// ④ 適用したものがそのまま動く（入出力パネルの入力が渡る）
await tap('#run');
await p.waitForFunction(() => /^state: (success|failed)/.test(document.querySelector('#stateline').textContent), null, { timeout: 15000 });
R['④ 実行'] = (await p.textContent('#stateline')).slice(0, 110);
ok.run = R['④ 実行'].includes('success') && R['④ 実行'].includes('案A');

// ⑤ 読めない返答は行番号付きで断り、AIに返す文面を出す
await tap('#btnImport');
await p.fill('#imText', '```\nharness "壊" v1\nnode a: llm\n  知らない設定 1\n```');
await tap('#imGo');
R['⑤ 読めない返答'] = (await p.textContent('#imResult')).replace(/\s+/g, ' ').slice(0, 90);
ok.badReply = (await p.locator('#imErrCopy').count()) === 1 && R['⑤ 読めない返答'].includes('読み取れない');

// ⑥ route を書き忘れただけの返答は、誤検知せず「既定で埋めた」と言って適用できる（v0.24.0で直した）
await p.fill('#imText', AI_REPLY.replace('  route parallel failure fail_fast\n', ''));
await tap('#imGo');
R['⑥ route抜け'] = (await p.textContent('#imResult')).replace(/\s+/g, ' ').slice(-160);
ok.noFalseRoutingError = !R['⑥ route抜け'].includes('検証エラー')
  && R['⑥ route抜け'].includes('既定値で埋めた')
  && (await p.locator('#imErrCopy2').count()) === 0
  && (await p.locator('#imApply').count()) === 1;

// ⑦ 本当の検証エラー（置き場のURLが無い openai_local）は、適用する前に示して AI に返す文面を出す
await p.fill('#imText', AI_REPLY.replace('provider m = mock', 'provider m = openai_local'));
await tap('#imGo');
R['⑦ 本当の検証エラー'] = (await p.textContent('#imResult')).replace(/\s+/g, ' ').slice(0, 160);
ok.validateBeforeApply = R['⑦ 本当の検証エラー'].includes('このまま適用すると検証エラー')
  && R['⑦ 本当の検証エラー'].includes('endpoint')
  && (await p.locator('#imErrCopy2').count()) === 1
  && (await p.locator('#imApply').count()) === 1;   // 止めずに知らせる（決めるのはユーザー）
await tap('#shClose');

R['pageerror'] = errs;
for (const [k, v] of Object.entries(R)) console.log(k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
