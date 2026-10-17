package arr

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// MediaURL resolves the real Arr slug on demand; the browser URL may differ
// from the Docker/API hostname. Never forward authentication in the redirect.
func (s *Service) MediaURL(ctx context.Context, name string, id int) (string, error) {
	instance, err := s.instance(name)
	if err != nil {
		return "", err
	}
	if id <= 0 {
		return "", fmt.Errorf("invalid media ID")
	}
	resource := "movie"
	if instance.Type == Sonarr {
		resource = "series"
	} else if instance.Type != Radarr {
		return "", ErrUnsupportedType
	}
	var media struct {
		ID        int    `json:"id"`
		TitleSlug string `json:"titleSlug"`
	}
	resp, err := s.get(ctx, instance, fmt.Sprintf("api/v3/%s/%d", resource, id), &media)
	if err != nil {
		return "", err
	}
	if err = expectStatus(resp, http.StatusOK); err != nil {
		return "", err
	}
	if media.ID != id || media.TitleSlug == "" || strings.ContainsAny(media.TitleSlug, "/\\?#") {
		return "", fmt.Errorf("Arr returned no usable media slug")
	}
	base := instance.BrowserURL
	if base == "" {
		base = instance.Host
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return "", fmt.Errorf("configure an HTTP(S) Browser URL for this Arr")
	}
	parsed.User = nil
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.RawPath = ""
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/" + resource + "/" + media.TitleSlug
	return parsed.String(), nil
}
