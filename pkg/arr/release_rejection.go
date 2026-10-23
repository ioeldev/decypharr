package arr

import (
	"bytes"
	"context"
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
		return fmt.Errorf("grab release %q: %w", release.Title, ErrReleaseNotCached)
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
