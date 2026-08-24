package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const d1_request_timeout = 20 * time.Second
const d1_error_body_limit = 64 * 1024

type d1_query_statement struct {
	Params []string `json:"params,omitempty"`
	SQL    string   `json:"sql"`
}

type d1_batch_request struct {
	Batch []d1_query_statement `json:"batch"`
}

type d1_api_error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type d1_query_result struct {
	Results []map[string]json.RawMessage `json:"results"`
	Success bool                         `json:"success"`
}

type d1_api_response struct {
	Errors  []d1_api_error    `json:"errors"`
	Result  []d1_query_result `json:"result"`
	Success bool              `json:"success"`
}

type d1_query_client interface {
	batch(context.Context, []d1_query_statement) ([]d1_query_result, error)
	query(context.Context, d1_query_statement) (d1_query_result, error)
}

type d1_http_query_client struct {
	config      D1MemoStorageConfig
	http_client *http.Client
}

func new_d1_http_query_client(config D1MemoStorageConfig, http_client *http.Client) (*d1_http_query_client, error) {
	config = normalize_memo_storage_settings(MemoStorageSettings{D1: config}).D1
	if err := validate_d1_memo_storage_config(config); err != nil {
		return nil, err
	}
	if http_client == nil {
		http_client = &http.Client{Timeout: d1_request_timeout}
	}
	return &d1_http_query_client{config: config, http_client: http_client}, nil
}

func (client *d1_http_query_client) query(call_ctx context.Context, statement d1_query_statement) (d1_query_result, error) {
	results, err := client.execute(call_ctx, statement)
	if err != nil {
		return d1_query_result{}, err
	}
	if len(results) == 0 {
		return d1_query_result{}, fmt.Errorf("Cloudflare D1 returned no query result")
	}
	return results[len(results)-1], nil
}

func (client *d1_http_query_client) batch(call_ctx context.Context, statements []d1_query_statement) ([]d1_query_result, error) {
	if len(statements) == 0 {
		return []d1_query_result{}, nil
	}
	return client.execute(call_ctx, d1_batch_request{Batch: statements})
}

func (client *d1_http_query_client) execute(call_ctx context.Context, payload interface{}) ([]d1_query_result, error) {
	raw_payload, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	request_url, err := client.query_url()
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(call_ctx, http.MethodPost, request_url, bytes.NewReader(raw_payload))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+client.config.APIToken)
	request.Header.Set("Content-Type", "application/json")

	response, err := client.http_client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("query Cloudflare D1: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		raw_error, read_err := io.ReadAll(io.LimitReader(response.Body, d1_error_body_limit))
		if read_err != nil {
			return nil, fmt.Errorf("read Cloudflare D1 error response: %w", read_err)
		}
		return nil, fmt.Errorf("Cloudflare D1 returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(raw_error)))
	}
	var envelope d1_api_response
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		return nil, fmt.Errorf("decode Cloudflare D1 response: %w", err)
	}
	if !envelope.Success {
		return nil, d1_response_error(envelope.Errors)
	}
	for _, result := range envelope.Result {
		if !result.Success {
			return nil, fmt.Errorf("Cloudflare D1 query failed")
		}
	}
	return envelope.Result, nil
}

func (client *d1_http_query_client) query_url() (string, error) {
	base_url, err := url.Parse(client.config.APIBaseURL)
	if err != nil {
		return "", err
	}
	base_url.Path = strings.TrimRight(base_url.Path, "/") +
		"/accounts/" + url.PathEscape(client.config.AccountID) +
		"/d1/database/" + url.PathEscape(client.config.DatabaseID) +
		"/query"
	base_url.RawQuery = ""
	base_url.Fragment = ""
	return base_url.String(), nil
}

func d1_response_error(errors []d1_api_error) error {
	messages := make([]string, 0, len(errors))
	for _, api_err := range errors {
		message := strings.TrimSpace(api_err.Message)
		if message == "" {
			continue
		}
		if api_err.Code > 0 {
			message = fmt.Sprintf("%s (%d)", message, api_err.Code)
		}
		messages = append(messages, message)
	}
	if len(messages) == 0 {
		return fmt.Errorf("Cloudflare D1 request failed")
	}
	return fmt.Errorf("Cloudflare D1 request failed: %s", strings.Join(messages, "; "))
}

func d1_row_string(row map[string]json.RawMessage, key string) (string, error) {
	raw, found := row[key]
	if !found || string(raw) == "null" {
		return "", nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err == nil {
		return value, nil
	}
	var number json.Number
	if err := json.Unmarshal(raw, &number); err == nil {
		return number.String(), nil
	}
	return "", fmt.Errorf("Cloudflare D1 column %s is not text", key)
}

func d1_row_int(row map[string]json.RawMessage, key string) (int, error) {
	raw, found := row[key]
	if !found || string(raw) == "null" {
		return 0, nil
	}
	var value int
	if err := json.Unmarshal(raw, &value); err == nil {
		return value, nil
	}
	var number json.Number
	if err := json.Unmarshal(raw, &number); err == nil {
		parsed_value, parse_err := number.Int64()
		if parse_err == nil {
			return int(parsed_value), nil
		}
	}
	return 0, fmt.Errorf("Cloudflare D1 column %s is not an integer", key)
}
