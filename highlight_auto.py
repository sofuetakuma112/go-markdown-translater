import guesslang
import codecs
import sys

# パス文字列を取得する
path = sys.argv[1]

# ファイルを非同期で読み込む
with codecs.open(path, "r", "utf-8") as f:
    code = f.read()

# 推測
result = guesslang.Guess().language_name(code)

# ファイルに書き込む
with codecs.open(path, "w", "utf-8") as f:
    f.write(result)