package main

import (
	"fmt"

	"github.com/sofuetakuma112/go-markdown-translater/pkg/highlightCode"
)

func main() {
	code := `// You can edit this code!
// Click here and start typing.
package main

import "fmt"

func main() {
	fmt.Println("Hello, 世界")
}`
	result, err := highlightCode.HighlightCode(code)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	fmt.Println(result)
}
