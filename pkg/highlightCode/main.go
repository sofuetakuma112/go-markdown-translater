package highlightCode

import (
	"bytes"
	"io/ioutil"
	"os"
	"os/exec"
)

func HighlightCode(code string) (string, error) {
    file, err := ioutil.TempFile("", "code-")
    if err != nil {
        return "", err
    }
    defer os.Remove(file.Name())

    _, err = file.WriteString(code)
    if err != nil {
        return "", err
    }

    cmd := exec.Command("python3", "highlight_auto.py", file.Name())
    var stdout bytes.Buffer
    cmd.Stdout = &stdout

    if err := cmd.Run(); err != nil {
        return "", err
    }

    // ファイルを読み込む
    content, err := ioutil.ReadFile(file.Name())
    if err != nil {
        return "", err
    }

    lang := string(content)

    return lang, nil
}