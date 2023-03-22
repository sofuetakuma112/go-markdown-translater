package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/gpt35"
	"github.com/sofuetakuma112/go-markdown-translater/pkg/gpt35/generator"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	openaiApiKey := os.Getenv("OPENAI_API_KEY")
	if openaiApiKey == "" {
		fmt.Println("OPENAI_API_KEY environment variable is not set")
		return
	}

	c := gpt35.NewClient(openaiApiKey)

	gptInputStr, err := generator.GenerateGptInputString(`The idea behind this book is to help you _learn by doing_. Together we’ll walk through the start-to-finish build of a web application — from structuring your workspace, through to session management, authenticating users, securing your server and testing your application.`)
	if err != nil {
		log.Fatal(err)
	}

	req := &gpt35.Request{
		Model: gpt35.ModelGpt35Turbo,
		Messages: []*gpt35.Message{
			// {
			// 	Role:    gpt35.RoleSystem,
			// 	Content: "あなたは、英語で書かれたマークダウンテキストから日本語のマークダウンテキストに翻訳してくれる親切なアシスタントです。",
			// },
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

	if resp.Error != nil {
		fmt.Printf("%v\n", resp.Error)
		return
	}

	content := resp.Choices[0].Message.Content

	println(strings.TrimLeft(content, "\n"))
	// println(resp.Usage.PromptTokens)
	// println(resp.Usage.CompletionTokens)
	// println(resp.Usage.TotalTokens)
}
