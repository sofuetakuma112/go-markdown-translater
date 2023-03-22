package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

type Item struct {
	SourceText     string `json:"sourceText"`
	TranslatedText string `json:"translatedText"`
	FormattedText  string `json:"formattedText"`
}

func main() {
	// SQLiteデータベースに接続する
	db, err := sql.Open("sqlite3", "translations.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// itemsテーブルを作成する
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS translations (
		source_text TEXT PRIMARY KEY,
		translated_text TEXT,
		formatted_text TEXT
	)`)
	if err != nil {
		log.Fatal(err)
	}

	// JSONファイルを読み込む
	data, err := ioutil.ReadFile("db_modified.json")
	if err != nil {
		log.Fatal(err)
	}

	// JSONをパースしてItemのスライスを取得する
	var items []*Item
	err = json.Unmarshal(data, &items)
	if err != nil {
		log.Fatal(err)
	}

	// データベースにItemを挿入する
	for _, item := range items {
		_, err = db.Exec("INSERT INTO translations (source_text, translated_text, formatted_text) VALUES (?, ?, ?)", item.SourceText, item.TranslatedText, item.FormattedText)
		if err != nil {
			log.Fatal(err)
		}
	}

	fmt.Println("Inserted", len(items), "items into the database")
}
