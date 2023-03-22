package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"os"

	"github.com/sofuetakuma112/go-markdown-translater/pkg/parser"
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

	translationTexts := ""
	translationTextsList := []string{}
	byteLimit := 4096
	currentSize := 0

	for i, node := range nodes {
		switch node.Type {
		case parser.Heading, parser.Paragraph, parser.Item, parser.OrderedItem, parser.Table:
			newText := fmt.Sprintf("[%d]%s\n", i, node.Text)
			newSize := len(newText)

			if currentSize+newSize > byteLimit {
				// Save the current translationTexts and reset
				translationTextsList = append(translationTextsList, translationTexts)
				translationTexts = ""
				currentSize = 0
			}

			translationTexts += newText
			currentSize += newSize
		}
	}

	// Append the last translationTexts if it's not empty
	if len(translationTexts) > 0 {
		translationTextsList = append(translationTextsList, translationTexts)
	}

	outDir := "translation-targets"
	if _, err := os.Stat(outDir); os.IsNotExist(err) {
		// Create the directory if it does not exist
		err = os.MkdirAll(outDir, 0755)
		if err != nil {
			fmt.Println("Error creating directory:", err)
			return
		}
	}

	for i, text := range translationTextsList {
		ioutil.WriteFile(outDir+fmt.Sprintf("/%d.txt", i), []byte(text), 0644)
	}
}
