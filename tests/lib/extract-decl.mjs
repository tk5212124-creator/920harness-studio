// harness.html / sheet.html から、いちばん外側に書いた宣言（function NAME / const NAME=）を1つ取り出す。
// 宣言は「行の先頭から始まり、次に行の先頭から始まる宣言・コメントの手前まで」とする。
// 方眼シートへ写したハーネスの関数が、本体と一字一句同じかを確かめるのに使う。
const START = /^(?:async\s+)?function\s+([\w$\u0080-￿]+)\s*\(|^const\s+([\w$\u0080-￿]+)\s*=/;
const BOUNDARY = /^(?:async\s+function|function|const|let|var|class|\/\*|\/\/|if\s*\(|for\s*\(|window\.|\}\)\(\);|return\b|<\/script>)/;
export function extractDecl(src, name) {
  const lines = src.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const m = START.exec(lines[i]);
    if (!m || (m[1] || m[2]) !== name) continue;
    let j = i + 1;
    while (j < lines.length && !BOUNDARY.test(lines[j]) && lines[j].trim() !== '') j++;
    hits.push(lines.slice(i, j).join('\n').replace(/\s+$/, ''));
  }
  return hits;
}
