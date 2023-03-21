package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/cheggaaa/pb/v3"
	"github.com/mattn/go-sqlite3"
	_ "github.com/mattn/go-sqlite3"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/translate"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/parser"
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

	// テーブルへのコネクション作成
	db, err := sql.Open("sqlite3", "./translations.db")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	// テーブルの初期化
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS translations (
		source_text TEXT PRIMARY KEY,
		translated_text TEXT,
		is_valid BOOLEAN
	)`)
	if err != nil {
		panic(err)
	}

	targetNodes := []*Node{}
	for _, node := range nodes {
		switch node.Type {
		case Heading, Paragraph, Item, OrderedItem, Table:
			targetNodes = append(targetNodes, node)
		}
	}

	var wg sync.WaitGroup
	totalTasks := len(targetNodes)
	wg.Add(totalTasks)

	semaphore := make(chan struct{}, 10) // セマフォを作成し、最大10個のゴルーチンを同時に実行

	// プログレスバーの初期化
	progressBar := pb.StartNew(totalTasks)

	for _, node := range targetNodes {
		node := node
		sourceText := node.Text
		go func() {
			semaphore <- struct{}{} // セマフォに値を追加してゴルーチン数を増やす
			defer wg.Done()
			defer func() { <-semaphore }() // ゴルーチン終了時にセマフォから値を取り除く

			row := db.QueryRow("SELECT translated_text FROM translations WHERE source_text = ?", sourceText)
			var translatedText string
			err := row.Scan(&translatedText)

			if err == sql.ErrNoRows {
				translatedText, err = translate.Translate(sourceText)
				if err != nil {
					log.Fatal(err)
				}

				isValid := isValidMarkdown(translatedText)
				node.TranslatedText = translatedText

				_, err = db.Exec("INSERT INTO translations (source_text, translated_text, is_valid) VALUES (?, ?, ?)", sourceText, translatedText, isValid)
				if err != nil {
					var sqliteErr sqlite3.Error
					if errors.As(err, &sqliteErr) && sqliteErr.ExtendedCode == sqlite3.ErrConstraintUnique {
						// source_text列の値が重複した
						return
					} else {
						log.Fatal(fmt.Errorf("source_text: %s => translated_text: %s: %v", sourceText, translatedText, err))
					}
				}
			} else if err != nil {
				log.Fatal(err)
			} else {
				node.TranslatedText = translatedText
			}

			progressBar.Increment()
		}()
	}

	wg.Wait()

	// プログレスバーを終了
	progressBar.Finish()

	translatedMarkdown := NodesToMarkdown(nodes)
	ioutil.WriteFile(filepath.Dir(filePath)+"/translated.md", []byte(translatedMarkdown), 0644)
}

func isValidMarkdown(text string) bool {
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

func nodeToMarkdown(node *Node) string {
	prefix := strings.Repeat(" ", node.NestSpaceCount)
	text := node.Text
	if node.TranslatedText != "" {
		text = node.TranslatedText
	}

	switch node.Type {
	case Heading:
		return prefix + strings.Repeat("#", node.HeadingLevel) + " " + text + "\n"
	case Paragraph:
		return prefix + text + "\n"
	case Item:
		return prefix + "- " + text + "\n"
	case OrderedItem:
		orderNum := strconv.Itoa(node.OrderedItemNum)
		return prefix + orderNum + ". " + text + "\n"
	case CodeBlock:
		return prefix + "```\n" + text + "\n" + prefix + "```\n"
	case Image:
		return prefix + text + "\n"
	case Table:
		return prefix + text + "\n"
	case Blank:
		return "\n"
	default:
		return ""
	}
}

func NodesToMarkdown(nodes []*Node) string {
	var markdown strings.Builder

	for _, node := range nodes {
		markdown.WriteString(nodeToMarkdown(node))
	}

	return strings.TrimSuffix(markdown.String(), "\n")
}
