package main

import (
	"bytes"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"time"

	"golang.org/x/net/html"
)

func getMainNode(body []byte) (*html.Node, error) {
	doc, err := html.Parse(bytes.NewReader(body)) // Nodeツリー
	if err != nil {
		return nil, err
	}

	var mainNode *html.Node
	var f func(*html.Node)
	f = func(n *html.Node) {
		// 引数nのタイプがhtml.ElementNode（要素ノード）であり、
		// n.Dataが"main"（<main>タグ）であるかどうかを確認します。
		if n.Type == html.ElementNode && n.Data == "main" {
			mainNode = n
			return
		}
		// nのすべての子ノードに対して繰り返し処理を行います。
		// cには、nの最初の子ノードが割り当てられ、
		// 次のイテレーションでcにはcの次の兄弟ノードが割り当てられます。
		// これをcがnilになるまで続けます。
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(doc)

	if mainNode == nil {
		return nil, fmt.Errorf("main tag not found")
	}

	return mainNode, nil
}

func getMainContent(body []byte) (string, error) {
	mainNode, err := getMainNode(body)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	w := io.Writer(&buf)
	html.Render(w, mainNode)
	return buf.String(), nil
}

func crawlListURL(url string) []string {
	resp, err := http.Get(url)
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}

	mainNode, err := getMainNode(body)
	if err != nil {
		log.Fatal(err)
	}

	var urls []string
	var f func(*html.Node)
	f = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "a" {
			for _, a := range n.Attr {
				if a.Key == "href" {
					urls = append(urls, a.Val)
					break
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(mainNode)

	return urls
}

func saveMarkdown(url string, fileName string) {
	resp, err := http.Get(url)
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}

	// mainHtml, err := getMainContent(body)
	// if err != nil {
	// 	log.Fatal(err)
	// }

	f, err := os.Create(fmt.Sprintf("./outputs/html/%s.html", fileName))
	if err != nil {
		fmt.Println("Error creating html file:", err)
		return
	}

	_, err = f.WriteString(string(body))
	if err != nil {
		fmt.Println("Error writing to html file:", err)
		return
	}
	f.Close()

	// Get the path to the turndown.js script
	scriptPath := filepath.Join("..", "..", "html-to-md/src/index.js")

	fmt.Printf("node %s %s\n", scriptPath, f.Name())
	cmd := exec.Command("node", scriptPath, f.Name())

	err = cmd.Run()
	if err != nil {
		fmt.Println("Error running Node.js script:", err)
		return
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run main.go <url>")
		return
	}

	listURL := os.Args[1]
	urls := crawlListURL(listURL)
	time.Sleep(1 * time.Second)

	parsedURL, err := url.Parse(listURL)
	if err != nil {
		fmt.Println("Error parsing URL:", err)
		return
	}

	host := parsedURL.Scheme + "://" + parsedURL.Host
	dir, _ := path.Split(parsedURL.Path)
	hostAndFirstPathSegment := host + dir

	for i, file := range urls {
		url := hostAndFirstPathSegment + file
		fmt.Printf("Crawling URL: %s\n", url)
		saveMarkdown(url, fmt.Sprintf("output-%d", i))
		time.Sleep(1 * time.Second)
		break
	}
}
