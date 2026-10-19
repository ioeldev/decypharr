package repair

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
	"github.com/sirrobot01/decypharr/pkg/storage"
)

func TestLibraryAuditSkipsBrokenSeason(t *testing.T) {
	for _, scenario := range []struct {
		name               string
		replaceWholeSeason bool
		autoRepair         bool
		restoreOriginal    bool
		queueFails         bool
		unknownRead        bool
		want               storage.RepairRunStats
	}{
		{name: "disabled", want: storage.RepairRunStats{Candidates: 4, Probed: 4, Healthy: 2, Broken: 2}},
		{name: "detection only", replaceWholeSeason: true, want: storage.RepairRunStats{Candidates: 4, Probed: 3, Healthy: 2, Broken: 1, SkippedSeason: 1}},
		{name: "auto repair", replaceWholeSeason: true, autoRepair: true, want: storage.RepairRunStats{Candidates: 4, Probed: 3, Healthy: 2, Broken: 1, SkippedSeason: 1, Repaired: 1, Queued: 1}},
		{name: "queue failure retains incident", replaceWholeSeason: true, autoRepair: true, queueFails: true, want: storage.RepairRunStats{Candidates: 4, Probed: 3, Healthy: 2, Broken: 1, SkippedSeason: 1, RepairFailed: 1}},
		{name: "restoration continues audit", replaceWholeSeason: true, autoRepair: true, restoreOriginal: true, want: storage.RepairRunStats{Candidates: 4, Probed: 4, Healthy: 2, Broken: 2, Repaired: 2, Restored: 1, Queued: 1}},
		{name: "unknown continues audit", replaceWholeSeason: true, unknownRead: true, want: storage.RepairRunStats{Candidates: 4, Probed: 4, Healthy: 2, Broken: 1, Unknown: 1}},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			store := newRepairTestStorage(t)
			directory := t.TempDir()
			old := config.Get()
			t.Cleanup(func() {
				_, _ = config.Update(func(settings *config.Config) error {
					settings.Repair, settings.Mount = old.Repair, old.Mount
					return nil
				})
			})
			if _, err := config.Update(func(settings *config.Config) error {
				settings.Repair = config.RepairConfig{Workers: 4, ReplaceWholeSeason: scenario.replaceWholeSeason}
				settings.Mount.MountPath, settings.Mount.Type = directory, "dfs"
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(directory, "version.txt"), []byte("mounted"), 0600); err != nil {
				t.Fatal(err)
			}

			var names []string
			originalPath := filepath.Join(directory, "episode-2.mkv")
			previousCheck := time.Now().Add(-time.Hour).Truncate(time.Second)
			for index := range 4 {
				path := filepath.Join(directory, fmt.Sprintf("episode-%d.mkv", index+1))
				seasonNumber := 1
				if index == 0 || index == 3 {
					writeLibrarySample(t, path)
				}
				if index == 3 {
					seasonNumber = 2
				}
				if index == 1 && scenario.unknownRead {
					path = filepath.Join(directory, "unavailable", "episode.mkv")
				}
				health := &storage.EntryHealth{
					EntryName: fmt.Sprintf("library:%d", index), Status: storage.HealthHealthy,
					LastCheckedAt: previousCheck, NextCheckDueAt: previousCheck.Add(24 * time.Hour),
					LibraryFile: &storage.BrokenFile{
						LibraryAudit: true, ArrName: "shows", ArrKind: storage.ArrKindSonarr,
						ArrFileID: index + 1, MediaID: 7, SeasonNumber: seasonNumber, EpisodeIDs: []int{index + 1},
						SourcePath: path, InfoHash: "original",
					},
				}
				if err := store.SaveEntryHealth(health); err != nil {
					t.Fatal(err)
				}
				names = append(names, health.EntryName)
			}
			if err := store.AddOrUpdate(&storage.Entry{InfoHash: "original", Name: "release", Protocol: config.ProtocolTorrent}); err != nil {
				t.Fatal(err)
			}
			backend := &removedProviderBackend{reinsert: func(*storage.Entry) error {
				if scenario.restoreOriginal {
					writeLibrarySample(t, originalPath)
				}
				return nil
			}}
			queue := &fakeReacquirer{library: func(request reacquire.LibraryRequest) (*reacquire.Job, error) {
				if scenario.queueFails {
					return nil, errors.New("queue unavailable")
				}
				return &reacquire.Job{ID: "season-job"}, nil
			}}
			service := New(Dependencies{Storage: store, Backend: backend, Reacquirer: queue})
			run := &storage.RepairRun{ID: "season-audit"}
			service.executeLibraryAudit(t.Context(), run, RunOptions{LibraryEntries: names, AutoRepair: &scenario.autoRepair}, nil)
			saved, err := store.GetRepairRun(run.ID)
			if err != nil || saved.Status != storage.RepairRunCompleted || saved.Stats != scenario.want {
				t.Fatalf("run = %+v, error = %v; want stats %+v", saved, err, scenario.want)
			}
			if len(queue.libraryRequests) != scenario.want.Queued+scenario.want.RepairFailed {
				t.Fatalf("unexpected repair requests: %+v", queue.libraryRequests)
			}
			if scenario.want.SkippedSeason == 0 {
				return
			}
			unread, err := store.GetEntryHealth(names[2])
			if err != nil || unread.Status != storage.HealthHealthy || !unread.LastCheckedAt.Equal(previousCheck) || !unread.NextCheckDueAt.Equal(previousCheck.Add(24*time.Hour)) {
				t.Fatalf("unread file was modified: %+v, %v", unread, err)
			}
		})
	}
}

func TestLibraryAuditSeasonGroupsPreserveIdentity(t *testing.T) {
	files := make([]*storage.EntryHealth, 10)
	for index := range files {
		files[index] = &storage.EntryHealth{EntryName: fmt.Sprint(index), LibraryFile: &storage.BrokenFile{
			ArrName: "shows", ArrFingerprint: "instance", ArrKind: storage.ArrKindSonarr,
			MediaID: 7, SeasonNumber: 1, EpisodeIDs: []int{index + 1},
		}}
	}
	files[2].LibraryFile.SeasonNumber = 2
	files[3].LibraryFile.MediaID = 8
	files[4].LibraryFile.ArrName = "other"
	files[5].LibraryFile.ArrFingerprint = "other-instance"
	files[6].LibraryFile.ArrKind = storage.ArrKindRadarr
	files[7].LibraryFile.ArrKind = storage.ArrKindRadarr
	files[8].LibraryFile.EpisodeIDs = nil
	files[9].LibraryFile.MediaID = 0

	groups := groupLibraryAuditFiles(files, true)
	var names [][]string
	for _, group := range groups {
		var groupNames []string
		for _, health := range group {
			groupNames = append(groupNames, health.EntryName)
		}
		names = append(names, groupNames)
	}
	want := [][]string{{"0", "1"}, {"2"}, {"3"}, {"4"}, {"5"}, {"6"}, {"7"}, {"8"}, {"9"}}
	if !reflect.DeepEqual(names, want) {
		t.Fatalf("groups = %v; want %v", names, want)
	}
}
