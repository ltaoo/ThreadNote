package agent

import (
	"testing"

	"example/simple/internal/clientsdk/acp"
)

func TestMemoClientRejectsPermissionRequests(t *testing.T) {
	client := NewMultiplexingClient()
	response, err := client.RequestPermission(&acp.RequestPermissionRequest{
		Options: []acp.PermissionOption{
			{OptionID: "allow", Kind: "allow_once"},
			{OptionID: "reject", Kind: "reject_once"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.Outcome.Outcome != "selected" || response.Outcome.OptionID != "reject" {
		t.Fatalf("unexpected outcome: %+v", response.Outcome)
	}
}

func TestMemoClientDisablesFileWrites(t *testing.T) {
	client := NewMultiplexingClient()
	if _, err := client.WriteTextFile(&acp.WriteTextFileRequest{Path: "unused", Content: "unused"}); err == nil {
		t.Fatal("expected file write to be rejected")
	}
}
