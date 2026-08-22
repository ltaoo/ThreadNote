//go:build windows

package service

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

const update_helper_flag = "--threadnote-update-helper"

type update_helper_options struct {
	archive_path          string
	target_path           string
	application_arguments []string
	parent_pid            int
}

// RunUpdateHelperIfRequested runs the detached Windows replacement process
// before the desktop application initializes.
func RunUpdateHelperIfRequested(arguments []string) bool {
	if len(arguments) == 0 || arguments[0] != update_helper_flag {
		return false
	}
	options, err := parse_update_helper_options(arguments[1:])
	if err == nil {
		err = run_update_helper(options)
	}
	if err != nil {
		write_update_helper_error(options, err)
	}
	return true
}

func parse_update_helper_options(arguments []string) (update_helper_options, error) {
	options := update_helper_options{}
	flag_set := flag.NewFlagSet("threadnote-update-helper", flag.ContinueOnError)
	encoded_arguments := ""
	flag_set.IntVar(&options.parent_pid, "parent-pid", 0, "parent process ID")
	flag_set.StringVar(&options.archive_path, "archive", "", "downloaded update archive")
	flag_set.StringVar(&options.target_path, "target", "", "installed executable path")
	flag_set.StringVar(&encoded_arguments, "arguments", "", "base64url-encoded application arguments")
	if err := flag_set.Parse(arguments); err != nil {
		return options, err
	}
	if options.parent_pid <= 0 || options.archive_path == "" || options.target_path == "" {
		return options, fmt.Errorf("update helper arguments are incomplete")
	}
	data, err := base64.RawURLEncoding.DecodeString(encoded_arguments)
	if err != nil {
		return options, fmt.Errorf("decode application arguments: %w", err)
	}
	if err := json.Unmarshal(data, &options.application_arguments); err != nil {
		return options, fmt.Errorf("parse application arguments: %w", err)
	}
	return options, nil
}

func run_update_helper(options update_helper_options) error {
	parent_process, err := os.FindProcess(options.parent_pid)
	if err != nil {
		return fmt.Errorf("find parent process: %w", err)
	}
	if _, err := parent_process.Wait(); err != nil {
		return fmt.Errorf("wait for parent process: %w", err)
	}
	if err := replace_update_files(options.archive_path, options.target_path); err != nil {
		return err
	}

	command := exec.Command(options.target_path, options.application_arguments...)
	command.Dir = filepath.Dir(options.target_path)
	command.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windows_create_new_process_group | windows_detached_process,
		HideWindow:    true,
	}
	if err := command.Start(); err != nil {
		return fmt.Errorf("restart ThreadNote: %w", err)
	}
	if err := command.Process.Release(); err != nil {
		return fmt.Errorf("release restarted ThreadNote process: %w", err)
	}
	_ = os.Remove(options.archive_path)
	return nil
}

func write_update_helper_error(options update_helper_options, update_err error) {
	log_dir := os.TempDir()
	if options.archive_path != "" {
		log_dir = filepath.Dir(options.archive_path)
	}
	message := fmt.Sprintf("%s update failed: %v\n", time.Now().Format(time.RFC3339), update_err)
	_ = os.WriteFile(filepath.Join(log_dir, "update-helper-error.log"), []byte(message), 0644)
}
