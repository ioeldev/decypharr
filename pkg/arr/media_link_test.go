package arr

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMediaURLUsesArrSlugAndBrowserBaseWithoutCredentials(t *testing.T) {
	for _, kind := range []Type{Sonarr, Radarr} {
		t.Run(string(kind), func(t *testing.T) {
			resource := "movie"
			if kind == Sonarr {
				resource = "series"
			}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/v3/"+resource+"/9" || r.Method != "GET" {
					t.Errorf("unexpected request %s %s", r.Method, r.URL)
				}
				fmt.Fprint(w, `{"id":9,"titleSlug":"a-title-2026"}`)
			}))
			defer server.Close()
			s := testService(Arr{Host: server.URL, Type: kind, Token: "secret", BrowserURL: "https://user:password@media.example/arr/?apikey=secret#fragment"})
			got, err := s.MediaURL(t.Context(), "arr", 9)
			want := "https://media.example/arr/" + resource + "/a-title-2026"
			if err != nil || got != want {
				t.Fatalf("URL=%q want=%q error=%v", got, want, err)
			}
		})
	}
}
