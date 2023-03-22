package main

import (
	"database/sql"
	"encoding/json"
	_ "github.com/mattn/go-sqlite3"
	"log"
	"os"
)

type Data struct {
	SourceText   string    `json:"sourceText"`
	TranslatedText string `json:"translatedText"`
	FormattedText  string    `json:"formattedText"`
}

func main() {
	db, err := sql.Open("sqlite3", "./translations.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT source_text, translated_text, formatted_text FROM translations")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	var data []Data

	for rows.Next() {
		var d Data
		err = rows.Scan(&d.SourceText, &d.TranslatedText, &d.FormattedText)
		if err != nil {
			log.Fatal(err)
		}
		data = append(data, d)
	}

	err = rows.Err()
	if err != nil {
		log.Fatal(err)
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		log.Fatal(err)
	}
	jsonFile, err := os.Create("db_dump.json")
	if err != nil {
		log.Fatal(err)
	}
	defer jsonFile.Close()

	_, err = jsonFile.Write(jsonData)
	if err != nil {
		log.Fatal(err)
	}
}
