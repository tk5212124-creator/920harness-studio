# テスト

`harness.html` は1枚のHTMLなので、テストは Playwright でページを開いて中の関数を直接叩く形にしてある。

```
node tests/harness-runtime.mjs      # 自己テスト73件（Runtime回帰 + Provider契約 + HSL + 合流 + ループ + 出口 + 条件/計算 + 動く順番 + 動き出す条件 + エラーの扱い + 実行の記録 + 使い方のJSON + 出力の形と差し込み + まとめる/多数決/点検 + モジュール + Map + 多数決の確定）
node tests/harness-local-llm.mjs    # 本物のHTTPでOpenAI互換サーバに繋いで端から端まで
node tests/harness-webllm.mjs       # 同梱したWebLLM本体を実ブラウザで読み込み、WebGPUを実測
node tests/harness-editor.mjs       # ノードエディタを iPhone 相当のタッチ端末として操作
node tests/harness-share.mjs        # 書き出し・共有リンク・取り込み・診断を通しで操作
node tests/harness-ai-loop.mjs      # 外部LLMとの往復（1枚を出す→返答を口に入れる→差分→適用）
node tests/harness-io-models.mjs    # 入出力パネルの連動と、モデルの一覧・選択・ダウンロード
node tests/harness-loop.mjs         # ループノード・緊急停止・入力ノードの文言・入力の順番
node tests/harness-outputs.mjs      # 出力の項目・出口を分ける・受け取る側の項目えらび・％と思考過程
node tests/harness-calc.mjs         # 計算ノード・条件分岐ノード・ループのJSモード・使い方の？とJSONタブ
node tests/harness-modexp.mjs       # モジュール（部分ハーネスの再利用）と「くらべる（実験）」
```

必要なもの: Node 22 以上と Playwright（Chromium）。
`executablePath` はこのリポジトリを書いた環境の Chromium を指しているので、
手元で動かすときは各 `.mjs` の先頭の `chromium.launch({executablePath:...})` を
自分の環境に合わせるか、`playwright install chromium` 後に `executablePath` を外す。

`harness-webllm.mjs` は WebGPU を使うので、GPUの無い環境では
`--enable-unsafe-webgpu --use-angle=swiftshader` を付けて起動している（テスト内で指定済み）。

見ているものは README の「7. テスト」にまとめてある。
