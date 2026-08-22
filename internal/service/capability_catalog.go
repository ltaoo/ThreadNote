package service

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
)

// CapabilityDefinition describes one application capability independently of
// HTTP, CLI, JSON-RPC, or MCP. All adapters expose this same catalog.
type CapabilityDefinition struct {
	Annotations CapabilityAnnotations  `json:"annotations"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
	Name        string                 `json:"name"`
}

// CapabilityAnnotations describe the side effects of a capability. The fields
// map directly to MCP tool annotations and are also useful to other adapters.
type CapabilityAnnotations struct {
	DestructiveHint bool `json:"destructiveHint"`
	IdempotentHint  bool `json:"idempotentHint"`
	OpenWorldHint   bool `json:"openWorldHint"`
	ReadOnlyHint    bool `json:"readOnlyHint"`
}

// CapabilityCall is the transport-neutral request used by generic adapters.
type CapabilityCall struct {
	Input json.RawMessage `json:"input"`
	Name  string          `json:"name"`
}

type capability_handler func(context.Context, json.RawMessage) (interface{}, error)

type capability_entry struct {
	definition CapabilityDefinition
	handler    capability_handler
}

// CapabilityService owns the application capability catalog for one vault.
// A desktop instance uses a dynamic active-vault provider; standalone servers
// use a fixed vault selected at startup.
type CapabilityService struct {
	entries        map[string]capability_entry
	privacy_setter func(bool) error
	vault_provider func() (*VaultContext, error)
}

// NewActiveCapabilityService creates a catalog backed by the desktop process's
// currently active vault. Vault changes are observed by later calls.
func NewActiveCapabilityService() *CapabilityService {
	privacy_setter := func(unlocked bool) error {
		vaultRuntime.Lock()
		defer vaultRuntime.Unlock()
		if vaultRuntime.active == nil {
			return fmt.Errorf("vault is not selected")
		}
		vaultRuntime.active.PrivateUnlocked = unlocked
		return nil
	}
	return new_capability_service(requireActiveVault, privacy_setter)
}

// OpenCapabilityService creates a standalone catalog. When vault_path is empty,
// the last active vault from the global registry is used.
func OpenCapabilityService(vault_path string) (*CapabilityService, error) {
	var vault_ctx *VaultContext
	var err error
	if strings.TrimSpace(vault_path) == "" {
		vault_ctx, err = loadStartupVault()
	} else {
		vault_ctx, _, err = openVaultDirectory(vault_path, false)
	}
	if err != nil {
		return nil, err
	}
	vault_provider := func() (*VaultContext, error) {
		if vault_ctx == nil {
			return nil, fmt.Errorf("vault is not selected; pass --vault or open a vault in ThreadNote")
		}
		return vault_ctx, nil
	}
	privacy_setter := func(unlocked bool) error {
		if vault_ctx == nil {
			return fmt.Errorf("vault is not selected; pass --vault or open a vault in ThreadNote")
		}
		vault_ctx.PrivateUnlocked = unlocked
		return nil
	}
	return new_capability_service(vault_provider, privacy_setter), nil
}

func new_capability_service(vault_provider func() (*VaultContext, error), privacy_setter func(bool) error) *CapabilityService {
	capability_service := &CapabilityService{
		entries:        map[string]capability_entry{},
		privacy_setter: privacy_setter,
		vault_provider: vault_provider,
	}
	register_vault_capabilities(capability_service)
	register_project_capabilities(capability_service)
	register_memo_capabilities(capability_service)
	register_history_capabilities(capability_service)
	register_privacy_capabilities(capability_service)
	register_task_capabilities(capability_service)
	register_milestone_capabilities(capability_service)
	register_board_capabilities(capability_service)
	register_hook_capabilities(capability_service)
	register_search_capabilities(capability_service)
	return capability_service
}

func (capability_service *CapabilityService) set_private_unlocked(unlocked bool) error {
	if capability_service == nil || capability_service.privacy_setter == nil {
		return fmt.Errorf("privacy state is not configured")
	}
	return capability_service.privacy_setter(unlocked)
}

// Capabilities returns the complete catalog in deterministic name order.
func (capability_service *CapabilityService) Capabilities() []CapabilityDefinition {
	definitions := make([]CapabilityDefinition, 0, len(capability_service.entries))
	for _, entry := range capability_service.entries {
		definitions = append(definitions, entry.definition)
	}
	sort.Slice(definitions, func(left_index int, right_index int) bool {
		return definitions[left_index].Name < definitions[right_index].Name
	})
	return definitions
}

// Invoke executes a named capability with a JSON object as input.
func (capability_service *CapabilityService) Invoke(call_ctx context.Context, name string, input json.RawMessage) (interface{}, error) {
	name = strings.TrimSpace(name)
	entry, ok := capability_service.entries[name]
	if !ok {
		return nil, fmt.Errorf("capability not found: %s", name)
	}
	input, err := normalize_capability_input(input)
	if err != nil {
		return nil, err
	}
	return entry.handler(call_ctx, input)
}

func (capability_service *CapabilityService) register(definition CapabilityDefinition, handler capability_handler) {
	name := strings.TrimSpace(definition.Name)
	if name == "" {
		panic("capability name is required")
	}
	if handler == nil {
		panic("capability handler is required: " + name)
	}
	if _, exists := capability_service.entries[name]; exists {
		panic("duplicate capability: " + name)
	}
	definition.Name = name
	if definition.InputSchema == nil {
		definition.InputSchema = empty_capability_schema()
	}
	capability_service.entries[name] = capability_entry{definition: definition, handler: handler}
}

func (capability_service *CapabilityService) require_vault() (*VaultContext, error) {
	if capability_service == nil || capability_service.vault_provider == nil {
		return nil, fmt.Errorf("vault provider is not configured")
	}
	return capability_service.vault_provider()
}

func normalize_capability_input(input json.RawMessage) (json.RawMessage, error) {
	if len(strings.TrimSpace(string(input))) == 0 || string(input) == "null" {
		return json.RawMessage(`{}`), nil
	}
	var value interface{}
	if err := json.Unmarshal(input, &value); err != nil {
		return nil, fmt.Errorf("invalid capability input: %w", err)
	}
	if _, ok := value.(map[string]interface{}); !ok {
		return nil, fmt.Errorf("capability input must be a JSON object")
	}
	return input, nil
}

func decode_capability_input(input json.RawMessage, target interface{}) error {
	if err := json.Unmarshal(input, target); err != nil {
		return fmt.Errorf("decode capability input: %w", err)
	}
	return nil
}

func capability_definition(name string, description string, input_value interface{}, required_fields ...string) CapabilityDefinition {
	return CapabilityDefinition{
		Annotations: CapabilityAnnotations{OpenWorldHint: false},
		Description: description,
		InputSchema: capability_schema(input_value, required_fields...),
		Name:        name,
	}
}

func read_only_capability(name string, description string, input_value interface{}, required_fields ...string) CapabilityDefinition {
	definition := capability_definition(name, description, input_value, required_fields...)
	definition.Annotations.ReadOnlyHint = true
	definition.Annotations.IdempotentHint = true
	return definition
}

func destructive_capability(name string, description string, input_value interface{}, required_fields ...string) CapabilityDefinition {
	definition := capability_definition(name, description, input_value, required_fields...)
	definition.Annotations.DestructiveHint = true
	return definition
}

func empty_capability_schema() map[string]interface{} {
	return map[string]interface{}{
		"additionalProperties": false,
		"properties":           map[string]interface{}{},
		"type":                 "object",
	}
}

func capability_schema(input_value interface{}, required_fields ...string) map[string]interface{} {
	if input_value == nil {
		return empty_capability_schema()
	}
	schema := capability_schema_type(reflect.TypeOf(input_value))
	if len(required_fields) > 0 {
		schema["required"] = required_fields
	}
	return schema
}

func capability_schema_type(value_type reflect.Type) map[string]interface{} {
	for value_type.Kind() == reflect.Pointer {
		value_type = value_type.Elem()
	}
	switch value_type.Kind() {
	case reflect.Bool:
		return map[string]interface{}{"type": "boolean"}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return map[string]interface{}{"type": "integer"}
	case reflect.Float32, reflect.Float64:
		return map[string]interface{}{"type": "number"}
	case reflect.String:
		return map[string]interface{}{"type": "string"}
	case reflect.Slice, reflect.Array:
		return map[string]interface{}{
			"items": capability_schema_type(value_type.Elem()),
			"type":  "array",
		}
	case reflect.Map:
		return map[string]interface{}{
			"additionalProperties": capability_schema_type(value_type.Elem()),
			"type":                 "object",
		}
	case reflect.Interface:
		return map[string]interface{}{}
	case reflect.Struct:
		properties := map[string]interface{}{}
		for field_index := 0; field_index < value_type.NumField(); field_index++ {
			field := value_type.Field(field_index)
			if !field.IsExported() {
				continue
			}
			json_name := strings.Split(field.Tag.Get("json"), ",")[0]
			if json_name == "-" {
				continue
			}
			if json_name == "" {
				json_name = field.Name
			}
			properties[json_name] = capability_schema_type(field.Type)
		}
		return map[string]interface{}{
			"additionalProperties": false,
			"properties":           properties,
			"type":                 "object",
		}
	default:
		return map[string]interface{}{}
	}
}
