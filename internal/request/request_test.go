package request

import (
	"net/http"
	"testing"
	"time"
)

func TestResponseHeaderTimeoutCanFollowSearchContext(t *testing.T) {
	regular := New(WithMaxRetries(0))
	search := New(WithMaxRetries(0), WithResponseHeaderTimeout(0))
	if regular.httpClient.Transport.(*http.Transport).ResponseHeaderTimeout != 30*time.Second {
		t.Fatal("changed regular client deadline")
	}
	if search.httpClient.Transport.(*http.Transport).ResponseHeaderTimeout != 0 {
		t.Fatal("search still cuts responses after thirty seconds")
	}
}
