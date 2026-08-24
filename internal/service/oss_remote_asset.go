package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	smithy_http "github.com/aws/smithy-go/transport/http"
)

// stream_remote_oss_asset serves a private S3-compatible object without
// exposing storage credentials or requiring the bucket to be public.
func stream_remote_oss_asset(parent context.Context, writer http.ResponseWriter, request *http.Request, cfg OSSConfig, object_path string) (bool, error) {
	if writer == nil {
		return false, fmt.Errorf("response writer is required")
	}
	if err := validateOSSAccessConfig(cfg); err != nil {
		return false, err
	}
	key := cleanOSSObjectPath(object_path)
	if key == "" {
		return false, fmt.Errorf("file path is required")
	}

	client, _, err := newOSSClient(cfg)
	if err != nil {
		return false, err
	}
	input := &s3.GetObjectInput{
		Bucket: aws.String(cfg.Bucket),
		Key:    aws.String(key),
	}
	if request != nil {
		if range_header := strings.TrimSpace(request.Header.Get("Range")); range_header != "" {
			input.Range = aws.String(range_header)
		}
	}

	output, err := client.GetObject(parent, input)
	if err != nil {
		return false, err
	}
	if output.Body == nil {
		return false, fmt.Errorf("object response body is empty")
	}
	defer output.Body.Close()

	content_type := strings.TrimSpace(stringValue(output.ContentType))
	if content_type == "" {
		content_type = mime.TypeByExtension(strings.ToLower(filepath.Ext(key)))
	}
	if content_type == "" {
		content_type = "application/octet-stream"
	}
	writer.Header().Set("Content-Type", content_type)
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.Header().Set("Accept-Ranges", firstNonEmpty(stringValue(output.AcceptRanges), "bytes"))
	if output.ContentLength >= 0 {
		writer.Header().Set("Content-Length", strconv.FormatInt(output.ContentLength, 10))
	}
	if value := strings.TrimSpace(stringValue(output.ContentRange)); value != "" {
		writer.Header().Set("Content-Range", value)
	}
	if value := strings.TrimSpace(stringValue(output.ETag)); value != "" {
		writer.Header().Set("ETag", value)
	}
	if value := strings.TrimSpace(stringValue(output.CacheControl)); value != "" {
		writer.Header().Set("Cache-Control", value)
	} else {
		writer.Header().Set("Cache-Control", "private, max-age=3600")
	}
	if value := strings.TrimSpace(stringValue(output.ContentDisposition)); value != "" {
		writer.Header().Set("Content-Disposition", value)
	}
	if output.LastModified != nil && !output.LastModified.IsZero() {
		writer.Header().Set("Last-Modified", output.LastModified.UTC().Format(http.TimeFormat))
	}

	status := http.StatusOK
	if strings.TrimSpace(stringValue(output.ContentRange)) != "" {
		status = http.StatusPartialContent
	}
	writer.WriteHeader(status)
	if request != nil && request.Method == http.MethodHead {
		return true, nil
	}
	_, err = io.Copy(writer, output.Body)
	return true, err
}

func remote_oss_error_status(err error) int {
	var response_err *smithy_http.ResponseError
	if errors.As(err, &response_err) {
		status := response_err.HTTPStatusCode()
		if status >= 400 && status <= 599 {
			return status
		}
	}
	var api_err smithy.APIError
	if errors.As(err, &api_err) {
		switch api_err.ErrorCode() {
		case "NoSuchBucket", "NoSuchKey", "NotFound":
			return http.StatusNotFound
		case "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch":
			return http.StatusBadGateway
		case "InvalidRange", "RequestedRangeNotSatisfiable":
			return http.StatusRequestedRangeNotSatisfiable
		}
	}
	return http.StatusBadGateway
}
