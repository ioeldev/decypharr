package realdebrid

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/internal/request"
)

func TestRecoveryInventoryIncludesActiveDownloadsDespiteLibraryLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"id":"active","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"downloading"},{"id":"cached","hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","status":"downloaded"}]`)
	}))
	defer server.Close()
	provider := &RealDebrid{Host: server.URL, config: config.Debrid{Limit: 1}, client: request.New(request.WithMaxRetries(0))}
	torrents, err := provider.RecoveryInventory(t.Context())
	if err != nil || len(torrents) != 2 || torrents[0].Id != "active" {
		t.Fatalf("inventory=%+v err=%v", torrents, err)
	}
}
