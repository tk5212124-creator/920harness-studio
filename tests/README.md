# テスト

`harness.html` は1枚のHTMLなので、テストは Playwright でページを開いて中の関数を直接叩く形にしてある。

```
node tests/harness-runtime.mjs      # 自己テスト28件（Runtime回帰15 + Provider契約13）
node tests/harness-local-llm.mjs    # 本物のHTTPでOpenAI互換サーバに繋いで端から端まで
node tests/harness-webllm.mjs       # 同梱したWebLLM本体を実ブラウザで読み込み、WebGPUを実測
node tests/harness-editor.mjs       # ノードエディタを iPhone 相当のタッチ端末として操作
```

必要なもの: Node 22 以上と Playwright（Chromium）。
`executablePath` はこのリポジトリを書いた環境の Chromium を指しているので、
手元で動かすときは各 `.mjs` の先頭の `chromium.launch({executablePath:...})` を
自分の環境に合わせるか、`playwright install chromium` 後に `executablePath` を外す。

`harness-webllm.mjs` は WebGPU を使うので、GPUの無い環境では
`--enable-unsafe-webgpu --use-angle=swiftshader` を付けて起動している（テスト内で指定済み）。

見ているものは README の「7. テスト」にまとめてある。
