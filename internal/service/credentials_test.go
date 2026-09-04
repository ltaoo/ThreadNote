package service

import (
	"bytes"
	"testing"
)

func TestCredentialVaultEncryptsAndLocksItems(t *testing.T) {
	root_dir := t.TempDir()
	workspace_fs, err := new_local_vault_fs(root_dir)
	if err != nil {
		t.Fatal(err)
	}
	vault_ctx := &VaultContext{
		Entry:   VaultEntry{ID: "credential-test-vault"},
		RootDir: root_dir,
		fs:      workspace_fs,
	}
	credential_session_lock()
	defer credential_session_lock()

	initialized, unlocked, err := credential_status(vault_ctx)
	if err != nil || initialized || unlocked {
		t.Fatalf("unexpected initial status: initialized=%v unlocked=%v err=%v", initialized, unlocked, err)
	}
	if err := credential_setup(vault_ctx, "correct horse battery staple"); err != nil {
		t.Fatalf("setup credential vault: %v", err)
	}
	saved, err := credential_save_item(vault_ctx, CredentialItem{
		Fields: []CredentialField{
			{Label: "用户名", Value: "alice"},
			{Label: "密码", Secret: true, Value: "do-not-store-in-plaintext"},
		},
		Notes: "production account",
		Tags:  []string{"Work", "work"},
		Title: "Example Login",
		Type:  "login",
		URL:   "https://example.com",
	})
	if err != nil {
		t.Fatalf("save credential: %v", err)
	}
	if saved.ID == "" || len(saved.Fields) != 2 || saved.Fields[1].Value != "" || !saved.Fields[1].HasValue {
		t.Fatalf("unexpected saved view: %#v", saved)
	}
	raw, err := workspace_fs.read_file(credential_file_path())
	if err != nil {
		t.Fatalf("read encrypted credential file: %v", err)
	}
	for _, plaintext := range [][]byte{
		[]byte("Example Login"),
		[]byte("do-not-store-in-plaintext"),
		[]byte("correct horse battery staple"),
	} {
		if bytes.Contains(raw, plaintext) {
			t.Fatalf("credential file contains plaintext %q", plaintext)
		}
	}

	items, err := credential_list_items(vault_ctx, "example", "login")
	if err != nil || len(items) != 1 || len(items[0].Tags) != 1 {
		t.Fatalf("list credentials: items=%#v err=%v", items, err)
	}
	redacted, err := credential_get_item(vault_ctx, saved.ID, false)
	if err != nil || redacted.Fields[1].Value != "" {
		t.Fatalf("get redacted credential: item=%#v err=%v", redacted, err)
	}
	revealed, err := credential_reveal_field(vault_ctx, saved.ID, redacted.Fields[1].ID)
	if err != nil || revealed != "do-not-store-in-plaintext" {
		t.Fatalf("reveal credential field: value=%q err=%v", revealed, err)
	}

	credential_session_lock()
	if _, err := credential_list_items(vault_ctx, "", "all"); err == nil {
		t.Fatal("expected locked credential vault to reject reads")
	}
	if err := credential_unlock(vault_ctx, "wrong password value"); err == nil {
		t.Fatal("expected wrong password to fail")
	}
	if err := credential_unlock(vault_ctx, "correct horse battery staple"); err != nil {
		t.Fatalf("unlock credential vault: %v", err)
	}
	editable, err := credential_get_item(vault_ctx, saved.ID, true)
	if err != nil || editable.Fields[1].Value != "do-not-store-in-plaintext" {
		t.Fatalf("get editable credential: item=%#v err=%v", editable, err)
	}
	if err := credential_delete_item(vault_ctx, saved.ID); err != nil {
		t.Fatalf("delete credential: %v", err)
	}
	items, err = credential_list_items(vault_ctx, "", "all")
	if err != nil || len(items) != 0 {
		t.Fatalf("list deleted credentials: items=%#v err=%v", items, err)
	}
}
