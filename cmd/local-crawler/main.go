package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func html2markdown(filePath, outDirPath string) {
	// scriptPath := filepath.Join("..", "..", "html2markdown")
	scriptPath := "html2markdown"

	fmt.Printf("node %s %s %s\n", scriptPath, filePath, outDirPath)
	cmd := exec.Command("node", scriptPath, filePath, outDirPath)

	err := cmd.Run()
	if err != nil {
		fmt.Println("Error running Node.js script:", err)
		return
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run main.go <path>")
		os.Exit(1)
	}

	path := os.Args[1]
	err := filepath.Walk(path, func(file string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() && strings.HasSuffix(file, ".html") {
			fmt.Println("Reading:", file)

			html2markdown(file, path)
		}

		return nil
	})

	if err != nil {
		fmt.Println("Error:", err)
	}
}
