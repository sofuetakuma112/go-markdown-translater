import hljs from "highlight.js";
import fs from "fs";

// パス文字列を取得する
const path = process.argv[2];

// ファイルを非同期で読み込む
fs.readFile(path, "utf-8", (err, code) => {
  if (err) {
    console.error(err);
    return;
  }
  const result = hljs.highlightAuto(code);

  fs.writeFile(path, result.language, (err) => {
    if (err) throw err;
  });
});
