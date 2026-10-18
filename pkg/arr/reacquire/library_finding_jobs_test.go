package reacquire

import "testing"

func TestLibraryFindingJobsReturnsIndependentSummaries(t *testing.T) {
	service := &Service{jobs: map[string]Job{
		"repair": {ID: "repair", Cause: CauseRepair, Bindings: []Binding{{EpisodeIDs: []int{42}}}, Attempts: []RecoveryAttempt{{}}, Mutations: []Mutation{{}}, ReplacementDownloadIDs: []string{"download"}},
		"manual": {ID: "manual", Cause: CauseManual},
	}}
	summaries := service.LibraryFindingJobs()
	if len(summaries) != 1 || summaries[0].ID != "repair" {
		t.Fatal("expected only repair jobs")
	}
	if summaries[0].Attempts != nil || summaries[0].Mutations != nil || summaries[0].ReplacementDownloadIDs != nil {
		t.Fatal("history must not be copied into findings summaries")
	}
	summaries[0].Bindings[0].EpisodeIDs[0] = 99
	original := service.jobs["repair"]
	if original.Bindings[0].EpisodeIDs[0] != 42 || len(original.Attempts) != 1 || len(original.Mutations) != 1 {
		t.Fatal("summary altered worker state")
	}
}
