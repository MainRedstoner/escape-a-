import json, os
dst = r"D:\Projects\escape-a÷\.train\tokenizer\openai_clip-vit-large-patch14"
cfg_path = os.path.join(dst, "tokenizer_config.json")
cfg = json.load(open(cfg_path, encoding="utf-8"))
cfg["vocab_file"] = os.path.join(dst, "vocab.json")
cfg["merges_file"] = os.path.join(dst, "merges.txt")
json.dump(cfg, open(cfg_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
from transformers import CLIPTokenizer
tk = CLIPTokenizer.from_pretrained(dst)
ids = tk("eawhale, 1girl, navy and white maid dress", truncation=True, max_length=77).input_ids
print("tokenize OK, len =", len(ids))
tk2 = CLIPTokenizer.from_pretrained(dst)  # 二次加载
print("二次加载 OK")
