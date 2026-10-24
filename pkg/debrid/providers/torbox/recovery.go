package torbox

import (
	"cmp"
	"context"
	"fmt"
	"github.com/sirrobot01/decypharr/internal/request"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/sirrobot01/decypharr/pkg/debrid/types"
)

// RecoveryInventory must include unfinished placements and reject unstable pages.
func (tb *Torbox) RecoveryInventory(ctx context.Context) ([]*types.Torrent, error) {
	var torrents []*types.Torrent
	seen := map[string]bool{}
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		page, err := tb.getTorrents(len(torrents))
		if err != nil {
			return nil, err
		}
		if len(page) == 0 {
			return torrents, nil
		}
		for _, torrent := range page {
			if torrent == nil || torrent.Id == "" || torrent.InfoHash == "" || seen[torrent.Id] {
				return nil, fmt.Errorf("incomplete or unstable recovery inventory")
			}
			seen[torrent.Id] = true
			torrents = append(torrents, torrent)
		}
	}
}

func (tb *Torbox) SubmitRecovery(ctx context.Context, torrent *types.Torrent) (*types.Torrent, error) {
	body := strings.NewReader(url.Values{"magnet": {torrent.Magnet.Link}}.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tb.Host+"/api/torrents/createtorrent", body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := tb.submissionClient().DoOnce(req)
	if err != nil {
		return nil, err
	}
	defer request.DrainAndCloseResponse(response)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("recovery submission returned %d", response.StatusCode)
	}
	var receipt AddMagnetResponse
	if err := request.DecodeJSON(response, &receipt); err != nil {
		return nil, err
	}
	if len(receipt.Data) != 1 {
		return nil, fmt.Errorf("recovery submission returned ambiguous placement")
	}
	added := receipt.Data[0]
	if added.Hash != "" && !strings.EqualFold(added.Hash, torrent.InfoHash) {
		return nil, fmt.Errorf("recovery submission returned another hash")
	}
	id := cmp.Or(added.TorrentId, added.Id)
	if id <= 0 {
		return nil, fmt.Errorf("recovery submission returned no placement")
	}
	torrent.Id, torrent.Debrid, torrent.Added = strconv.Itoa(id), tb.config.Name, time.Now()
	return torrent, nil
}
