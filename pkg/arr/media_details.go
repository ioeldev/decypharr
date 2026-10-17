package arr

import (
	"context"
	"fmt"
	"net/http"
)

// MediaDetails contains display metadata only; it never authorizes a repair.
type MediaDetails struct {
	ID       int            `json:"id"`
	Title    string         `json:"title"`
	Episodes []MediaEpisode `json:"episodes,omitempty"`
}

type MediaEpisode struct {
	ID            int `json:"id"`
	SeasonNumber  int `json:"seasonNumber"`
	EpisodeNumber int `json:"episodeNumber"`
}

// MediaDisplayDetails works even after a job has removed the old episode file.
func (s *Service) MediaDisplayDetails(ctx context.Context, name, fingerprint string, id int) (MediaDetails, error) {
	instance, err := s.instance(name)
	if err != nil {
		return MediaDetails{}, err
	}
	if id <= 0 || (fingerprint != "" && instance.Fingerprint() != fingerprint) {
		return MediaDetails{}, fmt.Errorf("invalid or outdated media identity")
	}
	resource := "movie"
	if instance.Type == Sonarr {
		resource = "series"
	} else if instance.Type != Radarr {
		return MediaDetails{}, ErrUnsupportedType
	}
	var media MediaDetails
	resp, err := s.get(ctx, instance, fmt.Sprintf("api/v3/%s/%d", resource, id), &media)
	if err != nil {
		return MediaDetails{}, err
	}
	if err = expectStatus(resp, http.StatusOK); err != nil {
		return MediaDetails{}, err
	}
	if media.ID != id || media.Title == "" {
		return MediaDetails{}, fmt.Errorf("Arr returned no matching media title")
	}
	media.Episodes = nil
	if instance.Type == Sonarr {
		resp, err = s.getDecoded(ctx, instance, fmt.Sprintf("api/v3/episode?seriesId=%d", id), arrayResponseDecoder(func(episode MediaEpisode) error {
			if episode.ID > 0 {
				media.Episodes = append(media.Episodes, episode)
			}
			return nil
		}))
		if err != nil {
			return MediaDetails{}, err
		}
		if err = expectStatus(resp, http.StatusOK); err != nil {
			return MediaDetails{}, err
		}
	}
	return media, nil
}
