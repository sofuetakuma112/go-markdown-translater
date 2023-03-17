package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io/ioutil"
	"log"
	"regexp"
	"strings"
)

func main() {
	filePath := "sample.md"

	// ファイルを読み込む
	content, err := ioutil.ReadFile(filePath)
	if err != nil {
		log.Fatalf("Error reading file: %v", err)
	}

	source := string(content)

	for _, it := range parseMarkdown(source) {
		if it.Type != Other {
			fmt.Println(it.Text)
		}
	}
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
	if current.Len() > 0 {
		result = append(result, &Item{
			Type: Text,
			Text: current.String(),
		})
	}

	return result
}
