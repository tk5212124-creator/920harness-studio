# vendor/transformers

Embedding（意味の近さ）を端末の中で計算するために同梱しているもの。CDN に依存せず同一オリジンから読む。

| ファイル | 元 | 版 | ライセンス |
|---|---|---|---|
| `transformers.min.js` | [@huggingface/transformers](https://github.com/huggingface/transformers.js) `dist/transformers.min.js` | 4.2.0 | Apache-2.0（`LICENSE`） |
| `ort-wasm-simd-threaded.mjs` / `.wasm` | [onnxruntime-web](https://github.com/microsoft/onnxruntime) `dist/` | 1.26.0-dev.20260416-b7804b056c（transformers 4.2.0 が指定している版） | MIT（package.json の license。npm パッケージに LICENSE ファイルは入っていない） |

- 使うのは CPU（WebAssembly）だけ。WebGPU 用の `.jsep` / `.asyncify` は置いていない（生成の LLM と GPU を取り合わないため）。
- スレッドは1本（GitHub Pages は cross-origin isolation が無いので、複数スレッドは使えない）。
- `harness.html` の EmbeddingManager が、このファイルを読む Worker を作る（`wasmPaths` をこのディレクトリに向ける）。

更新するとき:

```
npm pack @huggingface/transformers@<ver>
npm pack onnxruntime-web@<transformers の package.json に書いてある版>
cp package/dist/transformers.min.js vendor/transformers/
cp package/LICENSE vendor/transformers/LICENSE
cp <ort>/dist/ort-wasm-simd-threaded.mjs <ort>/dist/ort-wasm-simd-threaded.wasm vendor/transformers/
```

**モデルの重みはここには入っていない。** 初めて使うときに、まず同じサイトの `models/embed/<モデル名>/` を探し、
無ければ Hugging Face（huggingface.co）から取る。取ったものはブラウザのキャッシュ（Cache API）に残る。
