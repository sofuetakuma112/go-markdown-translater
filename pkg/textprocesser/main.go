package textprocesser

import "regexp"

func ContainsEnglishWords(text string) bool {
	englishWordPattern := regexp.MustCompile(`\b[a-zA-Z]+\b`)
	return englishWordPattern.MatchString(text)
}