# 使い方: python3 -m pip install onnx tokenizers numpy && python3 tools/make-tiny-embed-model.py tests/fixtures/embed/test/tiny-embed
# テスト用の極小 Embedding モデル（意味は分からない。Transformers.js の読み込み・トークン化・推論・平均・正規化の道を通すためだけ）
import json, os, sys, numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
from tokenizers import Tokenizer, models, normalizers, pre_tokenizers, processors
out = sys.argv[1]; os.makedirs(out + "/onnx", exist_ok=True)
chars = [chr(c) for c in range(ord('a'), ord('z')+1)] + [str(d) for d in range(10)]
chars += [chr(c) for c in range(0x3041, 0x3097)] + [chr(c) for c in range(0x30A1, 0x30FB)]
chars += list("日本語東京大阪富士山京都空海川犬猫車電気水火木金土月学校先生質問答回意味近同")
specials = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"]
vocab = specials + chars + ["##" + c for c in chars]
vmap = {t: i for i, t in enumerate(vocab)}
tok = Tokenizer(models.WordPiece(vocab=vmap, unk_token="[UNK]", max_input_chars_per_word=100))
tok.normalizer = normalizers.BertNormalizer(clean_text=True, handle_chinese_chars=True, strip_accents=False, lowercase=True)
tok.pre_tokenizer = pre_tokenizers.BertPreTokenizer()
tok.post_processor = processors.TemplateProcessing(single="[CLS] $A [SEP]", pair="[CLS] $A [SEP] $B [SEP]",
    special_tokens=[("[CLS]", vmap["[CLS]"]), ("[SEP]", vmap["[SEP]"])])
tok.save(out + "/tokenizer.json")
json.dump({"tokenizer_class": "BertTokenizer", "do_lower_case": True, "model_max_length": 512,
           "cls_token": "[CLS]", "sep_token": "[SEP]", "pad_token": "[PAD]", "unk_token": "[UNK]", "mask_token": "[MASK]"},
          open(out + "/tokenizer_config.json", "w"))
D = 32
json.dump({"model_type": "bert", "hidden_size": D, "vocab_size": len(vocab), "num_attention_heads": 1,
           "num_hidden_layers": 0, "max_position_embeddings": 512, "_note": "test fixture: embedding lookup only"},
          open(out + "/config.json", "w"))
rng = np.random.default_rng(20261012)
E = rng.standard_normal((len(vocab), D)).astype(np.float32)
# 「##x」は「x」と同じ向きにする（文字が同じなら近くなる）
for c in chars: E[vmap["##" + c]] = E[vmap[c]]
E[vmap["[CLS]"]] = 0; E[vmap["[SEP]"]] = 0; E[vmap["[PAD]"]] = 0
g = helper.make_graph(
    [helper.make_node("Gather", ["E", "input_ids"], ["last_hidden_state"], axis=0)], "tiny",
    [helper.make_tensor_value_info("input_ids", TensorProto.INT64, ["batch", "seq"]),
     helper.make_tensor_value_info("attention_mask", TensorProto.INT64, ["batch", "seq"])],
    [helper.make_tensor_value_info("last_hidden_state", TensorProto.FLOAT, ["batch", "seq", D])],
    [numpy_helper.from_array(E, "E")])
m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 13)]); m.ir_version = 8
onnx.checker.check_model(m); onnx.save(m, out + "/onnx/model.onnx")
print("vocab", len(vocab), "bytes", os.path.getsize(out + "/onnx/model.onnx"))
