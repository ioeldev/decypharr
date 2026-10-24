package arr

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/sirrobot01/decypharr/internal/request"
	"github.com/sirrobot01/decypharr/internal/utils"
)

// ErrReleaseNotCached means the download client explicitly refused the release.
// It must never be inferred from a timeout, an empty history, or a generic 5xx.
var ErrReleaseNotCached = errors.New("release rejected by download client: torrent not cached")

const maxReleaseErrorBytes = 64 * 1024

func (s *Service) submitRelease(ctx context.Context, instance Arr, release Release) error {
	if ctx == nil {
		ctx = context.Background()
	}
	endpoint, err := utils.JoinURL(instance.Host, "api/v3/release")
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(release.Payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Key", instance.Token)
	// Preserve error responses even for 5xx; retryablehttp otherwise discards them
	// after its zero-retry budget, turning a definite cache miss into uncertainty.
	resp, err := s.releaseGrab.Do(req)
	if err != nil {
		return UnknownMutationOutcome(fmt.Errorf("grab release %q: %w", release.Title, err), 0)
	}
	defer request.DrainAndCloseResponse(resp)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxReleaseErrorBytes+1))
	if readErr == nil && len(body) <= maxReleaseErrorBytes && isCacheRejection(body) {
		return &CacheRejectionError{InfoHash: cacheRejectionHash(body)}
	}
	failure := fmt.Errorf("grab release %q: arr returned %s", release.Title, resp.Status)
	if readErr != nil || resp.StatusCode >= 500 || resp.StatusCode == http.StatusRequestTimeout {
		return UnknownMutationOutcome(failure, 0)
	}
	return failure
}

func isCacheRejection(body []byte) bool {
	var response struct {
		Code        string `json:"code"`
		Error       string `json:"error"`
		Description string `json:"description"`
	}
	if json.Unmarshal(body, &response) != nil {
		return false
	}
	if response.Code == "torrent_not_cached" {
		return true
	}
	// Sonarr/Radarr wrap the structured qBittorrent error in their exception
	// description. Do not match titles, a generic connection error, or message text.
	description := response.Description
	if !strings.Contains(description, "DownloadClientException") || !strings.Contains(description, "QBittorrent") {
		return false
	}
	for offset := 0; offset < len(description); offset++ {
		if description[offset] != '{' {
			continue
		}
		var rejection struct {
			Code  string `json:"code"`
			Error string `json:"error"`
		}
		if json.NewDecoder(strings.NewReader(description[offset:])).Decode(&rejection) == nil &&
			rejection.Code == "torrent_not_cached" && strings.HasSuffix(rejection.Error, "torrent not cached") {
			return true
		}
	}
	return false
}

// CacheRejectionError preserves a verified rejection even when its identity is
// unavailable. Only an unambiguous hash can authorize uncached recovery.
type CacheRejectionError struct{ InfoHash string }

func (e *CacheRejectionError) Error() string { return ErrReleaseNotCached.Error() }
func (e *CacheRejectionError) Unwrap() error { return ErrReleaseNotCached }

func NormalizeInfoHash(hash string) string {
	hash = strings.ToLower(strings.TrimSpace(hash))
	if len(hash) != 40 {
		return ""
	}
	if _, err := hex.DecodeString(hash); err != nil {
		return ""
	}
	return hash
}

func cacheRejectionHash(body []byte) string {
	var response struct {
		Code        string `json:"code"`
		InfoHash    string `json:"infoHash"`
		Description string `json:"description"`
	}
	if json.Unmarshal(body, &response) != nil {
		return ""
	}
	if response.Code == "torrent_not_cached" {
		return NormalizeInfoHash(response.InfoHash)
	}
	if !isCacheRejection(body) {
		return ""
	}
	hash := ""
	for offset := 0; offset < len(response.Description); offset++ {
		if response.Description[offset] != '{' {
			continue
		}
		var rejection struct {
			Code     string `json:"code"`
			InfoHash string `json:"infoHash"`
			Error    string `json:"error"`
		}
		if json.NewDecoder(strings.NewReader(response.Description[offset:])).Decode(&rejection) != nil || rejection.Code != "torrent_not_cached" {
			continue
		}
		identity := NormalizeInfoHash(rejection.InfoHash)
		if identity == "" || (hash != "" && identity != hash) {
			return ""
		}
		hash = identity
	}
	return hash
}
