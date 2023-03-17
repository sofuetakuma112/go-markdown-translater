package main

import (
	"github.com/gomarkdown/markdown"
	"github.com/gomarkdown/markdown/ast"
	"github.com/gomarkdown/markdown/html"
	"github.com/gomarkdown/markdown/parser"

	"fmt"
	"os"
)

var mdStr = `
# header

Sample text.

[link](http://example.com)
`

func main() {
	md := []byte(mdStr)
	// always normalize newlines, this library only supports Unix LF newlines
	md = markdown.NormalizeNewlines(md)

	// create markdown parser
	extensions := parser.CommonExtensions | parser.AutoHeadingIDs
	p := parser.NewWithExtensions(extensions)

	// parse markdown into AST tree
	doc := p.Parse(md)

	// optional: see AST tree
	if true {
		fmt.Printf("%s", "--- AST tree:\n")
		ast.Print(os.Stdout, doc)
	}

	// create HTML renderer
	htmlFlags := html.CommonFlags | html.HrefTargetBlank
	opts := html.RendererOptions{Flags: htmlFlags}
	renderer := html.NewRenderer(opts)

	html := markdown.Render(doc, renderer)

	fmt.Printf("\n--- Markdown:\n%s\n\n--- HTML:\n%s\n", md, html)
}
