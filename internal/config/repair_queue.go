package config

import (
	"fmt"
	"strings"
	"time"
)

// RepairQueuePolicy controls new automatic Arr recovery jobs. In-flight retries
// retain their mutation-reconciliation path and do not consume new batch slots.
type RepairQueuePolicy struct {
	Interval      time.Duration
	BatchSize     int
	BatchPause    time.Duration
	MaxActive     int
	SearchTimeout time.Duration
	SearchGrace   time.Duration
	RetryDelays   []time.Duration
	Paused        bool
}

func (r RepairConfig) QueuePolicy() (RepairQueuePolicy, error) {
	p := RepairQueuePolicy{Interval: 10 * time.Second, BatchSize: 50, BatchPause: 5 * time.Minute, MaxActive: 10, Paused: r.QueuePaused, SearchTimeout: 5 * time.Minute, SearchGrace: 2 * time.Minute, RetryDelays: []time.Duration{6 * time.Hour, 24 * time.Hour, 72 * time.Hour}}
	if r.QueueBatchSize < 0 || r.QueueMaxActive < 0 {
		return p, fmt.Errorf("repair queue batch size and max active must not be negative")
	}
	if r.QueueBatchSize > 0 {
		p.BatchSize = r.QueueBatchSize
	}
	if r.QueueMaxActive > 0 {
		p.MaxActive = r.QueueMaxActive
	}
	for _, item := range []struct {
		name, raw string
		dest      *time.Duration
		min       time.Duration
	}{
		{"queue_search_timeout", r.QueueSearchTimeout, &p.SearchTimeout, time.Second},
		{"queue_search_grace", r.QueueSearchGrace, &p.SearchGrace, time.Second},
		{"queue_interval", r.QueueInterval, &p.Interval, time.Millisecond},
		{"queue_batch_pause", r.QueueBatchPause, &p.BatchPause, 0},
	} {
		if item.raw == "" {
			continue
		}
		value, err := time.ParseDuration(item.raw)
		if err != nil || value < item.min || value > 24*time.Hour {
			return p, fmt.Errorf("repair.%s must be a duration between %s and 24h", item.name, item.min)
		}
		*item.dest = value
	}
	if r.QueueRetryDelays != "" {
		p.RetryDelays = nil
		for _, raw := range strings.Split(r.QueueRetryDelays, ",") {
			d, err := time.ParseDuration(strings.TrimSpace(raw))
			if err != nil || d < time.Minute || d > 7*24*time.Hour {
				return p, fmt.Errorf("queue_retry_delays must contain durations between 1m and 168h")
			}
			p.RetryDelays = append(p.RetryDelays, d)
		}
		if len(p.RetryDelays) > 10 {
			return p, fmt.Errorf("queue_retry_delays allows at most 10 retries")
		}
	}
	return p, nil
}
