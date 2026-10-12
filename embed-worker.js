/* Embedding 専用の Worker（harness.html の EmbeddingManager が作る）。
   Transformers.js（vendor/transformers に同梱）を CPU（WebAssembly・スレッド1本）で動かす。
   生成の LLM（WebGPU）とは別のスレッド・別の実行系なので、GPU を取り合わない。
   ・モデルは使うときに読み、読んだら使い回す（dispose で片付ける）
   ・この Worker は文を受け取ってベクトルを返すだけ。外へ送るのはモデルのファイルを取りに行くときだけ
   ・blob の Worker にしないのは、Transformers.js 4.2.0 が localModelPath を絶対 URL にすると
     tokenizer の有無を確かめずに飛ばすため（相対パスはこのファイルの場所から解決される） */
import { pipeline, env } from "./vendor/transformers/transformers.min.js";
const BASE = new URL("./vendor/transformers/", import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = { mjs: BASE + "ort-wasm-simd-threaded.mjs", wasm: BASE + "ort-wasm-simd-threaded.wasm" };
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
const P = {};
onmessage = async e => {
  const d = e.data || {};
  try {
    if (d.type === "load") {
      env.allowLocalModels = !!d.localModelPath; if (d.localModelPath) env.localModelPath = d.localModelPath;
      env.allowRemoteModels = !!d.allowRemote;
      const t0 = performance.now();
      P[d.model] = P[d.model] || await pipeline("feature-extraction", d.model, {
        dtype: d.dtype || "q8", device: "wasm",
        progress_callback: p => postMessage({ id: d.id, progress: p && p.progress != null ? p.progress / 100 : null, file: p && p.file || null, status: p && p.status || null })
      });
      if (!P[d.model].tokenizer) { delete P[d.model]; throw new Error("tokenizer が見つからない（tokenizer.json / tokenizer_config.json が無い）"); }
      postMessage({ id: d.id, ok: true, ms: Math.round(performance.now() - t0) }); return;
    }
    if (d.type === "embed") {
      const p = P[d.model]; if (!p) throw new Error("モデルが読み込まれていない: " + d.model);
      const out = await p(d.texts, { pooling: "mean", normalize: true });
      const dims = out.dims[out.dims.length - 1];
      const data = out.data instanceof Float32Array ? out.data : Float32Array.from(out.data);
      postMessage({ id: d.id, ok: true, dims, data }, [data.buffer]); return;
    }
    if (d.type === "dispose") {
      for (const k of Object.keys(P)) { try { await P[k].dispose(); } catch (_) {} delete P[k]; }
      postMessage({ id: d.id, ok: true }); return;
    }
    throw new Error("知らない指示: " + d.type);
  } catch (err) { postMessage({ id: d.id, ok: false, err: String(err && err.message || err) }); }
};
