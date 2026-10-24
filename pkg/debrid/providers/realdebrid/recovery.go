package realdebrid

import (
	"bytes"
	"context"
	"fmt"
	"github.com/sirrobot01/decypharr/internal/customerror"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/sirrobot01/decypharr/internal/request"
	"github.com/sirrobot01/decypharr/pkg/debrid/types"
)

// RecoveryInventory includes downloading placements and ignores the library
// sync limit. Absence in the cached library view cannot prove exclusive ownership.
func (r *RealDebrid) RecoveryInventory(ctx context.Context) ([]*types.Torrent, error) {
	var torrents []*types.Torrent
	seen := map[string]bool{}
	const pageSize = 100
	for offset := 0; ; offset += pageSize {
		endpoint := fmt.Sprintf("%s/torrents?offset=%d&limit=%d", r.Host, offset, pageSize)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		response, err := r.client.Do(req)
		if err != nil {
			return nil, err
		}
		var records []TorrentsResponse
		if response.StatusCode == http.StatusNoContent {
			request.DrainAndCloseResponse(response)
			return torrents, nil
		}
		if response.StatusCode != http.StatusOK {
			request.DrainAndCloseResponse(response)
			return nil, fmt.Errorf("recovery inventory returned %d", response.StatusCode)
		}
		err = request.DecodeJSON(response, &records)
		request.DrainAndCloseResponse(response)
		if err != nil {
			return nil, err
		}
		for _, record := range records {
			if record.Id == "" || record.Hash == "" || seen[record.Id] {
				return nil, fmt.Errorf("incomplete or unstable recovery inventory")
			}
			seen[record.Id] = true
			torrents = append(torrents, &types.Torrent{Id: record.Id, InfoHash: record.Hash, Status: getStatus(record.Status), Added: record.Added})
		}
		if len(records) < pageSize {
			return torrents, nil
		}
	}
}

func (r *RealDebrid) SubmitRecovery(ctx context.Context, torrent *types.Torrent) (*types.Torrent, error) {
	method, endpoint := http.MethodPost, "/torrents/addMagnet"
	contentType := "application/x-www-form-urlencoded"
	var body io.Reader = strings.NewReader(url.Values{"magnet": {torrent.Magnet.Link}}.Encode())
	if torrent.Magnet.IsTorrent() {
		method, endpoint, contentType = http.MethodPut, "/torrents/addTorrent", "application/x-bittorrent"
		body = bytes.NewReader(torrent.Magnet.File)
	}
	req, err := http.NewRequestWithContext(ctx, method, r.Host+endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	response, err := r.client.DoOnce(req)
	if err != nil {
		return nil, err
	}
	defer request.DrainAndCloseResponse(response)
	switch response.StatusCode {
	case 509:
		return nil, customerror.TooManyActiveDownloadsError
	case http.StatusUnavailableForLegalReasons:
		return nil, customerror.TorrentBlockedError
	case http.StatusOK, http.StatusCreated:
	default:
		return nil, fmt.Errorf("recovery submission returned %d", response.StatusCode)
	}
	var receipt AddMagnetSchema
	if err := request.DecodeJSON(response, &receipt); err != nil {
		return nil, err
	}
	if receipt.Id == "" {
		return nil, fmt.Errorf("recovery submission returned no placement")
	}
	torrent.Id, torrent.Debrid, torrent.Added = receipt.Id, r.config.Name, time.Now()
	return torrent, nil
}
