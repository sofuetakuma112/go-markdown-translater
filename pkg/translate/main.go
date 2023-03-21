package translate

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
)

type ResGoogleTranslate struct {
	Code int    `json:"code"`
	Text string `json:"text"`
}

func Translate(text string) (string, error) {
	var res ResGoogleTranslate

	urls := [4]string{"https://script.google.com/macros/s/AKfycbwU3rp-wP0wC0rHy1uajb61bKCQGDB4TJ8HofbtU_KCB3hmjKol0-_I8ABXr9Pr_aIAOg/exec?text=%v&source=en&target=ja", "https://script.google.com/macros/s/AKfycbxXtSoPH_UDtGD-bZpWt6Gx2m3s0GyKTjO1LHCteVvMJNje5PDytKmzzTR7vRMb0Nmm/exec?text=%v&source=en&target=ja", "https://script.google.com/macros/s/AKfycbyQAvp99EoatfQYZ3pBQDpLr4TWazEUzyNFAiNUT3osWD388S27hHaPx0sjuNe7nZON0A/exec?text=%v&source=en&target=ja", "https://script.google.com/macros/s/AKfycbwPd2RT9cOHksOSodK9R-ERoqGWgwBntLFOKhZtMEk5AcAlI6J0uCOlJ2gCcxQ9MhpKrA/exec?text=%v&source=en&target=ja"}
	for _, urlFormatStr := range urls {
		url := fmt.Sprintf(urlFormatStr, url.QueryEscape(text))

		for i := 0; i < 10; i++ {
			resp, err := http.Get(url)
			if err != nil {
				panic(err)
			}

			defer resp.Body.Close()

			byteArray, _ := ioutil.ReadAll(resp.Body)

			json.Unmarshal(byteArray, &res)

			if res.Code == 200 {
				return res.Text, nil
			}
		}
	}
	return "", errors.New("翻訳に失敗")
}
