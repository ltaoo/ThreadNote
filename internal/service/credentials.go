package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const (
	credential_aad_payload         = "threadnote-credential-payload-v1"
	credential_aad_vault_key       = "threadnote-credential-vault-key-v1"
	credential_argon_memory        = uint32(64 * 1024)
	credential_argon_threads       = uint8(4)
	credential_argon_time          = uint32(3)
	credential_auto_lock_duration  = 10 * time.Minute
	credential_cipher_algorithm    = "aes-256-gcm"
	credential_file_max_bytes      = 24 * 1024 * 1024
	credential_item_max_bytes      = 16 * 1024 * 1024
	credential_kdf_algorithm       = "argon2id"
	credential_master_password_max = 1024
	credential_master_password_min = 12
	credential_max_fields          = 24
	credential_max_items           = 5000
	credential_max_tags            = 50
	credential_payload_schema      = 1
	credential_vault_file_name     = "credentials.v1.json"
	credential_vault_schema        = 1
)

// ponytail: one process-wide lock is enough for one active vault; split it per
// vault only if concurrent multi-vault access is added.
var credential_store_mutex sync.Mutex

var credential_session = struct {
	sync.Mutex
	generation uint64
	key        []byte
	timer      *time.Timer
	vault      string
}{}

var credential_types = map[string]struct{}{
	"api_token": {},
	"custom":    {},
	"login":     {},
	"ssh_key":   {},
}

type CredentialField struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Secret bool   `json:"secret"`
	Value  string `json:"value"`
}

type CredentialItem struct {
	CreatedAt string            `json:"createdAt"`
	Fields    []CredentialField `json:"fields"`
	ID        string            `json:"id"`
	Notes     string            `json:"notes"`
	Tags      []string          `json:"tags"`
	Title     string            `json:"title"`
	Type      string            `json:"type"`
	UpdatedAt string            `json:"updatedAt"`
	URL       string            `json:"url"`
}

type credential_field_view struct {
	HasValue bool   `json:"hasValue"`
	ID       string `json:"id"`
	Label    string `json:"label"`
	Secret   bool   `json:"secret"`
	Value    string `json:"value"`
}

type credential_item_view struct {
	CreatedAt string                  `json:"createdAt"`
	Fields    []credential_field_view `json:"fields"`
	ID        string                  `json:"id"`
	Notes     string                  `json:"notes"`
	Tags      []string                `json:"tags"`
	Title     string                  `json:"title"`
	Type      string                  `json:"type"`
	UpdatedAt string                  `json:"updatedAt"`
	URL       string                  `json:"url"`
}

type credential_item_summary struct {
	ID        string   `json:"id"`
	Tags      []string `json:"tags"`
	Title     string   `json:"title"`
	Type      string   `json:"type"`
	UpdatedAt string   `json:"updatedAt"`
	URL       string   `json:"url"`
}

type credential_kdf_file struct {
	Algorithm string `json:"algorithm"`
	Memory    uint32 `json:"memory"`
	Salt      string `json:"salt"`
	Threads   uint8  `json:"threads"`
	Time      uint32 `json:"time"`
}

type credential_cipher_file struct {
	Algorithm  string `json:"algorithm"`
	Ciphertext string `json:"ciphertext"`
	Nonce      string `json:"nonce"`
}

type credential_vault_file struct {
	KDF           credential_kdf_file    `json:"kdf"`
	Payload       credential_cipher_file `json:"payload"`
	SchemaVersion int                    `json:"schemaVersion"`
	WrappedKey    credential_cipher_file `json:"wrappedKey"`
}

type credential_payload struct {
	// ponytail: one encrypted payload keeps updates atomic; split per item only
	// when concurrent multi-device editing needs conflict-free merging.
	Items         []CredentialItem `json:"items"`
	SchemaVersion int              `json:"schemaVersion"`
}

func credential_file_path() string {
	return path.Join(vaultConfigDirName, credential_vault_file_name)
}

func credential_vault_identity(ctx *VaultContext) string {
	if ctx == nil {
		return ""
	}
	return ctx.Entry.ID + "\x00" + ctx.RootDir
}

func credential_zero(value []byte) {
	for value_index := range value {
		value[value_index] = 0
	}
}

func credential_session_clear_locked() {
	credential_session.generation++
	if credential_session.timer != nil {
		credential_session.timer.Stop()
	}
	credential_zero(credential_session.key)
	credential_session.key = nil
	credential_session.timer = nil
	credential_session.vault = ""
}

func credential_session_schedule_locked() {
	credential_session.generation++
	generation := credential_session.generation
	if credential_session.timer != nil {
		credential_session.timer.Stop()
	}
	credential_session.timer = time.AfterFunc(credential_auto_lock_duration, func() {
		credential_session.Lock()
		defer credential_session.Unlock()
		if credential_session.generation == generation {
			credential_session_clear_locked()
		}
	})
}

func credential_session_lock() {
	credential_session.Lock()
	defer credential_session.Unlock()
	credential_session_clear_locked()
}

func credential_session_store(ctx *VaultContext, key []byte) {
	credential_session.Lock()
	defer credential_session.Unlock()
	credential_session_clear_locked()
	credential_session.key = append([]byte(nil), key...)
	credential_session.vault = credential_vault_identity(ctx)
	credential_session_schedule_locked()
}

func credential_session_is_unlocked(ctx *VaultContext) bool {
	credential_session.Lock()
	defer credential_session.Unlock()
	return credential_session.vault == credential_vault_identity(ctx) && len(credential_session.key) == 32
}

func credential_session_key(ctx *VaultContext) ([]byte, error) {
	credential_session.Lock()
	defer credential_session.Unlock()
	if credential_session.vault != credential_vault_identity(ctx) || len(credential_session.key) != 32 {
		return nil, errors.New("credential vault is locked")
	}
	credential_session_schedule_locked()
	return append([]byte(nil), credential_session.key...), nil
}

func credential_random_bytes(size int) ([]byte, error) {
	value := make([]byte, size)
	if _, err := io.ReadFull(rand.Reader, value); err != nil {
		return nil, fmt.Errorf("generate credential random data: %w", err)
	}
	return value, nil
}

func credential_random_id() (string, error) {
	raw, err := credential_random_bytes(16)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

func credential_validate_master_password(password string) error {
	password_length := utf8.RuneCountInString(password)
	if password_length < credential_master_password_min {
		return fmt.Errorf("master password must be at least %d characters", credential_master_password_min)
	}
	if len(password) > credential_master_password_max {
		return fmt.Errorf("master password is too long")
	}
	return nil
}

func credential_validate_kdf(kdf credential_kdf_file) ([]byte, error) {
	if kdf.Algorithm != credential_kdf_algorithm {
		return nil, errors.New("unsupported credential KDF")
	}
	if kdf.Time < 1 || kdf.Time > 10 || kdf.Memory < 8*1024 || kdf.Memory > 256*1024 || kdf.Threads < 1 || kdf.Threads > 16 {
		return nil, errors.New("invalid credential KDF parameters")
	}
	salt, err := base64.StdEncoding.DecodeString(kdf.Salt)
	if err != nil || len(salt) != 16 {
		return nil, errors.New("invalid credential KDF salt")
	}
	return salt, nil
}

func credential_derive_key(password string, kdf credential_kdf_file) ([]byte, error) {
	salt, err := credential_validate_kdf(kdf)
	if err != nil {
		return nil, err
	}
	return argon2.IDKey([]byte(password), salt, kdf.Time, kdf.Memory, kdf.Threads, 32), nil
}

func credential_seal(key []byte, plaintext []byte, additional_data string) (credential_cipher_file, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return credential_cipher_file{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return credential_cipher_file{}, err
	}
	nonce, err := credential_random_bytes(gcm.NonceSize())
	if err != nil {
		return credential_cipher_file{}, err
	}
	ciphertext := gcm.Seal(nil, nonce, plaintext, []byte(additional_data))
	return credential_cipher_file{
		Algorithm:  credential_cipher_algorithm,
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
		Nonce:      base64.StdEncoding.EncodeToString(nonce),
	}, nil
}

func credential_open(key []byte, sealed credential_cipher_file, additional_data string) ([]byte, error) {
	if sealed.Algorithm != credential_cipher_algorithm {
		return nil, errors.New("unsupported credential cipher")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce, nonce_err := base64.StdEncoding.DecodeString(sealed.Nonce)
	ciphertext, ciphertext_err := base64.StdEncoding.DecodeString(sealed.Ciphertext)
	if nonce_err != nil || ciphertext_err != nil || len(nonce) != gcm.NonceSize() {
		return nil, errors.New("invalid credential ciphertext")
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, []byte(additional_data))
	if err != nil {
		return nil, errors.New("credential decryption failed")
	}
	return plaintext, nil
}

func credential_read_vault_file(ctx *VaultContext) (credential_vault_file, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return credential_vault_file{}, err
	}
	raw, err := workspace_fs.read_file(credential_file_path())
	if err != nil {
		return credential_vault_file{}, err
	}
	if len(raw) > credential_file_max_bytes {
		return credential_vault_file{}, errors.New("credential vault file is too large")
	}
	var file credential_vault_file
	if err := json.Unmarshal(raw, &file); err != nil {
		return credential_vault_file{}, errors.New("credential vault file is invalid")
	}
	if file.SchemaVersion != credential_vault_schema {
		return credential_vault_file{}, errors.New("unsupported credential vault version")
	}
	return file, nil
}

func credential_write_vault_file(ctx *VaultContext, file credential_vault_file) error {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if len(raw) > credential_file_max_bytes {
		return errors.New("credential vault file is too large")
	}
	return workspace_fs.write_file_atomic(credential_file_path(), append(raw, '\n'), 0600)
}

func credential_vault_exists(ctx *VaultContext) (bool, error) {
	workspace_fs, err := require_vault_fs(ctx)
	if err != nil {
		return false, err
	}
	_, err = workspace_fs.stat_file(credential_file_path())
	if err == nil {
		return true, nil
	}
	if is_vault_file_not_exist(err) {
		return false, nil
	}
	return false, err
}

func credential_decode_payload(file credential_vault_file, key []byte) (credential_payload, error) {
	raw, err := credential_open(key, file.Payload, credential_aad_payload)
	if err != nil {
		return credential_payload{}, errors.New("credential vault data is invalid")
	}
	if len(raw) > credential_item_max_bytes {
		return credential_payload{}, errors.New("credential vault data is too large")
	}
	var payload credential_payload
	if err := json.Unmarshal(raw, &payload); err != nil || payload.SchemaVersion != credential_payload_schema {
		return credential_payload{}, errors.New("credential vault data is invalid")
	}
	if payload.Items == nil {
		payload.Items = []CredentialItem{}
	}
	return payload, nil
}

func credential_encode_payload(file credential_vault_file, key []byte, payload credential_payload) (credential_vault_file, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return credential_vault_file{}, err
	}
	if len(raw) > credential_item_max_bytes {
		return credential_vault_file{}, errors.New("credential vault data is too large")
	}
	file.Payload, err = credential_seal(key, raw, credential_aad_payload)
	return file, err
}

func credential_setup(ctx *VaultContext, password string) error {
	if err := credential_validate_master_password(password); err != nil {
		return err
	}
	credential_store_mutex.Lock()
	defer credential_store_mutex.Unlock()
	exists, err := credential_vault_exists(ctx)
	if err != nil {
		return err
	}
	if exists {
		return errors.New("credential vault is already initialized")
	}
	salt, err := credential_random_bytes(16)
	if err != nil {
		return err
	}
	kdf := credential_kdf_file{
		Algorithm: credential_kdf_algorithm,
		Memory:    credential_argon_memory,
		Salt:      base64.StdEncoding.EncodeToString(salt),
		Threads:   credential_argon_threads,
		Time:      credential_argon_time,
	}
	wrapping_key, err := credential_derive_key(password, kdf)
	if err != nil {
		return err
	}
	defer credential_zero(wrapping_key)
	vault_key, err := credential_random_bytes(32)
	if err != nil {
		return err
	}
	defer credential_zero(vault_key)
	wrapped_key, err := credential_seal(wrapping_key, vault_key, credential_aad_vault_key)
	if err != nil {
		return err
	}
	file := credential_vault_file{
		KDF:           kdf,
		SchemaVersion: credential_vault_schema,
		WrappedKey:    wrapped_key,
	}
	file, err = credential_encode_payload(file, vault_key, credential_payload{
		Items:         []CredentialItem{},
		SchemaVersion: credential_payload_schema,
	})
	if err != nil {
		return err
	}
	if err := credential_write_vault_file(ctx, file); err != nil {
		return err
	}
	credential_session_store(ctx, vault_key)
	return nil
}

func credential_unlock(ctx *VaultContext, password string) error {
	if err := credential_validate_master_password(password); err != nil {
		return errors.New("invalid master password")
	}
	credential_store_mutex.Lock()
	defer credential_store_mutex.Unlock()
	file, err := credential_read_vault_file(ctx)
	if err != nil {
		return err
	}
	wrapping_key, err := credential_derive_key(password, file.KDF)
	if err != nil {
		return errors.New("credential vault data is invalid")
	}
	defer credential_zero(wrapping_key)
	vault_key, err := credential_open(wrapping_key, file.WrappedKey, credential_aad_vault_key)
	if err != nil || len(vault_key) != 32 {
		credential_zero(vault_key)
		return errors.New("invalid master password or corrupted credential vault")
	}
	defer credential_zero(vault_key)
	if _, err := credential_decode_payload(file, vault_key); err != nil {
		return errors.New("invalid master password or corrupted credential vault")
	}
	credential_session_store(ctx, vault_key)
	return nil
}

func credential_load_unlocked(ctx *VaultContext) (credential_vault_file, credential_payload, []byte, error) {
	key, err := credential_session_key(ctx)
	if err != nil {
		return credential_vault_file{}, credential_payload{}, nil, err
	}
	file, err := credential_read_vault_file(ctx)
	if err != nil {
		credential_zero(key)
		return credential_vault_file{}, credential_payload{}, nil, err
	}
	payload, err := credential_decode_payload(file, key)
	if err != nil {
		credential_zero(key)
		return credential_vault_file{}, credential_payload{}, nil, err
	}
	return file, payload, key, nil
}

func credential_status(ctx *VaultContext) (bool, bool, error) {
	initialized, err := credential_vault_exists(ctx)
	if err != nil {
		return false, false, err
	}
	return initialized, initialized && credential_session_is_unlocked(ctx), nil
}

func credential_item_summary_from_item(item CredentialItem) credential_item_summary {
	return credential_item_summary{
		ID:        item.ID,
		Tags:      append([]string(nil), item.Tags...),
		Title:     item.Title,
		Type:      item.Type,
		UpdatedAt: item.UpdatedAt,
		URL:       item.URL,
	}
}

func credential_item_view_from_item(item CredentialItem, include_secrets bool) credential_item_view {
	fields := make([]credential_field_view, 0, len(item.Fields))
	for _, field := range item.Fields {
		value := field.Value
		if field.Secret && !include_secrets {
			value = ""
		}
		fields = append(fields, credential_field_view{
			HasValue: field.Value != "",
			ID:       field.ID,
			Label:    field.Label,
			Secret:   field.Secret,
			Value:    value,
		})
	}
	return credential_item_view{
		CreatedAt: item.CreatedAt,
		Fields:    fields,
		ID:        item.ID,
		Notes:     item.Notes,
		Tags:      append([]string(nil), item.Tags...),
		Title:     item.Title,
		Type:      item.Type,
		UpdatedAt: item.UpdatedAt,
		URL:       item.URL,
	}
}

func credential_list_items(ctx *VaultContext, query string, item_type string) ([]credential_item_summary, error) {
	credential_store_mutex.Lock()
	defer credential_store_mutex.Unlock()
	_, payload, key, err := credential_load_unlocked(ctx)
	if err != nil {
		return nil, err
	}
	defer credential_zero(key)
	query = strings.ToLower(strings.TrimSpace(query))
	item_type = strings.TrimSpace(item_type)
	items := make([]credential_item_summary, 0, len(payload.Items))
	for _, item := range payload.Items {
		if item_type != "" && item_type != "all" && item.Type != item_type {
			continue
		}
		searchable := strings.ToLower(item.Title + "\n" + item.URL + "\n" + strings.Join(item.Tags, "\n"))
		if query != "" && !strings.Contains(searchable, query) {
			continue
		}
		items = append(items, credential_item_summary_from_item(item))
	}
	sort.SliceStable(items, func(left_index int, right_index int) bool {
		if items[left_index].UpdatedAt == items[right_index].UpdatedAt {
			return strings.ToLower(items[left_index].Title) < strings.ToLower(items[right_index].Title)
		}
		return items[left_index].UpdatedAt > items[right_index].UpdatedAt
	})
	return items, nil
}

func credential_find_item(payload credential_payload, item_id string) (CredentialItem, int, error) {
	item_id = strings.TrimSpace(item_id)
	for item_index, item := range payload.Items {
		if item.ID == item_id {
			return item, item_index, nil
		}
	}
	return CredentialItem{}, -1, errors.New("credential item not found")
}

func credential_get_item(ctx *VaultContext, item_id string, include_secrets bool) (credential_item_view, error) {
	credential_store_mutex.Lock()
	defer credential_store_mutex.Unlock()
	_, payload, key, err := credential_load_unlocked(ctx)
	if err != nil {
		return credential_item_view{}, err
	}
	defer credential_zero(key)
	item, _, err := credential_find_item(payload, item_id)
	if err != nil {
		return credential_item_view{}, err
	}
	return credential_item_view_from_item(item, include_secrets), nil
}

func credential_reveal_field(ctx *VaultContext, item_id string, field_id string) (string, error) {
	credential_store_mutex.Lock()
	defer credential_store_mutex.Unlock()
	_, payload, key, err := credential_load_unlocked(ctx)
	if err != nil {
		return "", err
	}
	defer credential_zero(key)
	item, _, err := credential_find_item(payload, item_id)
	if err != nil {
		return "", err
	}
	field_id = strings.TrimSpace(field_id)
	for _, field := range item.Fields {
		if field.ID == field_id {
			return field.Value, nil
		}
	}
	return "", errors.New("credential field not found")
}

func credential_normalize_tags(tags []string) ([]string, error) {
	if len(tags) > credential_max_tags {
		return nil, errors.New("too many credential tags")
	}
	normalized := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		if utf8.RuneCountInString(tag) > 50 {
			return nil, errors.New("credential tag is too long")
		}
		key := strings.ToLower(tag)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, tag)
	}
	return normalized, nil
}

func credential_normalize_item(item CredentialItem) (CredentialItem, error) {
	item.ID = strings.TrimSpace(item.ID)
	item.Title = strings.TrimSpace(item.Title)
	item.Type = strings.TrimSpace(item.Type)
	item.URL = strings.TrimSpace(item.URL)
	if item.Title == "" {
		return CredentialItem{}, errors.New("credential title is required")
	}
	if utf8.RuneCountInString(item.Title) > 200 {
		return CredentialItem{}, errors.New("credential title is too long")
	}
	if _, valid := credential_types[item.Type]; !valid {
		return CredentialItem{}, errors.New("credential type is invalid")
	}
	if len(item.URL) > 2048 {
		return CredentialItem{}, errors.New("credential URL is too long")
	}
	if len(item.Notes) > 1024*1024 {
		return CredentialItem{}, errors.New("credential notes are too large")
	}
	if len(item.Fields) == 0 || len(item.Fields) > credential_max_fields {
		return CredentialItem{}, errors.New("credential fields are invalid")
	}
	tags, err := credential_normalize_tags(item.Tags)
	if err != nil {
		return CredentialItem{}, err
	}
	item.Tags = tags
	field_ids := make(map[string]struct{}, len(item.Fields))
	for field_index := range item.Fields {
		field := &item.Fields[field_index]
		field.ID = strings.TrimSpace(field.ID)
		field.Label = strings.TrimSpace(field.Label)
		if field.ID == "" {
			field.ID, err = credential_random_id()
			if err != nil {
				return CredentialItem{}, err
			}
		}
		if _, duplicate := field_ids[field.ID]; duplicate {
			return CredentialItem{}, errors.New("credential field IDs must be unique")
		}
		field_ids[field.ID] = struct{}{}
		if field.Label == "" || utf8.RuneCountInString(field.Label) > 100 {
			return CredentialItem{}, errors.New("credential field label is invalid")
		}
		if len(field.Value) > 1024*1024 {
			return CredentialItem{}, errors.New("credential field value is too large")
		}
	}
	return item, nil
}

func credential_save_item(ctx *VaultContext, item CredentialItem) (credential_item_view, error) {
	credential_store_mutex.Lock()
	defer credential_store_mutex.Unlock()
	file, payload, key, err := credential_load_unlocked(ctx)
	if err != nil {
		return credential_item_view{}, err
	}
	defer credential_zero(key)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	item_id := strings.TrimSpace(item.ID)
	if item_id == "" {
		if len(payload.Items) >= credential_max_items {
			return credential_item_view{}, errors.New("credential item limit reached")
		}
		item.ID, err = credential_random_id()
		if err != nil {
			return credential_item_view{}, err
		}
		item.CreatedAt = now
	} else {
		existing, item_index, find_err := credential_find_item(payload, item_id)
		if find_err != nil {
			return credential_item_view{}, find_err
		}
		item.ID = existing.ID
		item.CreatedAt = existing.CreatedAt
		payload.Items = append(payload.Items[:item_index], payload.Items[item_index+1:]...)
	}
	item.UpdatedAt = now
	item, err = credential_normalize_item(item)
	if err != nil {
		return credential_item_view{}, err
	}
	payload.Items = append(payload.Items, item)
	file, err = credential_encode_payload(file, key, payload)
	if err != nil {
		return credential_item_view{}, err
	}
	if err := credential_write_vault_file(ctx, file); err != nil {
		return credential_item_view{}, err
	}
	return credential_item_view_from_item(item, false), nil
}

func credential_delete_item(ctx *VaultContext, item_id string) error {
	credential_store_mutex.Lock()
	defer credential_store_mutex.Unlock()
	file, payload, key, err := credential_load_unlocked(ctx)
	if err != nil {
		return err
	}
	defer credential_zero(key)
	_, item_index, err := credential_find_item(payload, item_id)
	if err != nil {
		return err
	}
	payload.Items = append(payload.Items[:item_index], payload.Items[item_index+1:]...)
	file, err = credential_encode_payload(file, key, payload)
	if err != nil {
		return err
	}
	return credential_write_vault_file(ctx, file)
}
