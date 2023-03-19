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
)

type ExchangeRates struct {
	Rates struct {
		JPY float64 `json:"JPY"`
	} `json:"rates"`
}

func tokenCountToUSD(tokenCounts int) float64 {
	return (float64(tokenCounts) / 1000.0) * 0.002
}

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	if len(os.Args) != 2 {
		fmt.Println("Usage: counttext <input-file>")
		os.Exit(1)
	}

	inputFile := os.Args[1]

	count, codePoints, err := countText(inputFile)
	if err != nil {
		fmt.Println("Error counting text:", err)
		os.Exit(1)
	}

	fmt.Printf("Text count (excluding images and code blocks): %d\n", count)
	fmt.Printf("Unicode code points count (excluding images and code blocks): %d\n", codePoints)

	usd := tokenCountToUSD(codePoints)
	yen, err := USDToJPY(usd)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("翻訳にかかる料金: %v円\n", int(yen))
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
