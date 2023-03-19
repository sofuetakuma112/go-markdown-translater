package main

import (
	"bufio"
	"bytes"
	"fmt"
	"html"
	"io/ioutil"
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/sergi/go-diff/diffmatchpatch"
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

	source := string(content)

	textContents := ""

	for _, it := range parseMarkdown(source) {
		if it.Type != Other {
			textContents += it.Text
			textContents += "\n"
		}
	}

	ioutil.WriteFile("textContents.md", []byte(textContents), 0644)

	// diff(textContents, source)
}

type ItemType int

const (
	Text ItemType = iota
	Other
)

type Item struct {
	Type ItemType
	Text string
}

func parseMarkdown(source string) []*Item {
	var result []*Item
	var current bytes.Buffer
	scanner := bufio.NewScanner(strings.NewReader(source))

	codeBlock := false
	imgRegex := regexp.MustCompile(`!\[.*\]\(.*\)`)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "```") {
			codeBlock = !codeBlock
			// codeBlock === falseはコードブロックの終わりを検知した
			if !codeBlock {
				current.WriteString(line)
				result = append(result, &Item{
					Type: Other,
					Text: current.String(),
				})
				current.Reset()
				continue
			}
		}
		if codeBlock {
			current.WriteString(line + "\n")
			continue
		}
		if imgRegex.MatchString(line) {
			current.WriteString(line + "\n")
			result = append(result, &Item{
				Type: Other,
				Text: current.String(),
			})
			current.Reset()
			continue
		}
		if len(line) > 0 {
			current.WriteString(line + "\n")
		} else {
			result = append(result, &Item{
				Type: Text,
				Text: current.String(),
			})
			current.Reset()
		}
	}
	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}

	if current.Len() > 0 {
		result = append(result, &Item{
			Type: Text,
			Text: current.String(),
		})
	}

	return result
}

func diff(source, target string) {
	dmp := diffmatchpatch.New()
	diffs := dmp.DiffMain(source, target, false)

	var result strings.Builder
	for _, diff := range diffs {
		switch diff.Type {
		case diffmatchpatch.DiffInsert:
			result.WriteString("\033[32m") // 緑色で挿入されたテキストを表示
			result.WriteString(html.EscapeString(diff.Text))
			result.WriteString("\033[0m") // リセット
		case diffmatchpatch.DiffDelete:
			result.WriteString("\033[31m") // 赤色で削除されたテキストを表示
			result.WriteString(html.EscapeString(diff.Text))
			result.WriteString("\033[0m") // リセット
		case diffmatchpatch.DiffEqual:
			result.WriteString(html.EscapeString(diff.Text))
		}
	}

	fmt.Println(result.String())
}
