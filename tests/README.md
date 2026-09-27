# テスト

`harness.html` は1枚のHTMLなので、テストは Playwright でページを開いて中の関数を直接叩く形にしてある。

```
node tests/harness-runtime.mjs      # 自己テスト95件（Runtime回帰 + Provider契約 + HSL + 合流 + ループ + 出口 + 条件/計算 + 動く順番 + 動き出す条件 + エラーの扱い + 実行の記録 + 使い方のJSON + 出力の形と差し込み + まとめる/多数決/点検 + モジュール + Map + 多数決の確定 + 日本語pick + 詳しい動きの例 + 式で使える名前と演算子 + first_matchのpriority + wllamaの既定 + 先着(race) + 検証の適用範囲 + 記憶(memory) + 読まないキーの診断 + 文脈の窓 + Checkpointのまとめ書き + engineのリセット + 落ちても残る記録 + 入力と送った文の記録 + ログと同じものを残す + 取り置き + engineへの推論は1本ずつ + 終わった Run に running を残さない + 忘れる前に engine を止める + GPU を失ったら読み直す）
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
node tests/harness-race.mjs         # 先着（race）— 足す・中身を決める・実行して候補が止まる・記録・診断・使い方3タブ
node tests/harness-memory.mjs       # 記憶（memory）— 入口ごとの扱い・毎周たまる・記録・診断・使い方3タブ
node tests/harness-parity.mjs       # 画面とJSONの対応（片方だけでできることを作らない、を機械で固定）
node tests/harness-realspec.mjs     # 実ハーネスを JSON 無改変で画面から実行（KVを積まない・OOMから戻る・GPU を失っても次は読み直す）
node tests/harness-invariants.mjs   # 終わった Run に「動いていないのに running」が残らない
                                    #   （ChatGPT の10通り＋Retry＋実ハーネス v13.1 を画面から）
node tests/harness-hslbox.mjs       # JSON タブの欄に HSL を貼る（貼り付け・打つ途中・LLM の返事・欄を離れる・壊れた文）
node tests/harness-probe.mjs        # 落ちる原因の切り分け — 条件ごとに読み込み直し、落ちても続きから進む（stub）
node tests/harness-gpuprobe.mjs     # Worker の中の GPU の見張り — 本物の WebGPU（swiftshader）とローカル HTTP で確かめる
                                    #   ＋ wasm のメモリ（作った・増やす前・後）・Worker の心拍・詰まり
node tests/harness-selftest-gpu.mjs # 開くたびに回る自己テストが本物のモデルを読まない（HTTP＋本物の WebGPU）
node tests/harness-fileimport.mjs   # 書き出した .json / .hsl / .txt を「ファイルから」で戻す（選ぶファイルを絞らない）
node tests/harness-startup.mjs      # 開いた直後の状態・開き直しても落ちたあとでもハーネスが戻る
node tests/harness-blackbox.mjs     # 落ちても残る記録 — 推論の途中で**本当にレンダラをクラッシュさせ**、
                                    #   どこで消えたか・何を入力して何を送っていたか・画面のログと
                                    #   同じ行が全部残る／常設ボタンからも見える／2回読み込み直しても
                                    #   きれいに走っても消えない／開いてすぐ押しても記録される／
                                    #   二度押ししても2本目は走らない／開き直すと
                                    #   知らせが出る／読み込み中なら省メモリを押せる／コピーできる／捨てられる
```

必要なもの: Node 22 以上と Playwright（Chromium）。
`executablePath` はこのリポジトリを書いた環境の Chromium を指しているので、
手元で動かすときは各 `.mjs` の先頭の `chromium.launch({executablePath:...})` を
自分の環境に合わせるか、`playwright install chromium` 後に `executablePath` を外す。

`harness-webllm.mjs` は WebGPU を使うので、GPUの無い環境では
`--enable-unsafe-webgpu --use-angle=swiftshader` を付けて起動している（テスト内で指定済み）。

見ているものは README の「7. テスト」にまとめてある。
