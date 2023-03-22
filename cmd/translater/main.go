package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/cheggaaa/pb/v3"
	"github.com/mattn/go-sqlite3"
	_ "github.com/mattn/go-sqlite3"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/gpt35"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/gpt35/generator"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/parser"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/textprocesser"

	// "github.com/sofuetakuma112/go-markdown-translater/pkg/translate"
	"github.com/joho/godotenv"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

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
		formatted_text TEXT
	)`)
	if err != nil {
		panic(err)
	}

	// GPT3.5クライアントの初期化
	// APIキーを環境変数から取得
	openaiApiKey := os.Getenv("OPENAI_API_KEY")
	if openaiApiKey == "" {
		fmt.Println("OPENAI_API_KEY environment variable is not set")
		return
	}

	c := gpt35.NewClient(openaiApiKey)

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

			row := db.QueryRow("SELECT formatted_text FROM translations WHERE source_text = ?", sourceText)
			var formattedText string
			err := row.Scan(&formattedText)

			if err == sql.ErrNoRows {
				// translatedText, err = translate.Translate(sourceText)
				// if err != nil {
				// 	log.Fatal(err)
				// }

				gptInputStr, err := generator.GenerateGptInputString(node.Text)
				if err != nil {
					log.Fatal(err)
				}

				req := &gpt35.Request{
					Model: gpt35.ModelGpt35Turbo,
					Messages: []*gpt35.Message{
						{
							Role:    gpt35.RoleUser,
							Content: gptInputStr,
						},
					},
				}

				resp, err := c.GetChat(req)
				if err != nil {
					panic(err)
				}

				translatedText := resp.Choices[0].Message.Content
				formattedText := strings.TrimLeft(translatedText, "\n")

				node.TranslatedText = formattedText

				_, err = db.Exec("INSERT INTO translations (source_text, translated_text, formatted_text) VALUES (?, ?, ?)", sourceText, translatedText, formattedText)
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
				node.TranslatedText = formattedText
			}

			progressBar.Increment()
		}()
	}

	wg.Wait()

	// プログレスバーを終了
	progressBar.Finish()

	translatedMarkdown := parser.NodesToMarkdown(nodes)
	ioutil.WriteFile(filepath.Dir(filePath)+"/translated.md", []byte(translatedMarkdown), 0644)
}
