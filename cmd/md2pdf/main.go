package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path"
	"path/filepath"
)

func main() {
	if len(os.Args) != 3 {
		log.Fatalf("Usage: markdown-to-pdf <input-file> <output-file>")
	}

	inputFile := os.Args[1]
	outputFile := os.Args[2]

	inputDir := filepath.Dir(inputFile)

	// ファイルを読み込む
	content, err := ioutil.ReadFile(inputFile)
	if err != nil {
		fmt.Printf("Error reading file: %v\n", err)
		os.Exit(1)
	}

	markdownString := string(content)

	// 追加する文字列
	header := `---
stylesheet: https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/2.10.0/github-markdown.min.css
body_class: markdown-body
---`

	// テンプレートを作成して、先頭に追加
	mdStrWithHeader := header + "\n\n" + markdownString

	// ファイルを作成する
	tmpFileName := "tmp.md"
	tmpFilePath := path.Join(inputDir, tmpFileName)
	tmpFile, err := os.Create(tmpFilePath)
	if err != nil {
		fmt.Println("Error creating temporary file:", err)
		return
	}
	defer os.Remove(tmpFile.Name()) // 関数終了時にファイルを削除する

	// マークダウンテキストを一時ファイルに書き込む
	_, err = tmpFile.WriteString(mdStrWithHeader)
	if err != nil {
		fmt.Println("Error writing markdown text to temporary file:", err)
		return
	}

	cmd := exec.Command("npm", "run", "md-to-pdf", tmpFilePath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err = cmd.Run()
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("PDF file has been generated: %s\n", outputFile)
}
