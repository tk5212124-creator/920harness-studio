// 「書き出す」で保存したファイル（.json / .hsl / .txt）を、「取り込む」→「ファイルから」で戻せること。
// v0.38.0 の実機（iPhone）で、書き出した .json を「ファイルから」で選ぼうとしても、ファイル自体が出てこなかった。
// ファイル選びの input に accept（.hsl など）を付けていたのが、この版で外したもの。
//   ① input に accept が無い（どのファイルでも選べる）・display:none でない
//   ② 実ハーネス v13.1 と例「Loop×並列」を、3つの形式で保存 → そのファイルを選ぶ → 適用 → 元と同じ
//   ③ 拡張子が違う・無い・BOM 付き・共有リンクだけのファイルでも読める
//   ④ 文字でないファイルは、読めないと言う（図は変えない）
import fs from 'fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const here = new URL('.', import.meta.url).pathname;
const FILE = 'file://' + new URL('../harness.html', import.meta.url).pathname;
const v13 = fs.readFileSync(here + 'fixtures/v13.1-token-association.json', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(FILE);
await p.waitForFunction(() => window.__selfTest, null, { timeout: 60000 });
const R = {}, ok = {};
const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
const specNow = () => p.evaluate(() => document.querySelector('#spec').value);
const tmp = fs.mkdtempSync('/tmp/hs-file-');

// ① 選べるファイルを絞っていない
R['① input'] = await p.evaluate(() => { const i = document.querySelector('#fileIn');
  return { accept: i.getAttribute('accept'), display: getComputedStyle(i).display }; });
ok.noAccept = R['① input'].accept === null && R['① input'].display !== 'none';

const load = async (setup) => {
  if (setup === 'v13') {
    await tap('#viewSeg button[data-v="json"]');
    await p.fill('#spec', v13); await p.waitForTimeout(300);
    await tap('#viewSeg button[data-v="editor"]');
  } else { await tap(`#exSeg2 button[data-ex="${setup}"]`); }
  return await specNow();
};
const save = async (btn) => {
  await tap('#btnExport');
  const dl = p.waitForEvent('download', { timeout: 10000 });
  await tap(btn);
  const f = await dl; const to = tmp + '/' + f.suggestedFilename(); await f.saveAs(to);
  await tap('#shClose');
  return to;
};
const pick = async (path, name) => {
  await tap('#exSeg button, #exSeg2 button');                     // いったん別のハーネスにしておく
  await tap('#btnImport');
  const chooser = p.waitForEvent('filechooser', { timeout: 5000 });
  await tap('#imFile');
  await (await chooser).setFiles(name ? { name, mimeType: 'application/octet-stream', buffer: fs.readFileSync(path) } : path);
  await p.waitForFunction(() => { const r = document.querySelector('#imResult'); return r && r.textContent.trim().length > 0; }, null, { timeout: 5000 });
  const msg = (await p.textContent('#imResult')).replace(/\s+/g, ' ').slice(0, 90);
  const can = await p.locator('#imApply').count();
  if (can) await tap('#imApply');
  return { msg, 適用できた: can > 0 };
};
// HSL から戻すとキーの並び順だけが変わる（中身は同じ）。並び順をそろえてから比べる
const canon = v => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (a, b) => JSON.stringify(canon(JSON.parse(a))) === JSON.stringify(canon(JSON.parse(b)));

// ② 3つの形式で保存 → ファイルから → 元と同じ
for (const setup of ['v13', 'ex7']) {
  for (const [fmt, btn] of [['json', '#exSaveJ'], ['hsl', '#exSaveH'], ['txt', '#exSaveT']]) {
    const before = await load(setup);
    const path = await save(btn);
    const r = await pick(path);
    const after = await specNow();
    const key = `② ${setup} .${fmt}`;
    R[key] = { ファイル: path.split('/').pop(), ...r, 元と同じ: same(before, after) };
    ok[`${setup}_${fmt}`] = r.適用できた && R[key].元と同じ;
  }
}

// ③ 拡張子が違う・無い・BOM 付き・共有リンクだけ
{ const before = await load('v13');
  const j = await save('#exSaveJ'), h = await save('#exSaveH');
  const bom = tmp + '/bom.json'; fs.writeFileSync(bom, '﻿' + fs.readFileSync(j, 'utf8'));
  for (const [k, path, name] of [['拡張子 .md（中身 JSON）', j, 'harness.md'], ['拡張子なし（中身 HSL）', h, 'harness'],
    ['BOM 付き JSON', bom, null]]) {
    const r = await pick(path, name);
    R['③ ' + k] = { ...r, 元と同じ: same(before, await specNow()) };
    ok['other_' + k] = r.適用できた && R['③ ' + k].元と同じ; }
  // 共有リンクだけのファイル
  await tap('#btnExport'); await tap('#exLink');
  await p.waitForFunction(() => document.querySelector('#exLinkText') && document.querySelector('#exLinkText').value.length > 40);
  const link = await p.inputValue('#exLinkText'); await tap('#shClose');
  const lf = tmp + '/link.txt'; fs.writeFileSync(lf, link + '\n');
  await tap('#exSeg2 button[data-ex="ex7"]');
  await tap('#btnImport');
  const chooser = p.waitForEvent('filechooser', { timeout: 5000 });
  await tap('#imFile'); await (await chooser).setFiles(lf);
  await p.waitForTimeout(800);
  R['③ 共有リンクだけのファイル'] = { hint: (await p.textContent('#hint')).slice(0, 40), 元と同じ: same(before, await specNow()) };
  ok.linkFile = R['③ 共有リンクだけのファイル'].元と同じ && R['③ 共有リンクだけのファイル'].hint.includes('共有リンク'); }

// ④ 文字でないファイル
{ const before = await specNow();
  const bin = tmp + '/x.png'; fs.writeFileSync(bin, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2, 3]));
  await tap('#btnImport');
  const chooser = p.waitForEvent('filechooser', { timeout: 5000 });
  await tap('#imFile'); await (await chooser).setFiles(bin);
  await p.waitForTimeout(500);
  R['④ 文字でないファイル'] = { msg: (await p.textContent('#imResult')).replace(/\s+/g, ' ').slice(0, 60),
    図はそのまま: (await specNow()) === before };
  ok.binary = /文字のファイルではない/.test(R['④ 文字でないファイル'].msg) && R['④ 文字でないファイル'].図はそのまま; }

for (const [k, v] of Object.entries(R)) console.log(k + ': ' + JSON.stringify(v));
console.log('pageerror: ' + JSON.stringify(errs));
const all = Object.values(ok).every(Boolean) && errs.length === 0;
console.log('\n判定: ' + JSON.stringify(ok));
console.log(all ? 'ALL PASS' : 'FAIL');
await b.close();
process.exit(all ? 0 : 1);
