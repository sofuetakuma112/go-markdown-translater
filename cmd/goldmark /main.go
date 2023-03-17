package main

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

// 翻訳をシミュレートするための簡単な関数
func translate(text string) string {
	return strings.ToUpper(text)
}

func main() {
	source := `
# Title

## Subtitle

Some **bold** and *italic* text.

` + "```go\n" + `fmt.Println("Hello, world!")` + "```\n" + `
![Image description](image_url.jpg)
`

	md := goldmark.New()
	var buf bytes.Buffer
	err := md.Convert([]byte(source), &buf)
	if err != nil {
		panic(err)
	}

	reader := text.NewReader(buf.Bytes())
	doc := md.Parser().Parse(reader)
	var output bytes.Buffer
	ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		defer func() {
			err := recover()
			if err != nil {
				fmt.Println("Recover!:", err)
			}
		}()

		if entering {
			switch v := n.(type) {
			case *ast.Text:
				fmt.Printf("*ast.Text: %v\n", v)
				if v.Parent().Kind() != ast.KindCodeBlock && v.Parent().Kind() != ast.KindImage && v.Parent().Kind() != ast.KindLink {
					translated := translate(string(v.Segment.Value(reader.Source())))
					output.WriteString(translated)
					return ast.WalkSkipChildren, nil
				}
			case *ast.CodeBlock, *ast.Image:
				fmt.Printf("*ast.Image: %v\n", v)
				return ast.WalkSkipChildren, nil
			default:
				fmt.Printf("default: %v\n", v)
				if v.Type() != ast.TypeDocument {
					segments := v.Lines()
					len := segments.Len()
					if len != 0 {
						segment := v.Lines().At(0)
						if segment.Len() > 0 {
							raw := string(segment.Value(reader.Source()))
							output.WriteString(raw)
						}
					}

				}
			}
		}
		return ast.WalkContinue, nil
	})

	fmt.Printf("output: %v\n", output.String())
}
