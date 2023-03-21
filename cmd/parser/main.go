package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"regexp"
	"strings"
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

	textContents := ""

	for _, it := range parseMarkdown(markdownString) {
		if it.Type == Text || it.Type == Item {
			textContents += it.Text
			textContents += "\n"
		}
	}

	ioutil.WriteFile("textContents.md", []byte(textContents), 0644)
}

type NodeType int

const (
	Paragraph  NodeType = iota // パラグラフ
	Item                       // 箇条書きリストの要素
	NumberItem                 // 番号付きリストの要素
	CodeBlock                  // コードブロック
	Image                      // 画像
)

type Node struct {
	Type  NodeType // どの種類のNodeか
	Text  string   // マークダウンのテキスト
	Level int      // 箇条書きリストの要素のネストレベル
}

func parseMarkdown(markdownString string) []*Node {
	var result []*Node
	var current bytes.Buffer
	scanner := bufio.NewScanner(strings.NewReader(markdownString))

	codeBlock := false
	imgRegex := regexp.MustCompile(`!\[.*\]\(.*\)`)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "```") {
			codeBlock = !codeBlock
			if !codeBlock {
				current.WriteString(line)
				result = append(result, &Node{
					Type: CodeBlock,
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
			result = append(result, &Node{
				Type: Image,
				Text: current.String(),
			})
			current.Reset()
			continue
		}
		if len(line) > 0 {
			current.WriteString(line + "\n")
		} else {
			result = append(result, &Node{
				Type: Paragraph,
				Text: current.String(),
			})
			current.Reset()
		}
	}
	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}

	if current.Len() > 0 {
		result = append(result, &Node{
			Type: Paragraph,
			Text: current.String(),
		})
	}

	return result
}
