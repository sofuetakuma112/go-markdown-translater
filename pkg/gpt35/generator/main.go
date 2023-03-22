package generator

import (
	"bytes"
	"text/template"
)

type Data struct {
	Text string
}

func GenerateGptInputString(text string) (string, error) {
	data := Data{
		Text: text,
	}

	templatePath := "templates/translate.txt"
	tmpl, err := template.ParseFiles(templatePath)
	if err != nil {
		return "", err
	}

	buf := []byte{}
	outputData := bytes.NewBuffer(buf)
	err = tmpl.Execute(outputData, data)
	if err != nil {
		return "", err
	}

	return outputData.String(), nil
}
