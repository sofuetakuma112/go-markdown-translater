package main

import (
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Println("Usage: markdownmerger <output-file> <input-directory>")
		os.Exit(1)
	}

	outputFile := os.Args[1]
	inputDir := os.Args[2]

	err := mergeMarkdownFiles(outputFile, inputDir)
	if err != nil {
		fmt.Println("Error merging markdown files:", err)
		os.Exit(1)
	}

	fmt.Println("Successfully merged markdown files into", outputFile)
}

func mergeMarkdownFiles(outputFile, inputDir string) error {
	var mergedContent strings.Builder

	err := filepath.Walk(inputDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() && strings.HasSuffix(strings.ToLower(info.Name()), ".md") {
			content, err := ioutil.ReadFile(path)
			if err != nil {
				return err
			}

			mergedContent.Write(content)
			mergedContent.WriteString("\n\n")
		}

		return nil
	})

	if err != nil {
		return err
	}

	return ioutil.WriteFile(outputFile, []byte(mergedContent.String()), 0644)
}
