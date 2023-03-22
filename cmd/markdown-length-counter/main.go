package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/joho/godotenv"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/parser"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

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

	codePoints := 0
	for _, node := range nodes {
		switch node.Type {
		case parser.Heading, parser.Paragraph, parser.Item, parser.OrderedItem, parser.Table:
			codePoints += len(node.Text)
		}
	}

	usdGPT35 := tokenCountToUSD(codePoints, 0.002)
	yenGPT35, err := USDToJPY(usdGPT35)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("GPT3.5を使用して翻訳にかかる料金: %v円\n", int(yenGPT35))

	usdGPT4 := tokenCountToUSD(codePoints, 0.03)
	yenGPT4, err := USDToJPY(usdGPT4)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("GPT4を使用して翻訳にかかる料金: %v円\n", int(yenGPT4))
}

type ExchangeRates struct {
	Rates struct {
		JPY float64 `json:"JPY"`
	} `json:"rates"`
}

func tokenCountToUSD(tokenCounts int, rate float64) float64 {
	return (float64(tokenCounts) / 1000.0) * rate
}

func countText(inputFile string) (int, int, error) {
	content, err := ioutil.ReadFile(inputFile)
	if err != nil {
		return 0, 0, err
	}

	markdown := string(content)

	// Remove code blocks
	codeBlockPattern := regexp.MustCompile("(?s)\\n*```.*?```\\n*")
	markdown = codeBlockPattern.ReplaceAllString(markdown, "")

	// Remove inline code
	// inlineCodePattern := regexp.MustCompile("`[^`]*`")
	// markdown = inlineCodePattern.ReplaceAllString(markdown, "")

	// Remove images
	imagePattern := regexp.MustCompile("!\\[[^\\]]*\\]\\([^\\)]+\\)")
	markdown = imagePattern.ReplaceAllString(markdown, "")

	// Count characters
	count := strings.Count(markdown, "") - 1

	// Count Unicode code points
	codePoints := utf8.RuneCountInString(markdown)

	return count, codePoints, nil
}

func USDToJPY(usd float64) (float64, error) {
	apiKey := os.Getenv("EXCHANGE_RATES_API_KEY")
	url := fmt.Sprintf("https://openexchangerates.org/api/latest.json?app_id=%s&base=USD&symbols=JPY", apiKey)

	resp, err := http.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	var exchangeRates ExchangeRates
	err = json.Unmarshal(body, &exchangeRates)
	if err != nil {
		return 0, err
	}

	return exchangeRates.Rates.JPY * usd, nil
}
