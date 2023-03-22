package main

import (
	"fmt"
	"log"

	"github.com/sofuetakuma112/go-markdown-translater/pkg/gpt35/generator"
)

type Data struct {
	Text string
}

func main() {
	gptInputStr, err := generator.GenerateGptInputString(`| Method | Pattern | Handler | Action |
| --- | --- | --- | --- |
| ANY | / | home | Display the home page |
| ANY | /snippet/view?id=1 | snippetView | Display a specific snippet |
| POST | /snippet/create | snippetCreate | Create a new snippet |
| ANY | /static/ | http.FileServer | Serve a specific static file |`)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(gptInputStr)
}
