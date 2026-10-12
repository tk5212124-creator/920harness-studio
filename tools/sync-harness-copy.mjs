// 方眼シート（sheet.html）の「ハーネスから写した関数」の区間を、harness.html から作り直す。
//   node tools/sync-harness-copy.mjs          … 書き換える
//   node tools/sync-harness-copy.mjs --check  … 書き換えずに、ずれていたら 1 で終わる（tests から使う）
// 写すのは「値の扱い」の関数だけ（差し込み・合流・pick・型・結合・まとめ・式・JavaScript の Worker の中身）。
// 写した区間は手で直さない。直すときは harness.html を直してから、これを流す。
import fs from 'fs';
import { extractDecl } from '../tests/lib/extract-decl.mjs';
export const COPY_NAMES = ['ABSENT', 'OPS2', 'FNS', 'ID1', 'IDRE', 'NOTID', 'tokenize', 'parseE', 'showVal', 'evalExpr',
  'compileExpr', 'evalBool', 'evalValAt', 'evalBoolAt', 'jsWorkerSrc', 'JS_RESERVED', '_varOk', 'okVarName', 'localsOf',
  'mustacheRender', 'getPath', 'rvToText', 'MERGE_OPS', 'mergeInputs', 'mergeToRV', 'estTokensMin', 'contextWindowOf',
  'effectiveOverrides', 'joinLabel', 'joinText', 'csvCell', 'REDUCE_OPS', 'REDUCE_OP_SET', 'atPath', 'rvVal', 'listOfInputs',
  'runReduce', 'ASSERT_SEVERITY', 'runJoin', 'rvOf', 'parsePick', 'pickValue', 'applyEdgeAndValidate', 'errText',
  'closeJSON', 'stripFence', 'buildMessages'];
export const EXPORTS = ['ABSENT', 'IDRE', 'tokenize', 'evalExpr', 'compileExpr', 'evalValAt', 'evalBoolAt', 'jsWorkerSrc',
  'okVarName', 'localsOf', 'mustacheRender', 'rvToText', 'mergeInputs', 'mergeToRV', 'estTokensMin', 'contextWindowOf',
  'effectiveOverrides', 'runReduce', 'ASSERT_SEVERITY', 'runJoin', 'rvOf', 'pickValue', 'applyEdgeAndValidate', 'errText',
  'closeJSON', 'stripFence', 'showVal', 'atPath', 'listOfInputs', 'buildMessages'];
const BEGIN = '/*#HARNESS-COPY', END = '/*#END-HARNESS-COPY*/';
export function buildBlock(harnessSrc) {
  const parts = [];
  for (const n of COPY_NAMES) {
    const h = extractDecl(harnessSrc, n);
    if (h.length !== 1) throw new Error(`harness.html に ${n} が ${h.length} 個ある（1個のはず）`);
    parts.push(h[0]);
  }
  const ver = (/HARNESS_BUILD\s*=\s*"([^"]+)"/.exec(harnessSrc) || [])[1] || '?';
  return `${BEGIN} — harness.html v${ver} から写した（手で直さない。tools/sync-harness-copy.mjs で作り直す）*/\n`
    + `const HX=(()=>{\n${parts.join('\n')}\nreturn{${EXPORTS.join(',')}};\n})();\n${END}`;
}
export function currentBlock(sheetSrc) {
  const a = sheetSrc.indexOf(BEGIN), b = sheetSrc.indexOf(END);
  if (a < 0 || b < 0) return null;
  return sheetSrc.slice(a, b + END.length);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('..', import.meta.url).pathname;
  const h = fs.readFileSync(root + 'harness.html', 'utf8');
  const sPath = root + 'sheet.html';
  const s = fs.readFileSync(sPath, 'utf8');
  const want = buildBlock(h), cur = currentBlock(s);
  if (process.argv.includes('--check')) {
    if (cur === want) { console.log('同じ（' + COPY_NAMES.length + ' 個の宣言）'); process.exit(0); }
    console.log(cur ? 'ずれている: node tools/sync-harness-copy.mjs で作り直す' : '区間が無い'); process.exit(1);
  }
  if (!cur) throw new Error('sheet.html に区間 ' + BEGIN + ' が無い');
  fs.writeFileSync(sPath, s.replace(cur, () => want));
  console.log('書き換えた（' + COPY_NAMES.length + ' 個の宣言）');
}
