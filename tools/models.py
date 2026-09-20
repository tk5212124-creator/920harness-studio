#!/usr/bin/env python3
"""models.txt に書いたモデルを、HuggingFace から取ってきて配信物に入れる。

重みは Git に入れない（Git LFS は GitHub Pages では配信できず、1ファイル100MBの制限もあるため）。
GitHub Actions が毎回のデプロイで取ってきて、_site/ の中に置くだけにする。

  fetch  models.txt のモデルを .modelcache/<id>/ に落とす
  stage  .modelcache から _site/models/<id>/resolve/main/ に配って、一覧(models_index.json)を書く

WebLLM は重みURLの下に resolve/main/ を足す規則（vendor/web-llm/index.js の cleanModelUrl）なので、
配信側もその形にしておく。
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".modelcache")
SITE = os.path.join(ROOT, "_site")


def entries(path=None):
    out = []
    with open(path or os.path.join(ROOT, "models.txt"), encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) != 2:
                sys.exit(f"models.txt {i}行目: 「<HFのリポジトリ> <公開する名前>」の形にする: {line}")
            out.append((parts[0], parts[1]))
    return out


def mb(path):
    return int(subprocess.check_output(["du", "-sm", path]).split()[0])


def fetch():
    from huggingface_hub import snapshot_download
    for repo, mid in entries():
        print(f"== {repo} -> {mid}", flush=True)
        snapshot_download(repo_id=repo, local_dir=os.path.join(CACHE, mid))
        shutil.rmtree(os.path.join(CACHE, mid, ".cache"), ignore_errors=True)


def fetch_one(repo, dest):
    """1つだけ取ってくる（CIの実推論テスト用）。"""
    from huggingface_hub import snapshot_download
    print(f"== {repo} -> {dest}", flush=True)
    snapshot_download(repo_id=repo, local_dir=dest)
    shutil.rmtree(os.path.join(dest, ".cache"), ignore_errors=True)


def stage():
    out = []
    for repo, mid in entries():
        src = os.path.join(CACHE, mid)
        cfg = os.path.join(src, "mlc-chat-config.json")
        if not os.path.exists(cfg) or os.path.getsize(cfg) == 0:
            # 取れていないものは配らない。一覧にも載せない（端末は HuggingFace から直接落とす）
            print(f"::warning::{mid}: 取得できていないので、このサイトからは配らない", flush=True)
            continue
        dst = os.path.join(SITE, "models", mid, "resolve", "main")
        shutil.copytree(src, dst, dirs_exist_ok=True)
        size = mb(os.path.join(SITE, "models", mid))
        print(f"{mid}: {size}MB", flush=True)
        out.append({"id": mid, "path": f"models/{mid}/resolve/main/", "mb": size, "from": repo})
    os.makedirs(SITE, exist_ok=True)
    with open(os.path.join(SITE, "models_index.json"), "w", encoding="utf-8") as f:
        json.dump({"models": out}, f, ensure_ascii=False, indent=1)
    print(open(os.path.join(SITE, "models_index.json"), encoding="utf-8").read())


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "fetch":
        fetch()
    elif cmd == "stage":
        stage()
    elif cmd == "fetch1":
        if len(sys.argv) != 4:
            sys.exit("使い方: tools/models.py fetch1 <HFのリポジトリ> <保存先>")
        fetch_one(sys.argv[2], sys.argv[3])
    elif cmd == "list":
        for repo, mid in entries():
            print(repo, mid)
    else:
        sys.exit("使い方: tools/models.py fetch|fetch1|stage|list")
