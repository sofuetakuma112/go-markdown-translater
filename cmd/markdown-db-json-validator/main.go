package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"

	"github.com/sofuetakuma112/go-markdown-translater/pkg/parser"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/textprocesser"

	"github.com/sofuetakuma112/go-markdown-translater/pkg/translate"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Println("Usage: counttext <input-file>")
		os.Exit(1)
	}

	filePath := os.Args[1]

	// ファイルを読み込む
	content, err := ioutil.ReadFile(filePath)
	if err != nil {
		log.Fatalf("Error reading file: %v", err)
	}

	markdownString := string(content)

	nodes := parser.ParseMarkdown(markdownString)
	for _, node := range nodes {
		fmt.Println(node)
	}

	targetNodes := []*parser.Node{}
	for _, node := range nodes {
		switch node.Type {
		case parser.Heading, parser.Paragraph, parser.Item, parser.OrderedItem, parser.Table:
			if !textprocesser.ContainsEnglishWords(node.Text) {
				continue
			}

			targetNodes = append(targetNodes, node)
		}
	}

	bytes, err := ioutil.ReadFile("db_modified.json")
	if err != nil {
		log.Fatal(err)
	}

	var items []*translate.Item
	err = json.Unmarshal(bytes, &items)
	if err != nil {
		fmt.Println("Error parsing JSON:", err)
		return
	}

	for _, node := range targetNodes {
		items = removeItem(items, node.Text)
	}

	if len(items) == 0 {
		fmt.Println("JSONは正常")
	} else {
		for _, item := range items {
			fmt.Printf("sourceText: %s\n", item.SourceText)
		}
	}
}

func removeItem(items []*translate.Item, sourceText string) []*translate.Item {
	if items == nil {
		return nil
	}

	for i, item := range items {
		if item.SourceText == sourceText {
			// 要素を削除する
			copy(items[i:], items[i+1:])
			items[len(items)-1] = nil // メモリリークを避けるために要素を初期化
			items = items[:len(items)-1]
			break
		}
	}
	return items
}
