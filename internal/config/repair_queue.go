package config

import (
	"fmt"
	"time"
)

// RepairQueuePolicy controls new automatic Arr recovery jobs. In-flight retries
// retain their mutation-reconciliation path and do not consume new batch slots.
type RepairQueuePolicy struct {
	Interval   time.Duration
	BatchSize  int
	BatchPause time.Duration
	MaxActive  int
	Paused     bool
}

func (r RepairConfig) QueuePolicy() (RepairQueuePolicy, error) {
	p := RepairQueuePolicy{Interval: 10 * time.Second, BatchSize: 50, BatchPause: 5 * time.Minute, MaxActive: 10, Paused: r.QueuePaused}
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
	return p, nil
}
