package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

const (
	frontend_log_component         = "frontend"
	frontend_log_max_batch         = 64
	frontend_log_max_fields        = 64
	frontend_log_max_message_runes = 16 * 1024
	frontend_log_max_payload_bytes = 256 * 1024
)

var frontend_log_reserved_fields = map[string]struct{}{
	"component": {},
	"level":     {},
	"message":   {},
	"msg":       {},
	"time":      {},
}

func register_frontend_log_routes(b *velo.Box, logger *zerolog.Logger) {
	b.Post("/report", func(c *velo.BoxContext) interface{} {
		accepted_count, err := report_frontend_logs(logger, c.Args())
		if err != nil {
			if logger != nil {
				logger.Warn().Str("component", "frontend_report").Err(err).Msg("rejected frontend log report")
			}
			return c.Error(err.Error())
		}
		return c.Ok(velo.H{"accepted": accepted_count})
	})
}

func report_frontend_logs(logger *zerolog.Logger, payload interface{}) (int, error) {
	entries, err := decode_frontend_log_entries(payload)
	if err != nil {
		return 0, err
	}
	for _, entry := range entries {
		write_frontend_log_entry(logger, entry)
	}
	return len(entries), nil
}

func decode_frontend_log_entries(payload interface{}) ([]map[string]interface{}, error) {
	payload_bytes, err := frontend_log_payload_bytes(payload)
	if err != nil {
		return nil, err
	}
	if len(payload_bytes) == 0 {
		return nil, fmt.Errorf("frontend log payload is empty")
	}
	if len(payload_bytes) > frontend_log_max_payload_bytes {
		return nil, fmt.Errorf("frontend log payload exceeds %d bytes", frontend_log_max_payload_bytes)
	}

	var decoded_payload interface{}
	if err := json.Unmarshal(payload_bytes, &decoded_payload); err != nil {
		return nil, fmt.Errorf("invalid frontend log payload: %w", err)
	}

	root, ok := decoded_payload.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("frontend log payload must be an object")
	}

	raw_entries, has_entries := root["entries"]
	if !has_entries {
		return []map[string]interface{}{root}, nil
	}
	entry_list, ok := raw_entries.([]interface{})
	if !ok {
		return nil, fmt.Errorf("frontend log entries must be an array")
	}
	if len(entry_list) > frontend_log_max_batch {
		return nil, fmt.Errorf("frontend log batch exceeds %d entries", frontend_log_max_batch)
	}

	entries := make([]map[string]interface{}, 0, len(entry_list))
	for entry_index, raw_entry := range entry_list {
		entry, ok := raw_entry.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("frontend log entry %d must be an object", entry_index)
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

func frontend_log_payload_bytes(payload interface{}) ([]byte, error) {
	switch value := payload.(type) {
	case []byte:
		return value, nil
	case string:
		return []byte(value), nil
	default:
		payload_bytes, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("encode frontend log payload: %w", err)
		}
		return payload_bytes, nil
	}
}

func write_frontend_log_entry(logger *zerolog.Logger, entry map[string]interface{}) {
	if logger == nil {
		return
	}

	level_name := normalize_frontend_log_level(frontend_log_string(entry["level"]))
	message := frontend_log_string(entry["message"])
	if message == "" {
		message = frontend_log_string(entry["msg"])
	}
	if message == "" {
		message = "frontend log"
	}
	message = truncate_frontend_log_string(message, frontend_log_max_message_runes)

	fields := make(map[string]interface{}, frontend_log_max_fields)
	field_count := 0
	for key, value := range entry {
		if _, reserved := frontend_log_reserved_fields[key]; reserved {
			continue
		}
		if field_count >= frontend_log_max_fields {
			break
		}
		if key == "timestamp" {
			fields["frontend_timestamp"] = value
		} else {
			fields[key] = value
		}
		field_count++
	}

	logger.WithLevel(frontend_log_level(level_name)).
		Str("component", frontend_log_component).
		Fields(fields).
		Msg(message)
}

func frontend_log_level(level_name string) zerolog.Level {
	switch level_name {
	case "debug":
		return zerolog.DebugLevel
	case "warn":
		return zerolog.WarnLevel
	case "error":
		return zerolog.ErrorLevel
	default:
		return zerolog.InfoLevel
	}
}

func normalize_frontend_log_level(level_name string) string {
	switch strings.ToLower(strings.TrimSpace(level_name)) {
	case "debug":
		return "debug"
	case "warn", "warning":
		return "warn"
	case "error", "fatal":
		return "error"
	default:
		return "info"
	}
}

func frontend_log_string(value interface{}) string {
	switch typed_value := value.(type) {
	case nil:
		return ""
	case string:
		return typed_value
	default:
		return fmt.Sprint(typed_value)
	}
}

func truncate_frontend_log_string(value string, max_runes int) string {
	value_runes := []rune(value)
	if len(value_runes) <= max_runes {
		return value
	}
	return string(value_runes[:max_runes]) + "…"
}
