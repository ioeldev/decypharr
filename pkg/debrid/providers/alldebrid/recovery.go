package alldebrid

import (
	"bytes"
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/sirrobot01/decypharr/internal/customerror"
	"github.com/sirrobot01/decypharr/internal/request"
	"github.com/sirrobot01/decypharr/pkg/debrid/types"
)

type recoveryUpload struct {
	ID    int            `json:"id"`
	Hash  string         `json:"hash"`
	Error *errorResponse `json:"error"`
}

// Use an unfiltered snapshot, never the ready-only library or live-mode deltas.
func (ad *AllDebrid) RecoveryInventory(ctx context.Context) ([]*types.Torrent, error) {
	var result TorrentInfoResponse
	response, err := ad.doRequest(ctx, ad.client, "/magnet/status", nil, &result)
	if err != nil {
		return nil, err
	}
	if err := validateAllDebridResponse(response, result.Status, result.Error); err != nil {
		return nil, err
	}
	if result.Data.Magnets == nil {
		return nil, fmt.Errorf("AllDebrid recovery inventory is missing")
	}

	torrents := make([]*types.Torrent, 0, len(result.Data.Magnets))
	seen := make(map[int]bool)
	for _, magnet := range result.Data.Magnets {
		if magnet.Id <= 0 || magnet.Hash == "" || seen[magnet.Id] {
			return nil, fmt.Errorf("AllDebrid recovery inventory has missing or duplicate identities")
		}
		seen[magnet.Id] = true
		torrents = append(torrents, &types.Torrent{Id: strconv.Itoa(magnet.Id), InfoHash: magnet.Hash, Status: getAlldebridStatus(magnet.StatusCode)})
	}
	return torrents, nil
}

func (ad *AllDebrid) SubmitRecovery(ctx context.Context, torrent *types.Torrent) (*types.Torrent, error) {
	if torrent == nil || torrent.Magnet == nil || torrent.InfoHash == "" {
		return nil, fmt.Errorf("AllDebrid recovery requires a torrent identity")
	}
	submission, err := ad.recoverySubmissionRequest(ctx, torrent)
	if err != nil {
		return nil, err
	}
	response, err := ad.client.DoOnce(submission)
	if err != nil {
		return nil, err
	}
	defer request.DrainAndCloseResponse(response)

	var receipt struct {
		Status string         `json:"status"`
		Error  *errorResponse `json:"error"`
		Data   struct {
			Magnets []recoveryUpload `json:"magnets"`
			Files   []recoveryUpload `json:"files"`
		} `json:"data"`
	}
	if err := request.DecodeJSON(response, &receipt); err != nil {
		return nil, err
	}
	if err := validateAllDebridResponse(response, receipt.Status, receipt.Error); err != nil {
		return nil, err
	}
	placements := receipt.Data.Magnets
	if torrent.Magnet.IsTorrent() {
		placements = receipt.Data.Files
	}
	if len(placements) != 1 {
		return nil, fmt.Errorf("AllDebrid recovery returned ambiguous placements")
	}
	placement := placements[0]
	if placement.Error != nil {
		return nil, recoveryAPIError(placement.Error)
	}
	if placement.ID <= 0 || !strings.EqualFold(placement.Hash, torrent.InfoHash) {
		return nil, fmt.Errorf("AllDebrid recovery returned a missing or mismatched identity")
	}
	torrent.Id = strconv.Itoa(placement.ID)
	torrent.Debrid = ad.config.Name
	torrent.Added = time.Now()
	return torrent, nil
}

// Unlike CheckStatus, observation must never restart a no-peer download.
func (ad *AllDebrid) CheckRecoveryStatus(torrent *types.Torrent) (*types.Torrent, error) {
	observed, err := ad.getTorrent(torrent.Id, true)
	if err != nil {
		return nil, err
	}
	observed.DownloadUncached = true
	return observed, nil
}

func (ad *AllDebrid) recoverySubmissionRequest(ctx context.Context, torrent *types.Torrent) (*http.Request, error) {
	endpoint := "/magnet/upload"
	contentType := "application/x-www-form-urlencoded"
	body := bytes.NewBufferString(url.Values{"magnets[]": {torrent.Magnet.Link}}.Encode())
	if torrent.Magnet.IsTorrent() {
		endpoint = "/magnet/upload/file"
		body = &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("files[]", "recovery.torrent")
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(torrent.Magnet.File); err != nil {
			return nil, err
		}
		if err := writer.Close(); err != nil {
			return nil, err
		}
		contentType = writer.FormDataContentType()
	}
	submission, err := http.NewRequestWithContext(ctx, http.MethodPost, ad.recoveryV4Endpoint(endpoint), body)
	if err != nil {
		return nil, err
	}
	submission.Header.Set("Content-Type", contentType)
	return submission, nil
}

func (ad *AllDebrid) recoveryV4Endpoint(endpoint string) string {
	host := strings.TrimSuffix(ad.Host, "/")
	if prefix, found := strings.CutSuffix(host, "/v4.1"); found {
		return prefix + "/v4" + endpoint
	}
	return host + endpoint
}

func validateAllDebridResponse(response *http.Response, status string, apiError *errorResponse) error {
	if apiError != nil {
		return recoveryAPIError(apiError)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || status != "success" {
		return fmt.Errorf("AllDebrid recovery returned HTTP %d, status %q", response.StatusCode, status)
	}
	return nil
}

func recoveryAPIError(apiError *errorResponse) error {
	if apiError.Code == "MAGNET_TOO_MANY_ACTIVE" || apiError.Code == "MAGNET_TOO_MANY" {
		return fmt.Errorf("AllDebrid %s: %w", apiError.Code, customerror.TooManyActiveDownloadsError)
	}
	return fmt.Errorf("AllDebrid recovery error: %s", apiError.Code)
}

func (ad *AllDebrid) loadTorrentFiles(torrent *types.Torrent) error {
	form := url.Values{"id[]": {torrent.Id}}
	submission, err := http.NewRequest(http.MethodPost, ad.recoveryV4Endpoint("/magnet/files"), strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	submission.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	var result TorrentInfoResponse
	response, err := ad.client.DoJSON(submission, &result)
	if err != nil {
		return err
	}
	if err := validateAllDebridResponse(response, result.Status, result.Error); err != nil {
		return err
	}
	magnet, err := findMagnet(result.Data.Magnets, torrent.Id)
	if err != nil {
		return err
	}
	index := -1
	torrent.Files = ad.flattenFiles(torrent.Id, magnet.Files, "", &index)
	if len(torrent.Files) == 0 {
		return fmt.Errorf("AllDebrid completed download has no usable files")
	}
	return nil
}
