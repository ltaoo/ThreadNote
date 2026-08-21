//go:build windows

package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

const (
	windows_create_new_process_group = 0x00000200
	windows_detached_process         = 0x00000008
)

func apply_downloaded_update_and_restart(_ context.Context, _ *application_updater, update_path string) error {
	if !strings.EqualFold(filepath.Ext(update_path), ".zip") {
		return fmt.Errorf("Windows update package must be a ZIP archive")
	}
	if _, err := os.Stat(update_path); err != nil {
		return fmt.Errorf("open Windows update package: %w", err)
	}

	executable_path, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve current executable: %w", err)
	}
	helper_path := filepath.Join(filepath.Dir(update_path), "ThreadNote-update-helper.exe")
	if err := os.Remove(helper_path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove previous update helper: %w", err)
	}
	if err := copy_update_file(executable_path, helper_path); err != nil {
		return fmt.Errorf("create update helper: %w", err)
	}

	encoded_arguments, err := encode_update_arguments(os.Args[1:])
	if err != nil {
		_ = os.Remove(helper_path)
		return err
	}
	command := exec.Command(
		helper_path,
		update_helper_flag,
		fmt.Sprintf("--parent-pid=%d", os.Getpid()),
		"--archive="+update_path,
		"--target="+executable_path,
		"--arguments="+encoded_arguments,
	)
	command.Dir = filepath.Dir(executable_path)
	command.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windows_create_new_process_group | windows_detached_process,
		HideWindow:    true,
	}
	if err := command.Start(); err != nil {
		_ = os.Remove(helper_path)
		return fmt.Errorf("start update helper: %w", err)
	}
	if err := command.Process.Release(); err != nil {
		return fmt.Errorf("release update helper: %w", err)
	}
	quit_application()
	return nil
}

func encode_update_arguments(arguments []string) (string, error) {
	data, err := json.Marshal(arguments)
	if err != nil {
		return "", fmt.Errorf("encode application arguments: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}
