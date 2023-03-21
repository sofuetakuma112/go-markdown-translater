package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"regexp"
	"strconv"
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

	nodes := ParseMarkdown(markdownString)
	for _, node := range nodes {
		fmt.Println(node)
	}

	newMarkdown := NodesToMarkdown(nodes)

	ioutil.WriteFile("remarked.md", []byte(newMarkdown), 0644)
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
	Type           NodeType // どの種類のNodeか
	Text           string   // マークダウンのテキスト
	OrderedItemNum int
	NestSpaceCount int // 箇条書きリスト要素のネストのためのスペースが何個あるか
	HeadingLevel   int // 見出しのレベル
}

func ParseMarkdown(markdown string) []Node {
	lines := strings.Split(markdown, "\n")
	var nodes []Node
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

				nodes = append(nodes, Node{Type: Paragraph, Text: strings.TrimSpace(text), NestSpaceCount: nestSpaceCount})
				currentParagraph = nil
			}
			nodes = append(nodes, Node{Type: Blank})
			continue
		}

		if strings.HasPrefix(trimmedLine, "#") {
			nodes = append(nodes, parseHeading(trimmedLine))
		} else if strings.HasPrefix(trimmedLine, "- ") {
			nodes = append(nodes, parseItem(line))
		} else if matched, _ := regexp.MatchString(`^\d+\.\s`, trimmedLine); matched {
			nodes = append(nodes, parseOrderedItem(line))
		} else if strings.HasPrefix(trimmedLine, "```") {
			codeBlock, delta := parseCodeBlock(lines[i:])
			nodes = append(nodes, codeBlock)
			i += delta
		} else if strings.HasPrefix(trimmedLine, "!") {
			nodes = append(nodes, parseImage(trimmedLine))
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
				nodes = append(nodes, tableNode)
				tableParts = nil
			}
		} else {
			currentParagraph = append(currentParagraph, line)
		}
	}

	if len(currentParagraph) > 0 {
		nodes = append(nodes, Node{Type: Paragraph, Text: strings.Join(currentParagraph, " ")})
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

func (n NodeType) String() string {
	switch n {
	case Heading:
		return "Heading"
	case Paragraph:
		return "Paragraph"
	case Item:
		return "Item"
	case OrderedItem:
		return "OrderedItem"
	case CodeBlock:
		return "CodeBlock"
	case Image:
		return "Image"
	case Table:
		return "Table"
	case Blank:
		return "Blank"
	case Other:
		return "Other"
	default:
		return "Unknown"
	}
}

func (n Node) String() string {
	return fmt.Sprintf("{Type:%s Text:%s NestSpaceCount:%d HeadingLevel:%d}", n.Type, n.Text, n.NestSpaceCount, n.HeadingLevel)
}

func NodesToMarkdown(nodes []Node) string {
	var markdown strings.Builder

	for _, node := range nodes {
		switch node.Type {
		case Heading:
			markdown.WriteString(strings.Repeat(" ", node.NestSpaceCount) + strings.Repeat("#", node.HeadingLevel) + " " + node.Text + "\n")
		case Paragraph:
			markdown.WriteString(strings.Repeat(" ", node.NestSpaceCount) + node.Text + "\n")
		case Item:
			markdown.WriteString(strings.Repeat(" ", node.NestSpaceCount) + "- " + node.Text + "\n")
		case OrderedItem:
			orderNum := strconv.Itoa(node.OrderedItemNum)
			markdown.WriteString(strings.Repeat(" ", node.NestSpaceCount) + orderNum + ". " + node.Text + "\n")
		case CodeBlock:
			markdown.WriteString(strings.Repeat(" ", node.NestSpaceCount) + "```\n" + node.Text + "\n" + strings.Repeat(" ", node.NestSpaceCount) + "```\n")
		case Image:
			markdown.WriteString(strings.Repeat(" ", node.NestSpaceCount) + node.Text + "\n")
		case Table:
			markdown.WriteString(strings.Repeat(" ", node.NestSpaceCount) + node.Text + "\n")
		case Blank:
			markdown.WriteString("\n")
		}
	}

	return strings.TrimSuffix(markdown.String(), "\n")
}
