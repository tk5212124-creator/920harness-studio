# vendor/web-llm

[@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) **v0.2.85** の ESM ビルド（`lib/index.js`）をそのまま置いたもの。
ライセンスは Apache-2.0（`LICENSE`）。

CDN に依存せず同一オリジンから読むために同梱している。iOS Safari では
外部CDNからの module import が失敗することがあり、同一オリジンの方が確実なため。

更新するとき:

```
npm pack @mlc-ai/web-llm            # or: curl -O https://registry.npmjs.org/@mlc-ai/web-llm/-/web-llm-<ver>.tgz
tar xzf mlc-ai-web-llm-<ver>.tgz
cp package/lib/index.js vendor/web-llm/index.js
cp package/LICENSE vendor/web-llm/LICENSE
```

**モデルの重みはここには入っていない**（1モデルで数百MB）。初回実行時に端末が
HuggingFace から取得し、端末内（IndexedDB / Cache API）に保存する。以降はオフラインで動く。
