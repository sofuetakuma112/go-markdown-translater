package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/sofuetakuma112/go-markdown-translater/pkg/translate"
)

type Set map[int]bool

func NewSet() Set {
	return make(map[int]bool)
}

func (s Set) Add(item int) {
	s[item] = true
}

func main() {
	filePath := "db_modified.json"
	var bytes []byte
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		filePath = "db_dump.json"
		bytes, err = ioutil.ReadFile(filePath)
		if err != nil {
			log.Fatal(err)
		}
	} else {
		bytes, err = ioutil.ReadFile(filePath)
		if err != nil {
			log.Fatal(err)
		}
	}

	var items []*translate.Item
	err := json.Unmarshal(bytes, &items)
	if err != nil {
		fmt.Println("Error parsing JSON:", err)
		return
	}

	// プログラム上で可能な置換処置を行う
	for _, item := range items {
		if !strings.Contains(item.SourceText, "# ") {
			re := regexp.MustCompile(`^#+\s+`)
			item.FormattedText = re.ReplaceAllString(item.FormattedText, "")
		}

		if !strings.Contains(item.SourceText, "\n") {
			item.FormattedText = strings.ReplaceAll(item.FormattedText, "\n", "")
		}
	}

	// ユーザーによる手動の修正が必要な箇所を探す
	set := NewSet()
	for i, item := range items {
		sourceLen := len(item.SourceText)
		formattedLen := len(item.FormattedText)

		// 増加率による検索
		if sourceLen < formattedLen {
			ratio := float64(formattedLen) / float64(sourceLen)
			// 300.0あたりが最適な気がする
			if ratio*100 > 280.0 {
				// インデックスをSetに追加する
				set.Add(i)
			}
		}

		// 部分一致による検索
		if strings.Contains(item.FormattedText, item.SourceText) && !strings.Contains(item.SourceText, "Chapter") && !strings.Contains(item.SourceText, "File:") {
			set.Add(i)
		}

		// # を含むテキストの検索
		if strings.Contains(item.FormattedText, "# ") {
			set.Add(i)
		}
	}

	for k, v := range set {
		if v {
			item := items[k]
			fmt.Printf("sourceText: %q\n", item.SourceText)
			fmt.Printf("formattedText: %q\n", item.FormattedText)
			fmt.Println()
		}
	}

	file, err := os.Create("db_modified.json")
	if err != nil {
		fmt.Println("Error creating file:", err)
		return
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")

	if err := encoder.Encode(items); err != nil {
		fmt.Println("Error encoding JSON:", err)
		return
	}
}
