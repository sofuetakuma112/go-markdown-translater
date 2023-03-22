package translate

type Item struct {
	SourceText     string `json:"sourceText"`
	TranslatedText string `json:"translatedText"`
	FormattedText  string `json:"formattedText"`
}