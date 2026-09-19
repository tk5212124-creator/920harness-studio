# テスト

`harness.html` は1枚のHTMLなので、テストは Playwright でページを開いて中の関数を直接叩く形にしてある。

```
node tests/harness-runtime.mjs      # 自己テスト28件（Runtime回帰15 + Provider契約13）
node tests/harness-local-llm.mjs    # 本物のHTTPでOpenAI互換サーバに繋いで端から端まで
```

必要なもの: Node 22 以上と Playwright（Chromium）。
`executablePath` はこのリポジトリを書いた環境の Chromium を指しているので、
手元で動かすときは各 `.mjs` の先頭の `chromium.launch({executablePath:...})` を
自分の環境に合わせるか、`playwright install chromium` 後に `executablePath` を外す。

見ているものは README の「7. テスト」にまとめてある。
