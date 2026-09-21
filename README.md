# Harness Studio

LLMオーケストレーター。**ハーネス（AIの処理手順）** を画面上でノードとして組み、
複数のLLM/VLMを連携させて動かす。ローカルLLMとクラウドLLMを同じインターフェースで混在できる。

**タップとドラッグで組める。** ノードを置き、ポートをタップしてつなぎ、ノードをタップして中身を決める。
iPhone でもPCでも同じ操作。

**組んだハーネスは言語（HSL）として書き出せる。** テキストなので人に渡せるし、リンク1本で別の端末でも開ける。

**構造を1枚のテキストにして外部のLLMに渡し、返ってきた文を口に入れるとノードと線になる。**
渡す1枚には文法もいまの構造も入っているので、**何も説明されていないLLMが初見で読んで書ける**ことを狙っている。
返答は ``` 付きでも前置き付きでもよく、貼ると**何が変わるかを見せてから**適用する。
アプリ自身がLLMを呼んで構造を考えることはしない（それは外部のLLMの仕事）。

**LLMをアプリに内蔵している。** サーバもAPIキーも要らず、ブラウザの中だけで推論する
（WebLLM/WebGPU。本体はこのリポジトリに同梱、モデルは初回だけ端末にDLして保存）。

公開URL: https://tk5212124-creator.github.io/920harness-studio/

**設計思想: エンジンは薄く、権限はユーザーに全渡し。** Runtime は書いてない判断
（自動フォールバック・隠れた型変換・自動リトライ・自動最適化）を一切しない。決定論を守る。

---

## 1. 現状 — v0.29.0 先着（早く決める・残りを止める）

| 段階 | 状態 |
|---|---|
| HarnessSpec v0.1 文法（Port型 / Provider定義 / Edge・Loop・Condition・Join / context参照） | 凍結済み |
| Branch Failure Policy v0.3（失敗種別と波及の分離・fail_fast・cancel≠failed・Retry） | 凍結済み |
| Runtime v0.3.1（直列・並列・Loop×並列・Join・型契約・Checkpoint/Resume） | 実装済み |
| Provider層 v0.4.0（mock / OpenAI互換ローカル / WebLLM） | 実装済み |
| 内蔵LLM v0.5.0（本体同梱・Worker実行・端末チェック・モデル常駐） | 実装済み |
| ノードエディタ v0.6.0（タップとドラッグで組む・実行状態を図に出す） | 実装済み |
| HSL・共有・診断 v0.7.0（言語で書き出す/取り込む・リンク共有・構造診断） | 実装済み |
| 外部LLMとの往復 v0.8.0（1枚を渡す→返答を口に入れると図になる。差分を見てから適用） | 実装済み |
| 入出力とモデル v0.9.0（入力/出力ノードに連動する欄・Gemma/Qwen/Llamaを端末に落とす） | 実装済み |
| ノードごとのモデルと合流 v0.10.0（ノード編集でモデルを選ぶ・1つの入口に複数の線を入れる） | 実装済み |
| 読める失敗とまとめ方 v0.11.0（失敗の理由を必ず文で出す・出たエラーをその場で直す・Joinのまとめ方と追加文言・線の形） | 実装済み |
| このサイトからモデルを配る v0.12.0（重みを GitHub Pages に載せる・HuggingFaceに行かずに落とせる） | 実装済み |
| 最初から本物のローカルLLM v0.13（既定が内蔵LLM・JSON強制の不具合修正・調査用の出力ボタン・実推論のCI） | 実装済み |
| 出力の形を縛る v0.14.0（ノードごとに出力の形を選ぶ・リスト(n個)・配列を箇条書きに・日本語のノード名） | 実装済み |
| 落ちない工夫と入力のまとめ方 v0.15.0（モデルは同時に1つ・文脈の長さ・落ちた後の案内・複数入力の受け取り方） | 実装済み |
| 確認を減らして迷わせない v0.16（2本目は聞かずに繋ぐ・受け取り方は全LLMノードに・版の確認・JSONの反映を言う） | 実装済み |
| どこから来た線でも合流できる v0.17.0（分岐グループをまたぐ合流をRuntimeが1つの実行に揃える） | 実装済み |
| CPUで動かす道 v0.18.0（Wllama / GGUF / WebGPU不要。WebGPUで落ちる端末の逃げ道） | 実装済み |
| ループと順番 v0.19.0（ループノード・無限ループと緊急停止・入口の順番を自動で振る・図にモデル名・入力ノードの文言） | 実装済み |
| 出力の項目と分岐 v0.20.0（出力1・出力2…／数値の範囲／出口を分ける／条件分岐ノード／計算ノード（式・JavaScript）／動く順番／使い方の？） | 実装済み |
| ループの出口と条件 v0.21.0（本体は上・抜けたあとは下／条件は「入ってきた値」で書ける／項目の編集が消えない） | 実装済み |
| 動き出す条件 v0.22.0（全部そろったら／どれか来たら／自分で組む（and・or・入れ子）・合流の連鎖を直す） | 実装済み |
| 途中で切れたときの扱い v0.23.0（止める／使う／やり直す・形が違うときのやり直し・失敗した呼び出しも数える） | 実装済み |
| エラーの扱いと実行の記録 v0.24.0（ノードごとのエラー時の返し方・進めなくなった理由を名指し・機械が読む実行の記録・使い方のJSONタブ） | 実装済み |
| ％と思考過程 v0.25.0（選択肢ごとの正しさ％だけ／考えてから答える／system にも差し込み／波かっこ無しの参照を診断） | 実装済み |
| モジュールとくらべる v0.26.0（部分ハーネスの再利用／まとめる・多数決・点検ノード／Run比較／ノードごとの時刻） | 実装済み |
| 1件ずつ（Map）と集計 v0.27.0（配列の1件ずつ・入れ子の場・1件だけの失敗・続きから／Run比較の集計統計／多数決の「もう来ない票」） | 実装済み |
| 詳しい動き v0.28.0（第3タブ = Runtime意味論の全部・検証済みの完全JSON例16本／日本語 pick の修正） | 実装済み |
| 式リファレンスの実測修正 v0.28.1（`&&`/`\|\|`/`!`・`input.<ID>`・`first_match` の priority・wllama の全設定。文書を実装へ合わせ、自己テストで固定） | 実装済み |
| **先着 v0.29.0（`race`＝先に条件を満たしたものを採り、まだ動いていない候補を止める。onNone 4種／検証がLLM以外のノードにも届くよう修正）** | **いまここ** |
| Native版 Local Runtime（llama.cpp / MLC / Apple）・ローカルVLM | これから |

| Cloud API Provider（課金額のリアルタイム把握・使用上限） | これから |

---

## 2. ハーネスを組む（ノードエディタ）

![エディタ](docs/editor-mobile.png)

| やりたいこと | 操作 |
|---|---|
| ノードを足す | **＋ノード** → 入力 / LLM / Join / ループ / **条件分岐** / **計算** / 出力 を選ぶ。置いた直後に中身の編集が開く |
| ノードの大きさを変える | ノードの右下の**つまみ**をドラッグ（`metadata.sizes`。ノードをタップ →「大きさを戻す」で戻る） |
| 使い方を読む | 画面**右上の ？**。「読みもの」と「**JSONで書く**」の2タブ。どちらも全文コピーのボタン付き |
| ノードを動かす | ノードをドラッグ。座標は `metadata.layout` に入る（Runtimeは見ない） |
| **つなぐ** | つなぎ元の **○** をタップ → つなぎ先の **●** をタップ |
| ノードの中身を変える | ノードをタップ → provider・**使うモデル**・prompt・schema・generation を編集 |
| どのモデルで動くか見る | 図のノードの3行目に**モデル名**が出る（ノード指定が無ければ provider の既定）。ループは回数が出る |
| 入力の順番を変える | ノードをタップ → **入力の順番**（↑↓）。線をつないだ順に自動で振ってある |
| つながりを変える | 線の途中の **丸** をタップ → if / else / loop / 戻り線 / 出口の役割 / 順番 / transform / 削除 |
| 画面を動かす | 何もない所をドラッグで移動、ピンチで拡大縮小、**⤢** で全体表示 |
| 並べ直す | **整列**（依存の深さで自動配置）、**縦に流す / 横に流す** で向きを変える |

- **出口が2本以上になった瞬間に、どうするかを聞く。** 並列（fail_fast）か条件分岐（first_match）かを
  ユーザーが選び、その選択が Spec に書き込まれる。**勝手に決めない**（隠れた既定値を作らない）。
- **1つの入口に2本目を繋いだときは、聞かずにそのまま繋ぐ。** 毎回の確認は出さない。
  その入口が `cardinality: "many"` になるだけで、**どこから来た線でも同じ**（v0.17.0）。
  渡し方はノード編集の「複数の入力が来たときの受け取り方」で変えられる（既定は改行でつなぐ）。
  **順番（`position`）は線をつないだ順に自動で振る**（v0.19.0）。取り込んだ Spec に書いていなくても
  その場で振るので `position未指定` で止まらない。入れ替えはノード編集の「入力の順番」で。
- **受け取り方と順番は LLM ノードだけのものではない。** 出力ノード・ループノードでも同じように決められる。
  すでにそうなっている Spec を取り込んだときは、検証エラーの横の**1タップのボタン**で同じ状態にできる。

### 最初に出るもの（既定）

- **例は「内蔵LLM直列」**（`in → write(内蔵LLM) → out`）。**mock ではない**ので、
  何も押さずにそのまま実行できる（初回はモデルの取得が走る）。
- **既定のモデルは `SmolLM2-360M-Instruct-q4f16_1-MLC`**。このサイトが配っているので
  HuggingFace に行かずに落とせる。一覧では **`最初から選ばれている`** と出る。
- **起動時にモデルを勝手に読み込まない。** 選ばれているだけで、実行したときに初めて取得・起動する。
- **起動時に「端末に何があるか」を自動で調べる**（押さないと分からないと「更新したら消えた」ように見えるため）。
- **開いた直後は、必ずそのまま実行できる状態にする。** 前回の続き（Checkpoint）があっても、
  出ているのは例のまま。お知らせに **「前回の続きを開く」「捨てる」** が出て、**押したときだけ**前回のハーネスを載せる
  （載せるときは図・JSON・入出力欄・検証をすべて揃える）。開いたあとは **「はじめから（例に戻す）」** で戻れる。
  - 以前は起動時に前回のSpecを勝手に載せていた。前回が失敗していると、**開いた瞬間からエラーが出て、
    例すら実行できない**ように見えていた（実機の指摘。v0.13.2 で修正）。
- ユーザーがノードで別のモデルを選んでいれば、それを勝手に書き換えない（`node.model` が優先）。

### うまくいかないときに渡せる形で出す

実行ログの下に **「ログをコピー / ログを保存 / まとめてコピー / まとめて保存」** がある。
「まとめて」は次を1つの文にする（画面を選択してコピーする必要をなくす）:

```
版・URL・端末(UserAgent)・WebGPUの対応・このサイトが配るモデル・端末にあるモデル
状態（state / 実行できない理由 / 検証エラー / 失敗の中身）
入力・実行ログ・Spec（HSL）・Spec（JSON）
```

外部のLLMに貼ればそのまま相談できる（HSLの文法も同じ形で出している）。

### 失敗したときに何が起きたか分かるようにする

**`[object Object]` を出さない。** 失敗の理由は必ず文にする。特に条件式が読めなかったときは、
どの式のどこで外れたかまで言う:

```
critic: REFERENCE_ERROR loop[revise] の until の式が読めない: "critic.out.score>=8"
  — score を読もうとしたが、そこは文章（JSONではない）。読みたいノードに schema を付けると JSON で返る
```

```
critic: REFERENCE_ERROR critic → out の if の式が読めない: "critic.out.score >= 8"
  — score がその中に無い（あるのは: note, reason）
```

**そもそも実行前に止める。** 条件式が `<node>.out.<項目>` を見ているのに、その node に `schema` が無いときは
**配線だけで分かる**ので検証エラーにする（LLMは schema が無いと文章で返すため、その式は必ず読めない）:

```
⚠ loop[revise] の until が critic.out.score を見ているのに critic に schema が無い（文章で返るとこの式は読めない）: critic
```

**schema があっても、その項目の型が決まっていないと同じことが起きる。** 実機では
`{"score": "..."}`（プロンプトに書いた `…` をそのまま書き写した文字列）が返ってきて、
`critic.out.score >= 8` が比べられず落ちた。**数と比べているのに型が数でない**のも配線だけで分かるので、
これも検証エラーにする:

```
⚠ loop[revise] の until が critic.out.score を数と比べているのに、critic の schema で "score" の型が数になっていない（文字列で返ると比べられない）: critic
```

**指示の例には本物の値を書く。** `{"score": …}` のような穴埋め記号は、小さいモデルが
**そのまま書き写す**（実際に起きた）。いまは `例: {"score": 7}` と書く。

**実行時に外れたときも、返ってきた値をそのまま見せる**:

```
critic: EXPRESSION_EVALUATION_ERROR loop[revise] の until の式が読めない: "critic.out.score >= 8"
  — "..."（文字列） は数として比べられない。返すノードの schema でその項目を integer / number にすると数で返る
```

このエラーには **「critic に schema を付ける」ボタン**が出る。押すと、式が読んでいる項目から
`{"type":"object","required":["score"],"properties":{"score":{}}}` を作って付け、
**「必ず JSON だけで答える。形式: {"score": …}」** をそのノードの suffix にも入れる
（schema だけだと小さいモデルは従いにくいため）。

### 差し込み（`{{{ }}}`）は system / prefix / suffix でも効く

`prompt.template.value` だけでなく `prompt.system` `prompt.prefix` `prompt.suffix` でも
`{{{run_input.in}}}` などの差し込みが効く（`{{{` を書いた文だけ差し込む。書いていない文はそのまま通す）。

**逆に、三重の波かっこで囲まないと値は入らない。** 実機で次のような書き方が見つかった:

```json
{"id":"judge","type":"llm",
 "prompt":{"system":"厳格な評価担当。元質問は run_input.in。…",
           "template":{"syntax":"mustache","mode":"interpolation_only","value":"{{{in}}}"}}}
```

`run_input.in` はそのままの文字列としてモデルに届くので、この judge は
**元の質問を一度も見ないまま**候補回答だけを見て点を付ける（実際に、無関係な回答へ 8点が連発した）。
これは Runtime のバグではなく書き方の問題なので、**診断で名指しする**ようにした:

```
⚠ judge: system に「run_input.in」と書いてあるが、これはそのままの文字列としてモデルに渡っている（値は入らない）。
         実際の値を入れるには {{{run_input.in}}} と三重の波かっこで囲む
```

### エラーが起きたとき、そのノードが何を返すか（`onError`）

止まるかどうかは**ノードごとに決める**。Runtime が勝手に握りつぶすことはしない。

| `onError` | 何が起きるか |
|---|---|
| `"error"`（既定） | そこで実行が止まる。並列の兄弟も止まる（fail_fast）。Retry / Resume できる |
| `"value"` | `onErrorValue` に書いた値を出して先へ進む |
| `"null"` | `null` を出して先へ進む |
| `"skip"` | **そのノードだけ止める**。先へは何も流れないが、他の枝は出力まで行く |

```json
{"id":"書く","type":"llm","onError":"value","onErrorValue":{"score":0}}
```

どれを選んでも**エラーが起きたことは隠さない**。ログに赤字で出て、`run.errors` に
`handledAs`（どう扱ったか）付きで残り、使用量の「エラー」「代わりの値で続行」「止めたノード」に数えられ、
成功で終わったときも `── success ── ただしエラーが N 件あった` と出る。

`"skip"` にしたノードの先が「全部そろったら動く」ままだとそこで待ち続けるので、
その先のノードの `start` を `{"mode":"any"}` にしておく（待ち続けたときは下の「進めなくなった理由」が名指しする）。

### 進めなくなった理由を名指しする

出力に届かず終わったとき・どのノードも入力が揃わなくなったとき（DEADLOCK）に、
**どのノードが何を待っていたか**を必ず出す:

```
■ 進めなくなった（どのノードも入力が揃っていない）。待っているもの:
   bundle: 一部しか届いていない。届いた: fun, make / まだ来ない: rest（このノードの動き出す条件は「全部そろったら」。「どれか来たら」にすれば動く）
   out: 何も届いていない。来るはずの元: bundle
   止まった時点の待ち行列: bundle@root:1#7/execute
```

### 実行の記録（機械が読む全部入り）

実行ログは人が読む読み物なので、追いきれないものがある。
「**実行の記録をコピー / 保存**」は、そこに出ない分まで入った JSON を出す（`harness-trace/1`）:

- `run` … status・totals（失敗した呼び出しも含む）・iterationTotal・input・result・`specCanon`
- `nodes[].runs[]` … execId / loopInstanceId / iteration / status / **ms** / usage / 文字数 /
  **used（どの線からどの値を受け取ったか）** / 値そのもの
- `executions[].attempts[]` … 試行ごとの ms・エラー・**request（モデルへ実際に送った messages・model・maxTokens・schema）**・途中まで出ていた文
- `deliveries[]` … 届いた順（arrival）・どの線・どの枝（activationId）・どのループの何周目・値
- `notRun[]` … 動かなかったノードと、**何を待っていたか**
- `workQueue` / `loopInstances` / `branchGroups` … 止まった時点の待ち行列と枝の状態

「まとめてコピー」にも（値を800字で切った形で）入る。ログの「**詳しく**」に印を付けると、
モデルへ送った文と値の全文が実行ログにも出る。

### 使い方は3タブ（読みもの / JSONで書く / 詳しい動き）

| タブ | 役割 | 大きさ |
|---|---|---|
| 読みもの | 画面の操作とノードの意味。はじめての人向け | 約6千字 |
| JSONで書く | ノード・線・metadata に書けるキーの一覧 | 約1万3千字 |
| **詳しい動き** | **Runtime が実際にどう動くか**。60章＋**検証済みの完全JSON例16本** | **約6万4千字** |

「詳しい動き」の判断基準は「**ソースも過去の会話も知らない外部LLMが、この文書だけで
複雑なハーネスJSONを推測なしに書けるか**」。だから次のものは**推測ではなく実測**で書いてある。

- `start:all` の Delivery は**消費されない**（読んでも残る。再到着でもう一度動く）
- `start:any` は**再発火する**が、**まだ動いていない実行があれば相乗りする**（届いた回数＝動いた回数ではない）
- `merge` の5つの op の**実際の出力文字列**
- `pick` の11通りの端（範囲外・空配列・逆向き・スカラー・無いキー）
- `transform` の失敗は**受け取る側のノードのエラー**になる
- `onError` の `value` / `null` / `skip` は **fail_fast の兄弟を止めない**
- Join に `skip` の枝が混ざると**穴は詰まる**（`[A,C]`。`null` なら `[A,null,C]`）
- Output が複数あると `run.result` は**最後に動いた Output**
- `cond` の `onNoMatch:"stop"` は **`paused`**（`run.errors` は空）
- ループの `iteration` は**本体へ配るときに増える**、`until` は**1周まわってから**見る

`DEEP_EXAMPLES` に置いた16本の完全JSON例は、自己テストで**全部 `validate` に通し、mock で最後まで走らせている**
（載っている例が動かない、を作らない）。

### モジュール（部分ハーネスの再利用）

`modules` に**ふつうの HarnessSpec** を入れておき、`module` ノードから呼ぶ。

```json
"modules": {"書き直し": {"version":"2","spec": {"nodes":[…],"edges":[…]}}},
"nodes":   [{"id":"w1","type":"module","module":"書き直し"}]
```

- **入口** = モジュールの中の `input` ノードの id、**出口** = `output` ノードの id。
  1つずつなら線は `in` / `out` のままでよい。
- **実行の直前に中身へ置き換える（展開）**。だから Runtime はモジュールを知らないままでよく、
  usage・エラー・実行の記録・Checkpoint / Resume はふつうのノードとまったく同じに効く。
- 中のノードは `w1__書く`、ループIDも `w1__lp` になるので、**どこで何が起きたかそのまま追える**。
  展開後は `input` / `output` が `pass`（そのまま通す）ノードになる。
- 同じモジュールを何か所からでも呼べる。中のループの周回は混ざらない。
- **再帰は禁止**（自分を呼ぶモジュールは検証で落とす）。
- 版は `modules.<名前>.version`。モジュールはハーネスの中に入っているので、
  あとから外の何かで勝手に中身が変わることはない。実行の記録に名前と版が入る。
- HSL は `module "書き直し" = {"version":"2","spec":{…}}` の1行。

### まとめる / 多数決 / 点検

| 種類 | 何をするか | 返すもの |
|---|---|---|
| `reduce` | 合計・平均・最小・最大・個数・全部・どれか・最初・最後・**いちばん良いもの**・悪いもの | 数 / 真偽 / **その要素まるごと** |
| `quorum` | 1つずつに条件を当て、何人そろえば合格かを決める | `{pass, decided, agree, against, arrived, total, required, results}` |
| `assert` | 条件を並べて pass/fail を数える（テスト用） | `{total, passed, failed, warned, info, tests}` |

`quorum` は「動き出す条件」を `{"mode":"any"}` にすると**届くたびに数え直す**ので、
3人中2人が通った時点で `decided:true` になる（早期確定）。全部待ちたいなら既定のまま。

`assert` の合否は `run.assertions` にまとまり、**Run の成否とは別**に数える
（`onFail:"error"` にすれば連動させられる）。

### くらべる（実験）

「くらべる」ボタンで、**同じハーネスを N 回 / 複数の入力 / 複数のハーネス**を回して表にする。

- **必ず1本ずつ順番に回す**（iPhone のメモリを守るため）。途中で止められ、途中結果は残る。
- 並ぶのは status・apiCalls・in/out トークン・ms・周回・エラー数・やり直し回数・点検・result。
- `result から見たい値` に `score` や `best.score` と書くと列が増える。
- JSON（`harness-experiment/1`）でも CSV でもコピー／保存できる。
- seed を受け取れる Provider はまだ無いので `seed: null` を記録している（受け取れるようになったらここに入る）。

### 選択肢ごとの正しさ（％）だけ / 考えてから答える

「出力の形」に2つ足した。どちらも schema なので、内蔵LLMでは**文法として強制**される。

**選択肢ごとの正しさ（％）だけ** — 選択肢の名前を並べると、それぞれに 0〜100 の整数だけが返る。

```json
{"type":"object",
 "required":["支持できる","質問に合っている","矛盾が無い"],
 "properties":{"支持できる":{"type":"integer","minimum":0,"maximum":100},
               "質問に合っている":{"type":"integer","minimum":0,"maximum":100},
               "矛盾が無い":{"type":"integer","minimum":0,"maximum":100}}}
```

理由も文章も返らないので短く終わり、小さいモデルでも崩れにくい。
数で返るので `この.out.支持できる >= 80` と条件に書け、計算ノードで足し合わせるのも楽。
候補の確からしさ（候補A / 候補B / 候補C）にも、観点ごとの点にも使える。

**考えてから答える** — `thinking`（考えた筋道）→ `answer`（答え）の順で返す。

```json
{"type":"object","required":["thinking","answer"],
 "properties":{"thinking":{"type":"string"},"answer":{"type":"string"}}}
```

内蔵LLM（XGrammar）は **schema に書いた順**に出すので、`thinking` が先頭にあることに意味がある。
そのぶん `maxTokens` を食う。次のノードへは線の `pick` で `answer` だけ渡せる。
「項目を決める」「選択肢ごとの％」では、チェック1つで `thinking` を先頭に足せる。

### 出力の形をノードごとに決める

ノードをタップ →「**出力の形（内蔵LLMなら文法で強制する）**」で選ぶ。
**プロンプトに「JSON形式で出力すること」と書いても縛りにはならない**（モデルが従うかどうかの話になる）。
ここで選ぶと `schema` が入り、内蔵LLMでは**文法として強制**される。

| 選ぶもの | 入る schema | 返るもの |
|---|---|---|
| 縛らない（文章のまま） | なし | text |
| **リスト（項目数は自由・n個）** | `{"type":"object","required":["items"],"properties":{"items":{"type":"array","items":{"type":"string"}}}}` | `{"items":["…","…"]}` |
| 点数（0〜10の整数） | `{"…":{"score":{"type":"integer","minimum":0,"maximum":10}}}` | `{"score":7}` |
| はい / いいえ | `{"…":{"ok":{"type":"boolean"}}}` | `{"ok":true}` |
| 見出し付きの1件 | `title` / `body` | `{"title":"…","body":"…"}` |
| 自分で書く | そのまま | — |

選ぶと「返し方の指示」も一緒に入る（`例: {"items": ["ひとつめ", "ふたつめ", "みっつめ"]}`）。
**例には本物の値を書く**（`…` のような穴埋め記号は小さいモデルが書き写すため）。

**個数の決まらないリストに CSV は向かない。** カンマは本文にも出るし、行数も縛れないので、
文法で強制できない。**JSONの配列なら個数は自由なまま形だけ縛れる**ので、こちらを使う。

**リストを次のLLMに渡すとき**は、線をタップ →「値の変換」→ **配列 → 箇条書きの文**（`transform: list_to_text`）:

```
{"items":["主語が無い","結論が無い"]}   →   - 主語が無い
                                            - 結論が無い
```

配列でない値に使うと、何が来たのかを言って止まる（黙って文字列にしない）。

### JSONで縛る（内蔵LLM）

内蔵LLMでは **文法（grammar）で本当にJSONを強制できる**。`schema` を書いたノードは、
WebLLM に `response_format: {type:"json_object", schema:"<schemaのJSON文字列>"}` を渡す。

**schema を文字列で渡さないと落ちる。** WebLLM 0.2.85 は `type:"json_object"` のとき
`compileJSONSchema(responseFormat.schema)` を呼ぶので、`schema` が無いと C++ 側で
`GrammarMatcherInitError: Cannot pass non-string to std::string` になる
（実機で出た事故。v0.13.0 で修正）。組み立てられない schema のときは、
`SCHEMA_VALIDATION_ERROR` として「schema を簡単にする / 外して文章で受ける」まで出す。

**途中で切れたときは「切れた」と言う。** `maxTokens` に達すると JSON は必ず閉じないので、
`読めない` ではなく `途中で切れた（maxTokens 120 に達した）` と出す（直し方が違うため）。

**schema を自動で作るときは型も決める。** 条件式が `critic.out.score >= 8` のように
数と比べていれば `{"type":"integer"}` にする。型を書かないと、文法で縛っても
`5.00000000000000050000000000000000…` のような長い数を出し続けて `maxTokens` で切れる
（実際に起きた。CIの実推論で確認）。

### 複数の入力をどう受け取るか（llmノード）

**すべての llm ノードで選べる**（いま線が1本でも、あとから増やせるため）。ノード編集の
「複数の入力が来たときの受け取り方」。既定は **改行でつなぐ**。

| 選ぶもの | 渡る文 |
|---|---|
| 改行でつなぐ（既定） | `検証1` + 改行 + `箇所1` |
| 番号を振る | `1. 検証1` / `2. 箇所1` |
| 見出しを付ける | `## 検証` → 本文 → `## 改稿箇所` → 本文 |
| カンマつなぎ（CSV） | `a,b` + 改行 + `検証1,箇所1` |
| JSONの配列にする | `["検証1","箇所1"]` |

名前（`labels`）は「つないだノード名を入れる」で自動で入る。Spec では `merge` に入る:

```
node "改稿方針": llm local
  inputs {"in":{"type":"any","cardinality":"many"}}
  merge {"op":"markdown","labels":["改稿箇所","検証"]}
```

`merge` は「まとめて受け取る」入口があるノードでだけ使える（無いのに書いてあれば検証エラー）。

### 端末が落ちるとき（メモリ）

iPhone などは、タブが使えるメモリに上限がある。**1B級のモデルはそこを超えて落ちることがある。**

- **端末の中に置くモデルは同時に1つだけ**にしている。別のモデルを使うときは、前のモデルを
  `engine.unload()` してから読み込む（2つ載せると落ちるため）。
- **文脈の長さ**をノード編集で短くできる（`overrides.context_window_size`）。
  1024 まで下げるとメモリがかなり減る（長い文章は入らなくなる）。
- **落ちたことを次に開いたときに伝える。** 読み込み中に画面ごと落ちるとログも残らないので、
  読み込み開始を端末に書いておき、次に開いたときに
  `前回 <モデル> の読み込み中に画面が落ちた` と出す。**「省メモリで試す（文脈1024）」** ボタン付き。
- 大きいモデルには一覧で **`この端末には大きいかも`** と出す（iPhone/iPad で 600MB 以上）。
  ノード編集でそのモデルを選んでいるときも注意を出し、**「この端末向けに省メモリにする」**ボタンで
  `context_window_size: 1024` と `prefill_chunk_size: 256` をまとめて入れられる。

### 古い版を握っていないか

iOS の Safari は古いページを握り続けることがある。配信側が `version.json` を書き、
アプリは開いたときに自分の版と比べて、違えば **「新しい版がある [読み込み直す]」** を出す。
調査用メモにも、いま開いている版を書く。

### いま何が載っているかを常に出す

図の下に **`いま開いているハーネス: 名前（ノード3・線2・provider local）`** を常に表示する。
貼った・読み込んだ・切り替えたときに、**反映されたかどうかを画面を見るだけで確かめられる**
（ヒント行は消えるので、それとは別に常設する）。

### JSONタブに貼ったものは、その場で図になる

貼った瞬間に図・入出力欄・検証に反映し、**何を読み込んだかをヒント行に出す**
（`JSONを読み込んだ: SmolLM2 小型モデル最適化（ノード3・線2）`）。
読めないJSONのときは `直すまで図は前のまま` と言う。実行したときも、
ログの先頭に **どのハーネスを動かしたか**を出す（`▶ 実行するハーネス: … （ノード3・線2）`）。

### 合流（1つの入口に複数の線）

**どこから来た線でも合流できる。** 同じ分岐から来ていても、別々の分岐から来ていても同じように動く。

- 2本目を繋いだ時点で、その入口は `cardinality: "many"` になる（線には `position` が付く）
- 受け取ったものをどう1つの文にするかは、**ノード編集の「複数の入力が来たときの受け取り方」**（`merge`）
- Runtime は、**別々の分岐グループから来た配送を、その合流ノードでだけ1つの実行に揃える**
  （`isConfluenceNode` が真のノードは、配送の突き合わせで `activationId` を見ない）。
  **ループの回・繰り返しの番号は引き続き区別する**ので、別の回の値が混ざることはない。

v0.16 までは、別々の分岐から来た線は永久に揃わず `DEADLOCK` になっていたため、
エディタが手前に Join を自動で作っていた。**v0.17.0 でその制限自体を無くしたので、Join の自動挿入もやめた**
（Join ノードは「＋ノード」から今までどおり作れる。まとめ方を細かく決めたいときに使う）。


## 2. 入出力とモデル（画面のいちばん上）

![入出力とモデル](docs/io-models.png)

### 入出力

**入力ノード・出力ノードに連動する。** 足せば欄が増え、消せば減る。

- 入力欄の値は **「そのノードの名前」のキー** で実行に渡る。ノード `in` の欄に書いた文字は、
  `in` ノードの出力になり、次のノードの prompt では `{{{in}}}` で受け取れる。
- 入力ノードが2つ以上あるときは、**起点になるのは最初の1つだけ**（画面にもそう出る）。
  2つ目以降の値は prompt の `{{{run_input.<ノード名>}}}` から読める。
- 出力欄には出力ノードごとの最新の結果が出る。**出力まで届かなかったときは、どのノードが何で止まったか**が出る
  （例: `ここまで届かなかった — critic で SCHEMA_VALIDATION_ERROR`）。実行中は「実行中…」。
- **入力欄のすぐ下に実行ボタンがある**（下の「例と実行」の実行と同じもの。どちらを押しても同じで、
  実行中はどちらも Cancel に切り替わる）。

### モデル

**Gemma / Qwen / Llama を、この端末の中に落として動かす。** サーバもAPIキーも要らない。

このパネルは **端末にモデルを置くための場所**。どのモデルを使うかは
**ノードごとにノード編集画面で決める**（「使う」「起動する」という概念はここに無い）。

| ボタン | すること |
|---|---|
| 端末にあるか調べる | 一覧のモデルが端末に保存済みかを見る |
| ダウンロード | 重みを端末に落とす。行に **経過秒数と進捗%** が出て、**中止**できる。落ちていれば `✔ 端末にある` になりボタンは消える |
| 動作確認 | **実際に1文生成して、起動◯秒・生成◯秒・◯tok/s・応答本文を出す** |
| 削除 | 端末からそのモデルを消す |

**ノードごとのモデル選択**（ノードをタップ → ノード編集）:

| 欄 | すること |
|---|---|
| Provider | `＋ 内蔵LLM を使えるようにする` を選ぶと、無ければ `providers.local`（adapter: webllm）を作ってそのノードに割り当てる。すでにあれば `local（内蔵LLM・この端末で動く）` として並び、**同じものが二重に出ない** |
| このノードで使うモデル | 一覧から選ぶ。選んだ値は `node.model`（provider の既定を上書き）。端末にあるモデルには `✔ 端末にある` が付く |

`node.model` を変えると、そのモデルに必要な起動オプションも `node.overrides` に書き込まれる
（Gemma の `{"sliding_window_size": -1}` など）。**モデルを別のものに変えれば、前のモデルの上書きは連れて行かない。**

`f16非対応の端末向け（q4f32）も出す` にチェックすると、`shader-f16` が無い端末用の版も並ぶ
（どちらが要るかは Provider の「端末チェック」で分かる）。

| モデル | 必要メモリの目安 |
|---|---|
| SmolLM2-360M | 約376MB（まず動くか試す用） |
| Gemma 3 1B | 約711MB |
| Llama 3.2 1B | 約879MB |
| Qwen2.5 0.5B | 約945MB |
| Qwen2.5 1.5B | 約1.6GB |
| Gemma 2 2B (日本語向け) | 約1.9GB |

### このサイト自身がモデルを配る（HuggingFaceに行かなくてよくする）

**`models.txt` に書いたモデルは、GitHub Actions が毎回のデプロイで HuggingFace から取ってきて、
GitHub Pages の配信物に入れる。** 重みは **Git に入れない**
（Git LFS は GitHub Pages では配信できず、1ファイル100MBの制限もあるため）。

```
models.txt
  mlc-ai/SmolLM2-360M-Instruct-q4f16_1-MLC  SmolLM2-360M-Instruct-q4f16_1-MLC

公開されるURL
  https://<site>/models/<id>/resolve/main/mlc-chat-config.json
  https://<site>/models/<id>/resolve/main/params_shard_*.bin …
  https://<site>/models_index.json      ← 何を配っているかの一覧（アプリが読む）
```

- **`resolve/main/` は必要。** WebLLM は重みURLの下に必ず `resolve/main/` を足す
  （`vendor/web-llm/index.js` の `cleanModelUrl`: `if(!modelUrl.match(/.+\/resolve\/.+\//)) modelUrl += "resolve/main/"`）。
  HuggingFace 以外のURLでも同じなので、配信側をこの形にしてある。
- **wasm（`model_lib`）は差し替えない。** WebLLM が元から持っているものを使い、**重みのURLだけ**を差し替える。
- アプリは起動時に `models_index.json` を読み、載っているモデルに
  **`このサイトから取れる`** を付ける。落とすときの取得先もこのサイトになる（同一オリジンなので速い）。
- **取得先が変わっても、端末にある分は落とし直さない。** すでに HuggingFace から落としてあるモデルは
  そのまま使う（ログと進捗に「端末にある前の取得分」と出す）。削除は両方まとめて消す。
- **HuggingFace に届かないときは、アプリ本体のデプロイは止めない。** `models_index.json` に載らないだけで、
  端末は今までどおり HuggingFace から直接落とす（ログに `::warning::` が出る）。
- 取ってきたモデルは Actions のキャッシュに入るので、毎回のデプロイで落とし直さない。
- **GitHub Pages の公開サイトは1GBまで。** 合計が900MBを超えたらデプロイ前に止める。
  増やすときは `models.txt` の行を足す（合計サイズに注意）。

### モデルはどこに入るか

重みは HuggingFace から端末が直接取る。**初回だけ**で、以降はオフラインでも動く。

保存先は **このサイト（オリジン）のブラウザ内ストレージ**（IndexedDB）。つまり:

- **アプリを更新してもモデルは消えない。** 保存はモデルのURLで管理していて、ページの版とは無関係
- 消えるのは、ブラウザの「Webサイトデータを消去」をしたとき、「削除」を押したとき、
  iOS が**しばらく使われていないサイトのデータを片付けたとき**
- 「消えないようにする」を押すと長期保存を申請する（`navigator.storage.persist()`）。
  iOS で確実に残したいなら **共有 → ホーム画面に追加** が効く
- いま何MB使っていて上限がいくつかは、その場に表示される

### 重みを自分の置き場に置く

**「自分で置いたモデルを足す」** で、重みの取得先を HuggingFace 以外にできる
（GitHub Pages・自前サーバなど）。名前・重みのURL・実行用wasmのURLを登録すると一覧に並ぶ。

- 実行用の wasm は MLC公式のもの（`raw.githubusercontent.com`）をそのまま借りられる。同じ種類を選べば自動で入る
- **WebLLM は重みURLの下に `resolve/main/` を足す**（HuggingFaceの形が前提）。
  そのためファイルは `…/<名前>/resolve/main/` に置く。画面に**実際に読みに行くURL**が出る
- **「置き場を確かめる」** で、数百MBを落とす前に `mlc-chat-config.json` が取れるか確認できる
  （404 か CORS か時間切れかを区別して出す）
- 別ドメインに置くなら CORS の許可が要る（GitHub Pages は許可済み）

置き方（手元のPCで。HuggingFaceに繋がる環境が要る）:

```
git lfs install
git clone https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC
mkdir -p models/MyQwen/resolve/main && cp Qwen2.5-*/* models/MyQwen/resolve/main/
```

GitHub Pages は1リポジトリ1GB・月100GBまで。1ファイル100MBの制限があるが、
MLCの重みは30MBずつに分かれているので収まる。

### モデルごとの上書き

`overrides` でモデル設定を上書きできる。provider（`providers.<id>.overrides`）と
ノード（`node.overrides`）の両方に書けて、ノード側が勝つ。Gemma は
`context_window_size` と `sliding_window_size` が両方とも正だと起動できないため、
カタログから選ぶと `{"sliding_window_size": -1}` が自動で入る（Specに書き込まれるので中身は見える）。

**ノードでモデルを変えたときは、provider 側の上書きは持ち込まない。**
`providers.local` が Gemma でも、そのノードが `node.model` で SmolLM2 を選んでいれば
Gemma 用の上書きは付かない（別のモデルに他のモデルの設定を混ぜない）。

配信には `vendor/web-llm/index.js`（本体）が必要。Pages のワークフローはこれを `_site` にコピーし、
**入っていなければビルドを失敗させる**（入れ忘れると端末側は「Importing a module script failed」としか出ず、
原因が分からなくなるため）。読み込めなかったときは、そのURLが何を返しているか（404 / HTML / 型）まで画面に出す。

**待ち続けて固まらないようにしてある。** 通信が途中で止まる端末があるため、
本体の取得は30秒、Workerの起動は20秒、ダウンロードの無進捗は120秒で打ち切り、
理由（通信が止まっている／Workerが起動しない／容量が足りない）を行に出してボタンを戻す。

---

## 2.5 Join（複数の出力を1つにまとめる）

**まとめ方（`op`）を選ぶ。** 下流が LLM なら、そのまま読める文章の形にできる。

| まとめ方 | 出るもの | 例 |
|---|---|---|
| `concat`（文章のまま） | text | `案A1` + 区切り + `案B1` |
| `markdown`（見出し付き） | text | `## 案A` → 本文 → `## 案B` → 本文（名前が無ければ `- ` の箇条書き） |
| `csv`（カンマつなぎ） | text | `a,b` の見出し行 + `案A1,案B1`（`,` `"` 改行は自動で括る） |
| `json_array` | json | `["案A1","案B1"]` |
| `json_object` | json | `{"a":"案A1","b":"案B1"}`（名前が要る） |
| `template` | text | `{{{items.0}}}` / `{{{labels.0}}}` を差し込む |

- **それぞれの名前（`labels`）** は、つないだ順に付ける。`markdown` の見出し・`csv` の見出し行・
  `json_object` のキーになる。ノード編集の**「つないだノード名を入れる」**で自動で入る。
- **必ず前に付ける文 / 後ろに付ける文（`prefix` / `suffix`）** を Join にも書ける。
  文章になるまとめ方（`concat` / `markdown` / `csv` / `template`）のときだけで、
  JSON になるまとめ方に書くと**黙って無視せず検証エラーにする**。
- エディタで作った Join の既定は `markdown`（下流のLLMがいちばん読みやすいため）。

```
node jn: join
  op markdown
  labels ["案A","案B"]
  prefix "以下は2つの案です。"
  suffix "どちらが良いか、理由とともに選んでください。"
  inputs {"items":{"type":"any","cardinality":"many"}}
```

---

## 2.6 ループ（同じところを何回も回す）

**ループノードを1つ置くと、そこから先が「本体」になる。** 本体の最後から
ループノードへ線を戻すと輪が閉じ、条件が真になるか、最大回数に届くまで何回でも回る。

| 決めるもの | 意味 |
|---|---|
| 最大の回数（`loop.max`） | ここまで回ったら抜ける。**空にすると止まらない（無限ループ）** |
| どうなったら抜ける（`loop.until`） | 真になったら抜ける。既定は**ここに入ってきた値**の項目（`点数 >= 8`）。ほかに 回数だけ / **他のノードの値**（`回答評価.out.点数 >= 8`）/ **文の長さ**（`len(value) >= 400`・`draft.meta.len >= 400`）/ 自分で式 / **JavaScript** |
| 出口の役割（`loopRole`） | 図の**上の○＝繰り返す先（本体）**、**下の○＝抜けたあと**。引いた丸で決まる（ノード編集でも入れ替えられる） |
| 丸の位置 | ループだけ丸が4つ。上 = 入口(●)＋本体(○)、下 = 戻り(●)＋抜けたあと(○)。**抜けたあとは下へ流れる** |
| 戻り線 | 本体の先からループノードへ繋ぐと**自動で戻り線**になる（`loop` 付きの線） |

```
node lp: loop
  set loop {"id":"lp","max":5,"until":"critic.out.score >= 8"}

lp -> draft                   本体（繰り返す先）
lp -> out loopRole "done"     抜けたあと
critic -> lp loop "lp"        本体の最後から戻す線
```

- **無限ループは作れる。** その代わり実行中は画面の右下に **■ 緊急停止** が出続ける。
  押した時点で協調キャンセルが走り、`cancelled`（`failed` ではない）で止まる。
- 打ち切り条件が真にならないまま **20000 Work Item** 回ったら、安全装置が `paused` で止める
  （勝手に諦めず、Resume で続けられる）。
- **ループの中の値は毎周入れ替わり、ループの外から入れた値（入力ノードなど）は毎周そのまま使える。**
  外から本体のノードへ入る線は、実行をループが回すときに作る（外からの1回で走らせない＝待ちで固まらない）。
- 回っている最中は「実行中… 3ノード目・ループ2周目」と出る。`run.iterationTotal` が周回の合計。
- 図のループノードには `最大5回` / `上限なし` と、条件があれば `・条件あり` が出る。

---

## 2.65 いつ動き出すか（`start`）

入口が2本以上あるノードは、**いつ動き出すか**を決められる（ノード編集の「複数の入力が来たときの受け取り方」のすぐ下）。

| 決め方 | 意味 |
|---|---|
| `all`（既定） | 入力が全部そろったら動く。1つでも来ていなければ待つ |
| `any` | **どれか1つでも入力が来たら動く**。届くたびに動き、そのとき届いていない入力は渡らない |
| `custom` | 条件1・条件2… を組む。条件の中は AND / OR、条件どうしも AND / OR |

```
node fun: llm local
  set start {"mode":"any"}

node gate: llm local
  set start {"mode":"custom","op":"or","groups":[{"op":"and","from":["in","点検"]},{"op":"or","from":["lp"]}]}
```

- **ループの中のノードが、ループの外からも線を受けている**ときはこれで解ける。
  `all` のままだと「ループが回らないと動かない／動かないからループが回らない」で止まる。
- ループノードに入る線が無く、本体が全部 `all` のときは**実行前に止めて名前を出す**
  （`ループ "lp" に入る線が無いので始まらない`）。
- 出力に届かず終わったときは、**入力は届いたのに動かなかったノードを名指しする**。
- 合流（`merge#…`）は下流にも伝わる。合流ノードの先でまた合流するときも、1つの実行に揃う。

---

## 2.7 出力の項目（出力1・出力2…）と、出口を分ける

**LLMに何を返させるかを項目で決める。** ノードをタップ →「出力の形」→ **項目を決める**。

| 種類 | schema になるもの | 備考 |
|---|---|---|
| 文章 | `{"type":"string"}` | |
| 数値 | `{"type":"number","minimum":…,"maximum":…}` | 小数・マイナスOK。範囲は空でもよい |
| 整数 | `{"type":"integer","minimum":…,"maximum":…}` | |
| はい / いいえ | `{"type":"boolean"}` | |
| 文のリスト | `{"type":"array","items":{"type":"string"}}` | 個数はモデルが決める |
| 数値のリスト | `{"type":"array","items":{"type":"number"}}` | |

- キー名は自由（英数字）。条件式からは `ノード名.out.キー名` で読める。
- 「こう返して」の例文（`prompt.suffix`）は**実際に返せる値**で作り直す（`"…"` と書くとモデルがそれをそのまま返すため）。
- 内蔵LLMでは schema が**文法として強制**される。プロンプトに「JSONで出して」と書くだけでは縛りにならない。

**答えが形に合わなかったときの扱い**（maxTokens のすぐ下・ノードごと）

| 設定 | 選べるもの |
|---|---|
| `onTruncate`（maxTokens で切れた） | `error` 止める（既定） / `use` 切れたところまでを使う（JSONは閉じ直す） / `retry` maxTokens を倍にしてやり直す（最大2回） |
| `onBadOutput`（schema に合わない） | `error` 止める（既定） / `retry` もう一度聞く（最大2回） |

- どちらも **schema を付けているときだけ**意味がある（文章のままなら切れてもそのまま届く）。
- 毎回まっさらな会話でモデルを呼ぶので、「会話を続ける／新しくする」という設定は無い。
- **使用量は失敗した呼び出しも数える**（`calls` とトークン数に入る）。失敗した NodeRun にも `usage` が残る。
- 小さいモデルは `minLength` / `maxLength` を守りにくい。長さの判定は計算ノードに置き、ループでやり直す方が通る。

**1つのノードから複数の出口を出せる。** ノードをタップ →「出力の渡し方」→ **出口を分けて、項目ごとに渡す**。
画面で選ぶのは**どの項目を渡すか**だけ（出力1・出力2… で作った項目がそのまま並ぶ）。

```
node A: llm local
  schema {"type":"object","required":["score","items"],"properties":{"score":{"type":"integer"},"items":{"type":"array","items":{"type":"string"}}}}
  set ports [{"id":"p1","label":"score","pick":"score"},{"id":"p2","label":"items","pick":"items"}]

A -> 判定   from_port "p1"      score だけが流れる
A -> まとめ from_port "p2"      items（リスト）が流れる
```

- `pick` の書き方: `"score"` が基本。**細かく取りたいときは手で書ける**（画面では選ばない）:
  `"items.0"`（1つ目）/ `"items.1..3"`（2〜4つ目）/ `"items.1.."`（2つ目から最後まで）/ 値そのものがリストなら `"0"` `"1.."`。
- 受け取る側でも選べる（`pick` を線に書く）。ノードをタップ →「入ってきた値のどれを使うか」。
- 取り出せないときは **何が無いか**を言って落ちる（`score がその中に無い（あるのは: note）`）。知らない出口は実行前の検証で落ちる。

---

## 2.8 条件分岐（cond）

**出口そのものが条件。** 上から順に調べて、最初に当たった1本だけに流す。

```
node cd: cond
  set ports [{"id":"c1","label":"高い","expr":"score >= 8"},
             {"id":"c2","label":"ふつう","expr":"score >= 5"},
             {"id":"c3","label":"それ以外","else":true}]

cd -> 合格 from_port "c1"
cd -> 再考 from_port "c2"
cd -> 却下 from_port "c3"
```

- 最後を `else` にすると必ずどこかに流れる。無いと、当たらなかったときに `NO_MATCH` で失敗する（`routing.onNoMatch` を `stop` にすれば止めて Resume できる）。
- 出口ごとに**渡す値**（どの項目か）も決められる。
- 使える名前: `value`（来た値）／`iteration`／来た値がJSONならその項目名／`ノード名.out.項目`。
- **日本語のノード名も条件式に書ける**（`点数評価.out.score >= 8`）。以前は英数字の名前だけだった。
- `set lang "js"` にすると、各条件を **JavaScript**（`return true/false`）で書ける。

## 2.9 計算（calc）

入ってきた線ごとに**変数名**を付けて計算する。

```
node cl: calc
  set code "a + b * 2"

A -> cl pick "score" as "a" position 0
B -> cl pick "score" as "b" position 1
```

- 既定の名前は「項目名 → ノード名 → in1, in2…」の順に決まる。JavaScript の予約語（`in` など）は使えないので `in1` に落ちる（人が入れた名前は検証と赤枠で弾く）。
- `inputs`（つないだ順の配列）と `iteration`（何周目か）も使える。
- **かんたんな式**: `+ - * / %`・比較・`len() has() regex() count() min() max() json_parse() json_stringify()`。
- **JavaScript**: `return` で値を返す。**別スレッド（Worker）で走らせる**ので、無限ループを書いても画面は止まらず **3秒で打ち切る**。Worker が作れない端末では同じ画面の中で走らせる（打ち切れないことは画面に書く）。
- **Python・C言語・Visual Basic は動かせない。** ブラウザに実行系が無いので、動かすには数十MBの実行系を別に積むかサーバに出すことになる（どちらも入れていない）。画面にもそう書いてある（選べるように見せない）。

## 2.10 動く順番

1. **入力が届いた順**に動く。
2. 同じ配り分けで**同時に届いた**ときは図の並びで決める: 縦に流すなら**上**、横に流すなら**左**、同じなら左上、位置まで同じなら**先に作ったノード**。
3. ループは戻ってきた値が新しい入力になるので、そのまま上の規則で続く（特別な扱いは要らない）。

`metadata.layout` と `metadata.flow` は**この「同時のときの並び順」にだけ**使う。
何が動くか・何が流れるかは位置では変わらない（位置を動かしても結果は同じ）。

---

## 3. 外部LLMに渡して直させる（往復）

![AIで編集](docs/ai-loop-sheet.png)

**「書き出す」→ 外部のLLM →「取り込む」** で往復が閉じる。アプリはLLMを呼ばない。

| 手順 | 何が起きるか |
|---|---|
| ① 書き出す（AIに渡す1枚） | **HSLの文法 ＋ いまの構造 ＋ いま出ている指摘 ＋ してほしいこと** を1つの文にしてコピーする。これをそのまま ChatGPT などに貼る |
| ② 取り込む | 返ってきた文を貼る。**``` で囲まれていても、前後に説明が付いていても、HSLでもJSONでも**取り出す |

「書き出す」は **AIに渡す1枚 / HSLだけ / JSONだけ** を切り替えられる。
取り込むと **適用する前に差分が出る**（`+` 増える / `-` 消える / `~` 変わる）。押すまで図は変わらない。

- 検証エラーがある返答は、**適用前に**「このまま適用すると検証エラー: …」と出し、
  **そのエラーをAIに返す文面**をコピーできる。読めない返答も行番号付きで断り、同じく返す文面を出す。
- 渡す1枚には文法の要点（route を書く / join には position を付ける / `.out.<field>` を見るなら schema を書く /
  ノードIDは英数字 など）が入っているので、**何も知らないLLMが初見で読んで書ける**ことを狙っている。

### 診断

**機械で確実に分かることだけを出す（LLMの意見ではない）。**

| 見るもの | 例 |
|---|---|
| 到達性 | 入力から辿り着けないノード、出力に届かない行き止まり |
| 繋がり | Join の items が many でない、まとめ方(op)が無い |
| 式の参照先 | 存在しないノードを見ている条件式 |
| 出力契約 | `x.out.score` を見ているのに `x` に schema が無い |
| ループ | `until` の無い loop は必ず max 回まわる |
| その他 | プロンプトが空、maxTokens 未設定、使われていない provider、validate のエラー全部 |

この結果は「AIに渡す1枚」にも同梱されるので、外部のLLMは指摘を踏まえて直せる。

---

## 4. 書き出す・共有する

![書き出し](docs/export-sheet.png)

### HSL（Harness Spec Language）

組んだハーネスを、人が読み書きできる行指向のテキストにする。値はすべて JSON リテラルなので、
**書き出して読み直すと元に戻る**（全11例で往復を検証済み）。

```
# hsl/1
harness "Loop×並列" v1

provider local = webllm model "SmolLM2-360M-Instruct-q4f16_1-MLC" useWorker true

node seed: input
node gate: llm local
  system "日本語の編集者。"
  prompt "これを直して: {{{in}}}"
  prefix "【必ず守る】箇条書きにしない。"
  gen {"maxTokens":200,"temperature":0.6}
  route parallel failure fail_fast
node critic: llm local
  schema {"type":"object","required":["score"]}
  route first_match on_no_match error
node out: output

seed -> gate
gate -> A
A -> jn.items position 0
critic -> gate loop rev max 3 until "critic.out.score>=8"
critic -> out else priority 1

layout gate 20,142
```

| 行 | 意味 |
|---|---|
| `harness "名前" v1` | ハーネスの名前と版 |
| `provider <id> = <adapter> <key> <値>…` | プロバイダの宣言 |
| `var <名前> = <値>` | 実行時に使う変数 |
| `node <id>: <種類> [provider]` | ノード。続く字下げ行がその中身 |
| `  system / prompt / prefix / suffix` | プロンプトの各部 |
| `  gen {…} / schema {…} / route …` | 生成パラメータ・出力契約・出口の扱い |
| `A -> B[.port] [if "式"] [else] [loop <id> max N until "式"] [position N] [transform X]` | つながり |
| `layout <id> x,y` | 図の中の位置 |

知らないキーも `set <key> <値>` として往復するので、**書き出しで情報が落ちない**。
落ちる場合は書き出し画面が警告を出す（そのときは JSON を使う）。

### 共有と取り込み

- **共有リンク** — Spec を deflate して URL の `#s=…` に載せる。Loop×並列の例で689文字。
  リンクを開いた端末にそのまま図が出る（サーバに何も置かない）。
- **ファイル** — `.hsl` / `.json` で保存、ファイルから読み込み。
- **貼り付け** — HSL でも JSON でも共有リンクでも、貼れば読む（どちらとして読んだかを表示する）。
- **下見は「適用したあとの形」で見せる** — 取り込みの下見は、`normalizeSpec`（入口の順番・出口の流し方に
  既定値を入れる）を**通してから**検証する。通す前に検証していたころは、既定値で埋まるはずのものが
  「出口が2本以上あるのに routing.mode が無い（parallel か first_match を明示する）」という
  検証エラーとして出ていた。埋めたときは「足りていなかった設定は既定値で埋めた」と下見に書く。
- **JSONで直に書く** — ノードと線に書ける設定の全部は、使い方の「**JSONで書く**」タブに載っている。
  そこも全文コピーできるので、外部のLLMに渡す説明としてそのまま使える。
  載せている例は自己テストで毎回 `validate` に通している（説明の中の例が動かない、を作らない）。


---

## 4.5 CPUで動かす道（Wllama / GGUF / WebGPU不要）

**WebGPU経由（WebLLM）で端末ごと落ちるときの、もう一本の道。** llama.cpp を WASM で動かす
[wllama](https://github.com/ngxson/wllama) を同梱し、GGUF を **CPU だけ**で動かす（`n_gpu_layers: 0`）。

```
provider cpu = wllama url "https://…/qwen2.5-0.5b-instruct-q4_k_m.gguf" contextSize 1024 gpuLayers 0
```

- **自動では切り替えない。** 使うかどうかはノード編集で選ぶ（`＋ CPUで動かすLLM（WebGPUを使わない）`）。
  WebLLM 側の動きには一切触っていない。
- 本体（`vendor/wllama/`）も **Safari用の互換ビルド**（`vendor/wllama/compat/`）も同梱し、
  **CDNには行かない**（wllama は既定だと jsDelivr から互換ビルドを取るので、明示的に自分の置き場を渡している）。
- 重みは GGUF。いまは HuggingFace から端末が直接取る（このサイトに置くこともできる）。
- **JSONで縛る**のも効く（`response_format: json_schema` → llama.cpp の文法）。
- 速度は WebGPU 版よりかなり遅い。**落ちるより遅い方がまし**、という位置づけ。

| 見るもの（`harness-wllama.mjs`） | 期待 |
|---|---|
| ロードの渡し方 | GGUFのURL・`n_ctx`・**`n_gpu_layers: 0`**・自分の置き場の wasm と互換ビルド |
| ハーネスとして動く | streaming が onToken に流れ、usage が入る |
| decode中のcancel | `cancelled`（`failed`ではない）・出力は配送しない |
| JSONで縛る | `response_format: json_schema` が渡り、json で返る |
| 片付け | 別のGGUFを読むと前のを `exit()` する（同時に1つだけ） |
| 同梱本体 | `vendor/wllama/index.js` が実ブラウザから読め、wasm も互換ビルドも 200 |

## 5. 4つの adapter

| adapter | 中身 | 料金 | 必要なもの |
|---|---|---|---|
| `mock` | 内蔵の決定論モック | 0 | なし（Runtime回帰テスト用） |
| `openai_local` | OpenAI互換のローカルサーバ（Ollama / LM Studio / llama.cpp server / vLLM） | 0 | ローカルで起動したサーバ |
| `webllm` | **アプリ内蔵**。ブラウザ内WebGPU推論（`vendor/web-llm` を同梱） | 0 | WebGPU対応ブラウザ・初回モデルDL |

**Runtime は adapter 種別を知らない。** Provider は「推論する / Usageを返す / cancelに応答する /
失敗理由を返す」だけを担当し、失敗の波及（`fail_fast`）は Runtime の `applyBranchFailurePolicy`
だけが判断する。Spec の `providers` の中身を差し替えるだけで mock ↔ ローカル ↔ WebLLM が入れ替わる。

### Provider契約

```js
provider.invoke({
  input,        // {messages:[{role,content}]}
  model, generation,   // {maxTokens, temperature, topP, stop}
  schema,       // 構造化出力（任意）。あれば JSON を強制して検査する
  signal,       // AbortSignal。cancelで decode を協調停止
  onToken,      // (tokenStr)=>void  途中tokenはUI/partialOutputだけ。data-flowには載せない
  handle        // ModelManager がロード済みのエンジン（webllm用）
})
→ {output:{type:"text"|"json",value}, usage:{apiCalls,inputTokens,outputTokens,cost:null}, raw?}
→ cancel時は throw せず {cancelled:true, partial}
```

失敗は throw で種別を返す。

| code | いつ | retryable |
|---|---|---|
| `RESOURCE_EXHAUSTED` | OOM（本文/エラーに out of memory 等） | true（`providerState:"needs_reset"`） |
| `MODEL_LOAD_FAILED` | 接続不可・モデル未取得（HTTP 404）・WebGPU無し | true |
| `MODEL_INFERENCE_FAILED` | HTTP 400/422・decode中断 | false |
| `SCHEMA_VALIDATION_ERROR` | schema指定時にJSONとして読めない／制約違反 | false |
| `PROVIDER_ERROR` | その他 | 5xxならtrue |

**Runtime は勝手に回復しない。** 小モデルへの変更・context短縮・自動リトライは一切しない。
OOM後はユーザーが明示 Retry（`iteration` / `loopInstanceId` は増えず `attempt` だけ増える）。

---

## 6. ローカルLLMの繋ぎ方

### Ollama

```
ollama pull qwen2.5:3b
OLLAMA_ORIGINS=* ollama serve        # ブラウザ（別オリジン）から叩くのに必要
```

画面の Provider で `OpenAI互換ローカル` を選び、endpoint `http://localhost:11434/v1`、
model `qwen2.5:3b` を入れて「接続 / モデルロード」。`ready` になったら
「Specのproviders.localに書き込む」→「実行」。

LM Studio（`http://localhost:1234/v1`）・llama.cpp server（`http://localhost:8080/v1`）・
vLLM も同じ OpenAI互換API なので endpoint を変えるだけ。APIキーは使わない。

`file://` で開いた場合（Origin が `null`）でも繋がることは確認済み。
`https://` のページから繋ぐ場合、`localhost` / `127.0.0.1` は mixed content の例外なので通るが、
**LAN内の別マシン（`http://192.168.x.x`）は https ページからは繋がらない**（ブラウザが遮断する）。
その組み合わせでは `harness.html` をローカルに保存して開く。

### 内蔵LLM（サーバ不要・これが本命）

公開URLを開いて **「内蔵LLM（WebGPU）」** を選ぶだけ。iPhone でも PC でも手順は同じ。

1. **端末チェック** を押す — WebGPUの有無・`shader-f16` 対応・バッファ上限・保存容量を**実測**して出す。
   推測はしない。ここに出た値がその端末の事実。
2. 出た結果でモデルを決める
   - `shader-f16` 対応 → `q4f16_1` のモデル（軽い）
   - 非対応 → `q4f32_1` のモデル（同じモデルでも容量は増える）
   - 迷ったら一番小さい `SmolLM2-360M-Instruct-q4f16_1-MLC`（約376MB）から
3. 例の **内蔵LLM直列** を選ぶ → **実行**

初回だけモデルの重みを HuggingFace から端末にDLする（数百MB）。以降は端末内（IndexedDB）から
読むのでオフラインでも動く。**保存状況** で入っているか確認でき、**モデルを削除** で消せる。

| 設定 | 意味 |
|---|---|
| 本体は同梱版 / CDN | `vendor/web-llm/index.js`（同一オリジン）か、jsDelivr。既定は同梱版。**黙って切り替えない** |
| Workerで動かす | 推論を Web Worker に逃がして画面を固まらせない。外すと同じスレッドで動く |
| IndexedDBに保存 | モデルの保存先。Safari では Cache API より確実 |

Workerが作れない・本体が読めない場合、**勝手に別経路へ落とさず失敗理由を出す**（設計方針どおり）。
`file://` で直接開いたときは同梱版を import できないので、CDN に切り替えるか http(s) 配信のページを使う。

---

## 7. Spec の書き方

```jsonc
{
  "providers": {
    "local": { "adapter":"openai_local", "endpoint":"http://localhost:11434/v1",
               "model":"qwen2.5:3b", "generation":{"maxTokens":256,"temperature":0.7} }
  },
  "nodes": [
    { "id":"ans", "type":"llm", "provider":"local",
      "prompt": {
        "system": "JSONのみを返す。",
        "template": {"syntax":"mustache","mode":"interpolation_only",
                     "value":"{{{run_input.question}}}"},
        "prefix": "【必ず守る】箇条書きにしない。",     // 命令時に必ず足す文言
        "suffix": "JSONだけを出力する。"
      },
      "schema": {"type":"object","required":["text","score"],
                 "properties":{"score":{"type":"integer","minimum":0,"maximum":10},
                               "text":{"type":"string","maxLength":300}}},
      "generation": {"maxTokens":200,"temperature":0.2}
    }
  ]
}
```

- **prompt.template** は補間のみ（`{{#…}}` などのタグは `TEMPLATE_NOT_ALLOWED`）。
  参照できるのは `in` / `inputs.<port>` / `iteration` / `vars.*` / `run_input.*`。
  プロンプトはHTMLではないので **エスケープしない**（Join の template は従来どおりエスケープする）。
- **prefix / suffix** はそのまま前後に足す固定文言。「命令時に特定の文言を必ず付ける」用。
- **schema** を書くと `response_format:{type:"json_object"}` を付けて JSON を強制し、
  返ってきた値を `required` / 型 / `minimum` `maximum` / `minLength` `maxLength` / `pattern` /
  `enum` / `minItems` `maxItems` で検査する。違反は `SCHEMA_VALIDATION_ERROR` で **failed**。
- **プログラム側での検出**は Edge の条件式でもできる。
  `if: "ans.out.score >= 8 && ans.meta.len <= 300"` のように
  `out`（値）・`meta.len`（文字数）・`meta.tokens`・`usage` を見て分岐できる。
- **回数の縛り**は `loop:{id,max,until}`。`max` で上限、`until` で打ち切り条件。
- `mock:{...}` は mock adapter の宣言そのもの（テスト用）。`provider` も `mock` も無い llm ノードは
  validation で弾く（隠れたデフォルトを作らない）。

---

## 8. Runtime の3責務分離

```
ExecutionInstance = 個々の実行（control-flow）  pending|ready|running|completed|failed|cancelling|cancelled
EdgeDelivery      = 値の配送（data-flow）        activationId+loopInstanceId+iteration で厳密に仕切る
NodeRun           = 履歴・context用             条件式の <node>.out はここの最新成功出力
BranchGroup       = fan-out全体の失敗波及の単位   primaryFailure を1つだけ持つ
```

- `failed` と `cancelled` は永久に別物。`cancelled` はエラー件数に加算しない
  （A=OOM / B,C=sibling_failed のとき主因は A の1件）。
- 生成途中で cancel / OOM になった文字列は `NodeAttempt.partialOutput` と画面に残すだけで、
  **EdgeDelivery は発生しない**（Join が完成出力と途中出力を混ぜるのを防ぐ）。
- Resume は未完了 Work Item の継続、Retry は失敗した Execution の再投入。課金済みノードは再実行しない。
- **1つの Execution は、同じ `activationId`（＋loopInstance＋iteration）の Delivery しか読まない。**
  だから「別々の分岐から出た線を1つの入口で合流させる」ことはできない
  （分岐は `activationId` を新しく作るため、barrier が永久に揃わない）。
  これは配線だけから分かるので **validate が静的に落とす**（§2「合流できる配線・できない配線」）。
  合流させたいときは、手前に **Join を1つ置いて共有する**。

---

## 9. 画面

| パネル | 何が見えるか |
|---|---|
| ハーネス編集 | ノードの図（タップ・ドラッグで編集）／ JSONタブ ／ 検証エラー |
| 接続の確認（上級者向け） | adapter切替・endpoint・model・ロード状態（`unloaded/loading/ready/error`）とDL進捗。**繋がるか試すだけの場所**で、ふだんは触らない |
| 例と実行 | 例（内蔵LLM・ローカル4種・mock6種）・実行 / 1 Work Item / Cancel / Resume / Retry |
| 実行ログ | Node実行・fan-out・loop・失敗種別・cancel理由 |
| ストリーミング | `onToken` の途中出力（**data-flowには載らない**） |
| 使用量 | apiCalls / in・outトークン / usage未報告数 / cost（ローカルは0・`costSource=unavailable`）/ ノード別の状態と文字数 |

![ノードの編集](docs/editor-sheet.png)

---

## 10. テスト

```
node tests/harness-runtime.mjs      # 自己テスト80件（Runtime回帰 + Provider契約 + HSL + 合流 + ループ + 出口/取り出し + 条件/計算 + 動く順番 + エラーの扱い + 実行の記録 + 式で使える名前と演算子 + first_matchのpriority + wllamaの既定 + 先着 + 検証の適用範囲）
node tests/harness-local-llm.mjs    # 本物のHTTPでOpenAI互換サーバに繋いで端から端まで
node tests/harness-webllm.mjs       # 同梱したWebLLM本体を実ブラウザで読み込み、WebGPUを実測
node tests/harness-wllama.mjs       # CPUで動かす道（Wllama/GGUF）の契約と同梱本体
GGUF_PATH=<….gguf> node tests/harness-real-wllama.mjs   # 本物のGGUFをCPUで動かす（無ければSKIP）
node tests/harness-editor.mjs       # ノードエディタを iPhone 相当のタッチ端末として操作
node tests/harness-share.mjs        # 書き出し・共有リンク・取り込み・診断を通しで操作
node tests/harness-ai-loop.mjs      # 外部LLMとの往復（1枚を出す→返答を口に入れる→差分→適用）
node tests/harness-io-models.mjs    # 入出力パネルの連動と、モデルの一覧・選択・ダウンロード
node tests/harness-fanin.mjs        # 1つの入口に複数の線（合流）・ノードごとのモデル選択・入力直下の実行
node tests/harness-fixflow.mjs      # 失敗の理由・エラーをその場で直す・Joinのまとめ方・線の形
node tests/harness-sitemodels.mjs   # このサイトが配るモデル（取得先が本当に切り替わるか）
node tests/harness-startup.mjs      # 開いた直後の状態（例がそのまま実行できる・前回の続きの復元）
node tests/harness-loop.mjs         # ループノード・緊急停止・入力ノードの文言・出力の受け取り方・入力の順番・大きさ変更
node tests/harness-outputs.mjs      # 出力の項目（出力1・出力2…）・数値の範囲・出口を分ける・受け取る側の項目えらび
node tests/harness-calc.mjs         # 計算ノード（式/JavaScript）・条件分岐ノード・ループのJSモード・使い方の？とJSONタブ
node tests/harness-race.mjs         # 先着（race）— 足す・中身を決める・実行して候補が止まる・記録・診断・使い方3タブ
MODEL_DIR=<重みの場所> node tests/harness-real-llm.mjs   # 本物のモデルで実際に推論する（重みが無ければSKIP）
```

### harness-io-models.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| 初期表示 | 入力欄・出力欄が入力/出力ノードに1対1で出る |
| 入力欄の見出し | 入力ノードに書いた**文言**が見出しになり、**最初から入れておく文**が欄に入る |
| 入力→出力 | 欄に書いた文字がそのまま実行に渡り、結果が出力欄に出る |
| ノードの増減 | 出力ノードを足すと欄が増え、入力ノードを消すと欄が減る |
| 2つ目の入力 | 注意書きが出て、`{{{run_input.<名前>}}}` の値が**実際にモデルへ届く**（リクエスト本文で確認） |
| モデル一覧 | Gemma / Qwen / Llama が必要メモリ付きで並び、q4f32 版も出せる |
| ノードでモデルを選ぶ | パネルに「使う」ボタンが無く、ノード編集で内蔵LLMを選ぶと `providers.local` ができて `node.model` に入る |
| ダウンロード | **固まらず**、届かないときは `MODEL_LOAD_FAILED` と理由が出る |
| **通信が止まる端末** | 応答しない通信を作って再現し、**50秒以内に理由を出して操作が戻る**ことを確認（「押しても何も起きない」の再発防止） |
| **同梱ファイルが404** | 配信物に `vendor/` が無い状態を作り、**「配信されていない」と名指しする**ことを確認 |
| 届かなかった出力 | 途中で失敗したとき、出力欄に `ここまで届かなかった — a で PROVIDER_ERROR` が出る |
| Gemmaの上書き | ノードで Gemma を選ぶと `node.overrides.sliding_window_size = -1` が入り、**別モデルに変えると消える**（他モデルには連れて行かない） |
| 保存状況 | 使用量・上限・長期保存の申請状態が出る |
| **自前の置き場** | 登録すると一覧の先頭に出て、**重みの取得先が指定したURLになる**（実際の通信で確認）。`resolve/main/` が付いた最終URLを表示し、置き場の事前確認と登録解除ができる |

### harness-fanin.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| 2本目を繋ぐ | 受け取り方を聞かれる（勝手に決めない）。**まとめて受け取る**で `inputs.<port>.cardinality = "many"` と `position` が入り、検証が通って実行できる |
| 順番の無いSpecの取り込み | 取り込んだ時点で**つないだ順に `position` が振られ**、`cardinality:"many"` も入って検証エラーが出ない（押すボタンすら要らない） |
| Joinでまとめる | `join`（`json_array`）ノードができて線が張り替わり、そのまま実行できる |
| **別々の分岐からの合流** | 静的に `合流できない配線` として出て、**「まとめて受け取る」は選択肢に出ない**（実行時に揃わないため）。「Joinでまとめる」で**1つの Join を共有**する形に直り、配り方を聞かれて、**そのまま実行して success**（両方の下流に `[A1,B1]` が届く） |
| ノードで内蔵LLMを選ぶ | `providers.local` が作られ、モデル一覧（Gemma/Qwen/Llama）から選んだ値が `node.model` に入る |
| 入力直下の実行ボタン | `#runTop` で実行できる |
| 実行できないとき | 直すところが残っているのに押したら、**押したそばに理由が出る**（無反応にしない） |

### harness-loop.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| 入力ノードの文言 | ノードに書いた文言が入力欄の見出しになり、「最初から入れておく文」が欄に入る |
| タップだけでループを組む | 1本目が**繰り返す先**、2本目が**抜けたあと**になり、本体の先からループノードへ繋ぐと**自動で戻り線**になる。検証エラー無し |
| 抜ける条件 | 式を書かずに「文の長さ」「JSONの値」を選ぶと `A.meta.len >= 1` のような式ができ、実行すると `iterTotal=1` で抜ける |
| 無限ループ | 最大回数を空にすると図が `上限なし` になり、診断に `止まらない（無限ループ）` が出る |
| **緊急停止** | 実行すると右下に **■ 緊急停止** が出て、押すと `cancelled` で止まる（74周まわったところで止まった） |
| 出力ノードの受け取り方 | 出力ノードにも受け取り方の選択肢が5つ出て、`json_array` を選ぶと `["b1","a1"]` が出力欄に出る |
| 入力の順番 | ↑↓ で入れ替えると `position` が振り直され、**実際に渡る順番が変わる** |
| 図のモデル名 | ノードに `SmolLM2-360M-q4f16_1` のように出て、吹き出しに `（providerの既定）` が出る |

### harness-outputs.mjs / harness-calc.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| 出力の項目 | 「項目を決める」でキー名・種類・範囲を決めると schema と例文ができる（`{"score":{"type":"integer","minimum":0,"maximum":10}}`） |
| 出口を分ける | 項目の数だけ出口ができ（`score` / `items`）、図にラベルが出る。既にあった線は1つ目の出口に付け替わる。**リストの何番目、は選ばせない** |
| 出口ごとの値 | 実行すると `score=7` / `items=["い","ろ","は"]` と**別の値が届く** |
| 受け取る側の項目 | 線に `pick` が入り、`note だけ` が下流に届く |
| HSL | `from_port "p1"` / `pick "score"` / `set ports [...]` で往復する |
| 計算ノード | 変数名の既定はノード名。`p * 3 + 1` で 10、JavaScript の `return p * 4;` で 12 |
| 予約語 | 変数名に `in` を入れると**入らず枠が赤くなる** |
| 条件分岐 | 既定で「条件＋それ以外」の2出口。図の出口が2つ出て、当たった1本だけに流れる |
| ループのJS | `return iteration >= 3;` で3周で抜ける |
| 使い方の ？ | 見出し10以上・2000字以上が出て、全文コピーできる |
| 使い方の「JSONで書く」 | JSONのかたまりが字下げのまま15個以上出て、載せた例は `validate` を通り、全文コピーできる |

### harness-startup.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| まっさらな端末 | 例「内蔵LLM直列」（mockではない）が出て、検証エラーが無く、**何も押さずに実行に入る** |
| 前回の続きがある端末 | **開いた直後も例のまま**（前回が失敗していても実行できる）。Resume は押せない状態で、お知らせに「前回の続きを開く / 捨てる」が出る |
| 何も押さずに実行 | ログが `VALIDATE` ではなく `INPUT` から始まる（＝検証で止まっていない） |
| 前回の続きを開く | 図・JSON・入出力欄が**すべて前回のハーネス**になり、直すボタンが出て、Resume が押せるようになる |
| はじめから / 捨てる | 例に戻り、Checkpointが消える |
| JSONタブに貼る | その場で図・入出力欄に反映し、何を読み込んだかを出す。壊れたJSONは「直すまで図は前のまま」 |
| 実行ログの先頭 | どのハーネスを動かしたかが出る |

### harness-fixflow.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| schema が無い条件式 | 取り込んだ時点で検証エラーになり、**「critic に schema を付ける」ボタン**が出る。押すと schema と「JSONだけで答える」指定が入り、エラーが消える |
| **条件の見る先ちがい** | 条件が「手前のノード」を見ているとき、その項目を宣言しているノードが1つあれば**「条件の見る先を 点数評価.out.score に変える」**が出る。押すとエラーが消え、そのまま実行して2周で抜ける |
| 失敗の文 | `[object Object]` を出さない。`score がその中に無い（あるのは: note）` のように、**何が読めなかったか**を言う |
| 流し方が無い | **「in の出口の流し方を決める」ボタン**が出て、選ぶとエラーが消える |
| Joinのまとめ方 | 文章のまま / Markdown / CSV / JSON が選べ、名前と前後の文を入れると**実際にその形で下流に届く** |
| 線の形 | 線の途中の丸をドラッグすると `metadata.bends` に入り、辺シートの「線の形を戻す」で消える |
| Providerの選択肢 | `local（内蔵LLM・この端末で動く）` のように中身が分かる名前で出て、**同じものが二重に並ばない** |

### harness-ai-loop.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| 渡す文面 | 文法・いまの構造・指示・出力形式の指定が1つの文に入る（約2300字） |
| 返答の取り出し | ```付き / 裸 / 前置き付き / JSON を取り出し、**ただの文章は断る** |
| 差分 | `+ ノード A` `- ノード draft` `+ つながり in -> A` のように出る |
| 適用 | 図のノードと線が返答どおりになり、**そのまま実行して success** |
| 壊れた返答 | 行番号付きで断り、**AIに返す文面**を出す |
| route 抜けの返答 | 適用する前に検証エラーを示し、返す文面を出す |
| 書き出しの切替 | 「AIに渡す1枚 / HSLだけ / JSONだけ」が切り替わる |

### harness-share.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| HSL書き出し | `harness` / `node` / `loop … until` の行が出て、**往復の警告が無い** |
| ファイル保存 | 保存された中身が `# hsl/1` で始まる |
| 共有リンク | 圧縮されたURLができ、**別タブで開くと同じ Spec に戻る**（1文字も違わない） |
| HSLを貼る | 手書きのHSLが取り込め、**そのまま実行して success になる** |
| リンクを貼る | URL文字列からも復元する |
| 診断 | 孤立ノードと、存在しないノードを見ている条件式を指摘する |
| AIレビュー | 選んだプロバイダに投げて応答とトークン数が出る |

### harness-editor.mjs が見るもの

390×844・`hasTouch` の端末として、実際のタップとドラッグで操作する。

| 見るもの | 期待 |
|---|---|
| 初期描画 | 例のノード4つと辺4本が図になる |
| ノード追加 | ＋ノード → LLM で1つ増え、中身の編集が開く（既存ノードと重ならない位置に置く） |
| ドラッグ | 座標が `metadata.layout` に入る |
| **タップでつなぐ** | ○ → ● の2タップで辺が1本増える |
| 2本目の出口 | **勝手に決めず**分岐のしかたを聞く。選ぶと `routing` が Spec に書かれる |
| 辺の編集 | loop に変えると `loop:{id,max}` が入る・削除で消える |
| ノード改名 | 辺の参照と layout のキーも追従し、古い名前は残らない |
| 実行 | 図のノードに成功の色が付き、出力がノードに出る |
| JSONタブ | 図とJSONが同じものを指している |

### harness-webllm.mjs が見るもの

| 見るもの | 期待 |
|---|---|
| 端末チェック | WebGPU・adapter・`shader-f16`・バッファ上限・保存容量が**実測値で**返る |
| 同梱本体のimport | 同一オリジンから読めて、モデル一覧157件が取れる（CDN不要の証明） |
| 保存状況 | 未DLなら `cached:false`（IndexedDB経路が動く） |
| Worker往復 | 存在しないモデルIDで `MODEL_LOAD_FAILED`（Worker起動→本体import→エラー返却が成立） |
| 重みが取れない環境 | **固まらず** `MODEL_LOAD_FAILED`（0.4秒で失敗を返す） |
| 例「内蔵LLM直列」 | adapterが内蔵LLMに切り替わり、実行が `failed` で終わる（ハングしない） |

`harness-local-llm.mjs` は node で OpenAI互換のSSEサーバを立て、Chromium から本物の `fetch` で叩く。
見ているもの:

| 見るもの | 期待 |
|---|---|
| 接続 / モデルロード | `ready`（`/v1/models` を見てモデル名も照合する） |
| ローカル直列Harness | success・streamingが画面に出る・出力が全文一致 |
| サーバが受け取ったprompt | system / prefix→template→suffix の順で組み上がっている |
| usage | サーバが返した `prompt_tokens` `completion_tokens` がそのまま入る（捏造しない） |
| **実推論中の Cancel** | 画面は `cancelled`・**サーバ側が切断を観測**（`aborted=1`）・`failed` ではない |
| 部分出力 | `partialOutput` に残るだけで EdgeDelivery は発生せず、下流の Output は動かない |
| 未取得モデル | `MODEL_LOAD_FAILED` |

自己テストの内訳（`harness.html` を開くと画面下にも出る）:

- 1–15: Runtime回帰（loop / 並列 / Join / 型契約 / Checkpoint / Resume / fail_fast / validation）
- 16: providers宣言経由の adapter 解決
- 17–18: openai_local の streaming と非stream
- 19: **decode中の cancel → `cancelled`（`failed` ではない）・部分出力は配送しない**
- 20–21: schema強制とJSON制約の検出
- 22: 失敗種別マッピング（404 / OOM / 400）
- 23: ModelManager のロードは1回だけ
- 24: ローカルProviderのOOMでも波及判断は Runtime 側（fail_fast・主因1件）
- 25: usage未報告時にトークン数を捏造しない
- 26: prompt組立（順序・エスケープなし）
- 27–28: webllm adapter（engineを差し替えてAPI形と interruptGenerate を確認）
- 29–31: HSL の往復（全例ロスレス / 未知キー保持 / 壊れた記述は行番号付きで拒否）
- 32–33: **合流**（別々の分岐から来ても1つの実行に揃う / Joinを共有した形も動く）
- 34–35: **Joinのまとめ方**（markdown / csv / キー付き・必ず付ける文）と**失敗の文**（何が読めなかったかを言う）
- 36–37: 内蔵LLMのJSON強制（`response_format.schema` を文字列で渡す / schema が無いときは付けない）
- 38: `maxTokens` で切れたときは「切れた」と言う
- 39: 取得先が変わっても端末にある分を使う（落とし直させない）
- 40: schema の型が緩いと配線だけで落とす／実行時は返ってきた値を文で言う
- 41: **日本語のノード名**も HSL で往復する（`node "検証": llm local`）／使えない文字は検証で落とす
- 42: 出力の形「リスト」は配列で返り、箇条書きに変換して次へ渡せる
- 43: 複数入力の受け取り方（改行 / 番号 / 見出し / CSV / 配列 / 区切り指定）
- 44: 端末の中のモデルは同時に1つだけ（別のを読むと前のを片付ける）

### 本物のモデルでの確認（GitHub Actions）

`.github/workflows/real-llm.yml` が、**実際に重みを取って推論する**。
Claude Code の実行環境からは HuggingFace に届かないので、ここで走らせている。

| 見るもの | 結果（run #2 / 2026-09-20） |
|---|---|
| HuggingFace への到達（runner） | ✔ 到達できる |
| モデル取得（SmolLM2-360M） | ✔ 198MB（q4f16）/ q4f32 はCI用 |
| WebGPU（GPUの無い機械） | `--enable-unsafe-webgpu --use-angle=swiftshader --enable-features=Vulkan` で adapter が取れる（`shader-f16` は無いので **CIは q4f32 版**） |
| 素の生成 | ✔ 成功（load 1.9秒 / 生成は CPU実装のため 806秒） |
| JSON強制（schema付き） | ✔ **GrammarMatcherInitError は出ない**（v0.13.0の修正が効いている）。文法を組み立てて生成まで進む。<br>ただし **SmolLM2-360M は中身を外す**: `{"score": 5.0000000000…}`（型なし）→ 型を `integer` にすると `{"score": 5000000000000…}` と0を出し続け、`maxTokens` で切れた。<br>→ **「途中で切れた（maxTokens N に達した）」**と言うようにした。中身の質はモデルの性能の話なので、CIは「文法が組めて、失敗しても説明できる形になる」ことまでを見る |
| 重みが Git に入っていないこと | ✔ |

GPUのある実機（iPhoneなど）での速度・OOM・実decode中cancelは、**ここでは分からない**。

### 確認できていないこと

**実機での「モデルの重みDL → 実際の推論」は未確認。**
検証環境からは HuggingFace（重みの置き場）へ通信できず、GPUも swiftshader のソフトウェア実装しかない。
そのため確認できたのはここまで:

- 同梱した WebLLM 本体が同一オリジンから読め、モデル一覧が取れる ✔
- Worker が起動し、本体を読み込み、エラーを往復で返す ✔
- WebGPU の実測値（adapter・features・limits・保存容量）が取れる ✔
- 重みが取れないときに**固まらず**失敗種別を返す ✔
- 重みのDLとその後の推論 ✘ ← **実機で最初に確かめること**

`openai_local` 側の in-flight cancel は、サーバ側が切断を観測するところまで本物で確認済み。
