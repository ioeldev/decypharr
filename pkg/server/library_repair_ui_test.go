package server

import (
	"bytes"
	"strings"
	"testing"
)

func TestRecoveryPagesRenderWithRegisteredTemplatesAndVersionedAssets(t *testing.T) {
	templates, err := loadTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, page := range []string{"library-repair", "repair", "reacquire", "config"} {
		var out bytes.Buffer
		data := map[string]any{"URLBase": "/base/", "Page": page, "Title": page, "RecoveryAssetVersion": recoveryAssetVersion()}
		if err := templates.ExecuteTemplate(&out, "layout", data); err != nil {
			t.Fatalf("%s: %v", page, err)
		}
		if !strings.Contains(out.String(), "/base/assets/js/"+page+".js?v="+recoveryAssetVersion()) {
			t.Fatalf("%s asset not versioned", page)
		}
		if page == "library-repair" && !strings.Contains(out.String(), `id="libraryRows"`) {
			t.Fatal("tracking table missing")
		}
	}
}
