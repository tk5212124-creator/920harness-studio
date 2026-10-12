# tests/fixtures/embed

`test/tiny-embed/` は **テスト用の極小 Embedding モデル**（`tools/make-tiny-embed-model.py` で作った）。

- 中身は「トークン（文字）ごとの32次元のベクトルを引くだけ」の ONNX（Gather 1つ・約65KB）と、BERT 形式のトークナイザ（文字単位の WordPiece）。
- **意味は分からない。** 同じ文字を多く含む文どうしが近くなるだけ。
- 目的は、同梱した Transformers.js を本物の Worker で動かす道（読み込み・トークン化・推論・平均・正規化・中断・片付け）を、
  この検証環境（huggingface.co に届かない）で確かめること。本物の多言語モデルの代わりにはならない。
- `harness.html` の EMBED_MODELS には入れていない（テストが `__dbg.eng.EMBED_MODELS` に足して使う）。
