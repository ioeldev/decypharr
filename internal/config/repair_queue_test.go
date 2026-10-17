package config

import (
	"testing"
	"time"
)

func TestRepairQueuePolicyDefaultsAndValidation(t *testing.T) {
	p, err := (RepairConfig{}).QueuePolicy()
	if err != nil || p.Interval != 10*time.Second || p.BatchSize != 50 || p.BatchPause != 5*time.Minute || p.MaxActive != 10 || p.Paused {
		t.Fatalf("defaults: %+v %v", p, err)
	}
	for _, c := range []RepairConfig{{QueueInterval: "0s"}, {QueueInterval: "-1s"}, {QueueInterval: "nonsense"}, {QueueInterval: "25h"}, {QueueBatchPause: "-1m"}, {QueueBatchSize: -1}, {QueueMaxActive: -1}} {
		if _, err := c.QueuePolicy(); err == nil {
			t.Fatalf("invalid queue settings accepted: %+v", c)
		}
	}
	c := RepairConfig{QueueInterval: "500ms", QueueBatchSize: 25, QueueBatchPause: "0s", QueueMaxActive: 3, QueuePaused: true}
	p, err = c.QueuePolicy()
	if err != nil || p.Interval != 500*time.Millisecond || p.BatchSize != 25 || p.BatchPause != 0 || p.MaxActive != 3 || !p.Paused || c.IsZero() {
		t.Fatalf("explicit settings lost: %+v %v", p, err)
	}
}
