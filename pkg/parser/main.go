package parser

import (
	"fmt"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/parser"
	"io/ioutil"
	"log"
	"regexp"
	"strconv"
	"strings"
)

func IsValidMarkdown(text string) bool {
	md := goldmark.New(
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
		),
	)

	err := md.Convert([]byte(text), ioutil.Discard)
	return err == nil
}

type NodeType int

const (
	Heading     NodeType = iota // 見出し
	Paragraph                   // パラグラフ
	Item                        // 箇条書きリストの要素
	OrderedItem                 // 番号付きリストの要素
	CodeBlock                   // コードブロック
	Image                       // 画像
	Table                       // テーブル
	Blank                       // 空行
	Other                       // その他の要素
)

type Node struct {
	Index          int
	Type           NodeType // どの種類のNodeか
	Text           string   // マークダウンのテキスト
	TranslatedText string
	OrderedItemNum int
	NestSpaceCount int // 箇条書きリスト要素のネストのためのスペースが何個あるか
	HeadingLevel   int // 見出しのレベル
}

func ParseMarkdown(markdown string) []*Node {
	lines := strings.Split(markdown, "\n")
	var nodes []*Node
	var currentParagraph []string
	var tableParts []string

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		trimmedLine := strings.TrimSpace(lines[i])

		if trimmedLine == "" {
			if len(currentParagraph) > 0 {
				text := strings.Join(currentParagraph, " ")

				nestSpaceCount := 0
				for _, ch := range text {
					if ch == ' ' {
						nestSpaceCount++
					} else {
						break
					}
				}

				nodes = append(nodes, createNewNodeWithIndex(Node{Type: Paragraph, Text: strings.TrimSpace(text), NestSpaceCount: nestSpaceCount}, i))
				currentParagraph = nil
			}
			nodes = append(nodes, createNewNodeWithIndex(Node{Type: Blank}, i))
			continue
		}

		if strings.HasPrefix(trimmedLine, "#") {
			nodes = append(nodes, createNewNodeWithIndex(parseHeading(trimmedLine), i))
		} else if strings.HasPrefix(trimmedLine, "- ") {
			nodes = append(nodes, createNewNodeWithIndex(parseItem(line), i))
		} else if matched, _ := regexp.MatchString(`^\d+\.\s`, trimmedLine); matched {
			nodes = append(nodes, createNewNodeWithIndex(parseOrderedItem(line), i))
		} else if strings.HasPrefix(trimmedLine, "```") {
			codeBlock, delta := parseCodeBlock(lines[i:])
			nodes = append(nodes, createNewNodeWithIndex(codeBlock, i))
			i += delta
		} else if strings.HasPrefix(trimmedLine, "!") {
			nodes = append(nodes, createNewNodeWithIndex(parseImage(trimmedLine), i))
		} else if strings.HasPrefix(trimmedLine, "|") && isTableLine(trimmedLine) {
			// テーブル行のフォーマットならtablePartsにappendする
			tableParts = append(tableParts, trimmedLine)

			// i+1番目のlinesがテーブル行のフォーマットかチェック
			if i+1 < len(lines) && isTableLine(lines[i+1]) {
				// i+1番目のlinesがテーブル行のフォーマットならcontinue
				continue
			} else {
				// i+1番目のlinesがテーブル行のフォーマットでないならtablePartsを使ってType: TableのNodeにする
				tableNode := buildTableNode(tableParts)
				nodes = append(nodes, createNewNodeWithIndex(tableNode, i))
				tableParts = nil
			}
		} else {
			currentParagraph = append(currentParagraph, line)
		}
	}

	if len(currentParagraph) > 0 {
		nodes = append(nodes, createNewNodeWithIndex(Node{Type: Paragraph, Text: strings.Join(currentParagraph, " ")}, len(lines)-1))
	}

	return nodes
}

func parseHeading(line string) Node {
	level, nestSpaceCount := 0, 0
	for i, ch := range line {
		if ch == '#' {
			level++
			if i+1 < len(line) && string(line[i+1]) == " " {
				break
			}
		} else if ch == ' ' {
			nestSpaceCount++
		} else {
			break
		}
	}
	return Node{Type: Heading, Text: strings.TrimSpace(line[level+nestSpaceCount:]), HeadingLevel: level, NestSpaceCount: nestSpaceCount}
}

func parseItem(line string) Node {
	// lineの-からテキストが始まるまでの空白の数を1つにする
	hyphenIdx := strings.Index(line, "-")
	nestSpaceCount := len(line[:hyphenIdx])
	text := strings.TrimSpace(line[hyphenIdx+1:])
	return Node{Type: Item, Text: text, NestSpaceCount: nestSpaceCount}
}

func parseOrderedItem(line string) Node {
	dotIdx := strings.Index(line, ".")

	orderNum, err := strconv.Atoi(strings.TrimSpace(line[:dotIdx]))
	if err != nil {
		log.Fatal(err)
	}

	orderIdx := strings.Index(line, fmt.Sprintf("%d.", orderNum)) // 始端のidxを返す

	nestSpaceCount := len(line[:orderIdx])

	return Node{Type: OrderedItem, Text: strings.TrimSpace(line[dotIdx+1:]), OrderedItemNum: orderNum, NestSpaceCount: nestSpaceCount}
}

func parseCodeBlock(lines []string) (Node, int) {
	nestSpaceCount := len(lines[0]) - len(strings.TrimSpace(lines[0]))
	var codeLines []string
	i := 1
	for ; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "```" {
			break
		}
		codeLines = append(codeLines, lines[i])
	}
	return Node{Type: CodeBlock, Text: strings.Join(codeLines, "\n"), NestSpaceCount: nestSpaceCount}, i
}

func parseImage(line string) Node {
	nestSpaceCount := len(line) - len(strings.TrimSpace(line))
	return Node{Type: Image, Text: strings.TrimSpace(line), NestSpaceCount: nestSpaceCount}
}

func isTableLine(line string) bool {
	return strings.HasPrefix(line, "|")
}

func buildTableNode(lines []string) Node {
	nestSpaceCount := len(lines[0]) - len(strings.TrimSpace(lines[0]))
	return Node{Type: Table, Text: strings.Join(lines, "\n"), NestSpaceCount: nestSpaceCount}
}

func createNewNodeWithIndex(node Node, index int) *Node {
	newNode := Node{
		Index:          index,
		Type:           node.Type,
		Text:           node.Text,
		TranslatedText: node.TranslatedText,
		OrderedItemNum: node.OrderedItemNum,
		NestSpaceCount: node.NestSpaceCount,
		HeadingLevel:   node.HeadingLevel,
	}
	return &newNode
}
