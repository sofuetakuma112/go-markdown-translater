package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"strings"

	"github.com/gomarkdown/markdown"
	"github.com/gomarkdown/markdown/ast"
	"github.com/gomarkdown/markdown/html"
	"github.com/gomarkdown/markdown/parser"
)

// 翻訳をシミュレートするための簡単な関数
func translate(text string) string {
	return strings.ToUpper(text)
}

func main() {
	filePath := "sample.md"

	// ファイルを読み込む
	content, err := ioutil.ReadFile(filePath)
	if err != nil {
		log.Fatalf("Error reading file: %v", err)
	}

	source := string(content)

	md := []byte(source)
	// always normalize newlines, this library only supports Unix LF newlines
	md = markdown.NormalizeNewlines(md)

	// create markdown parser
	extensions := parser.CommonExtensions | parser.AutoHeadingIDs
	p := parser.NewWithExtensions(extensions)

	// parse markdown into AST tree
	doc := p.Parse(md)

	ast.WalkFunc(doc, func(node ast.Node, entering bool) ast.WalkStatus {
		if entering {
			switch v := node.(type) {
			case *ast.Text:
				parent := v.GetParent()
				switch parent := parent.(type) {
				case *ast.Paragraph:
					fmt.Printf("paragraph: %s, content: %s\n", string(v.Literal), string(v.Content))
				case *ast.Emph:
					fmt.Printf("italic (emphasized): %s\n", string(v.Literal))
				case *ast.Strong:
					fmt.Printf("bold (strong): %s\n", string(v.Literal))
				case *ast.ListItem:
					fmt.Printf("list item: %s\n", string(v.Literal))
				case *ast.Link:
					fmt.Printf("link: %s\n", string(v.Literal))
				case *ast.Heading:
					fmt.Printf("heading: %s\n", string(v.Literal))
				default:
					fmt.Printf("another element: %T\n", parent)
				}

				if _, isCodeBlock := parent.(*ast.CodeBlock); !isCodeBlock {
					// 翻訳対象となるテキスト
					if _, isImage := parent.(*ast.Image); !isImage {
						translated := translate(string(v.Literal))
						v.Literal = []byte(translated)
					}
				}
			case *ast.CodeBlock, *ast.Image:
				return ast.SkipChildren
			}
		}
		return ast.GoToNext
	})

	if false {
		fmt.Printf("%s", "--- AST tree:\n")
		ast.Print(os.Stdout, doc)
	}

	// create HTML renderer
	htmlFlags := html.CommonFlags | html.HrefTargetBlank
	opts := html.RendererOptions{Flags: htmlFlags}
	renderer := html.NewRenderer(opts)

	markdown.Render(doc, renderer)

	// fmt.Printf("\n--- Markdown:\n%s\n\n--- HTML:\n%s\n", md, html)
}
