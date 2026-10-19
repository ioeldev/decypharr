package config

import (
	"testing"
	"time"
)

func TestRepairQueuePolicyDefaultsAndValidation(t *testing.T) {
	p, err := (RepairConfig{}).QueuePolicy()
	if err != nil || p.Interval != 10*time.Second || p.BatchSize != 50 || p.BatchPause != 5*time.Minute || p.MaxActive != 10 || p.Paused || p.SearchWorkers != 3 {
		t.Fatalf("defaults: %+v %v", p, err)
	}
	for _, c := range []RepairConfig{{QueueInterval: "0s"}, {QueueInterval: "-1s"}, {QueueInterval: "nonsense"}, {QueueInterval: "25h"}, {QueueBatchPause: "-1m"}, {QueueBatchSize: -1}, {QueueMaxActive: -1}, {QueueSearchWorkers: -1}, {QueueSearchWorkers: 11}} {
		if _, err := c.QueuePolicy(); err == nil {
			t.Fatalf("invalid queue settings accepted: %+v", c)
		}
	}
	c := RepairConfig{QueueInterval: "500ms", QueueBatchSize: 25, QueueBatchPause: "0s", QueueMaxActive: 3, QueueSearchWorkers: 2, QueuePaused: true}
	p, err = c.QueuePolicy()
	if err != nil || p.Interval != 500*time.Millisecond || p.BatchSize != 25 || p.BatchPause != 0 || p.MaxActive != 3 || p.SearchWorkers != 2 || !p.Paused || c.IsZero() {
		t.Fatalf("explicit settings lost: %+v %v", p, err)
	}
}

func TestRecoveryTimingValidation(t *testing.T) {
	p, err := (RepairConfig{}).QueuePolicy()
	if err != nil || p.SearchTimeout != 5*time.Minute || p.SearchGrace != 2*time.Minute || len(p.RetryDelays) != 3 || p.RetryDelays[2] != 72*time.Hour {
		t.Fatalf("defaults: %+v %v", p, err)
	}
	for _, r := range []RepairConfig{{QueueSearchTimeout: "0s"}, {QueueSearchGrace: "25h"}, {QueueRetryDelays: "6h,bad"}, {QueueRetryDelays: "30s"}, {QueueRetryDelays: "169h"}} {
		if _, err := r.QueuePolicy(); err == nil {
			t.Fatalf("accepted %+v", r)
		}
	}
	p, err = (RepairConfig{QueueSearchTimeout: "3m", QueueSearchGrace: "30s", QueueRetryDelays: "1h, 12h"}).QueuePolicy()
	if err != nil || len(p.RetryDelays) != 2 || p.RetryDelays[1] != 12*time.Hour {
		t.Fatalf("configured: %+v %v", p, err)
	}
}
