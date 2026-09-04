// Package entrypoint selects the non-desktop ThreadNote process modes.
package entrypoint

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	jsonrpcadapter "example/simple/internal/adapter/jsonrpc"
	"example/simple/internal/adapter/mcp"
	"example/simple/internal/service"
)

const vault_environment_name = "THREADNOTE_VAULT"

// Run handles a top-level non-desktop command. handled is false when the
// desktop application should continue starting.
func Run(arguments []string, input io.Reader, output io.Writer, error_output io.Writer, version string) (handled bool, exit_code int) {
	if len(arguments) == 0 {
		return false, 0
	}
	switch arguments[0] {
	case "cli":
		return true, RunCLI(arguments[1:], input, output, error_output)
	case "jsonrpc":
		return true, RunJSONRPC(arguments[1:], input, output, error_output)
	case "mcp":
		return true, RunMCP(arguments[1:], input, output, error_output, version)
	case "help", "--help", "-h":
		write_root_usage(output)
		return true, 0
	default:
		return false, 0
	}
}

// RunCLI invokes one capability and prints its JSON result.
func RunCLI(arguments []string, input io.Reader, output io.Writer, error_output io.Writer) int {
	flag_set := flag.NewFlagSet("threadnote cli", flag.ContinueOnError)
	flag_set.SetOutput(error_output)
	vault_path := flag_set.String("vault", os.Getenv(vault_environment_name), "vault directory; defaults to the last active vault")
	input_json := flag_set.String("input", "{}", "capability input JSON, or - to read stdin")
	compact := flag_set.Bool("compact", false, "write compact JSON")
	if err := flag_set.Parse(arguments); err != nil {
		return 2
	}
	positionals := flag_set.Args()
	if len(positionals) == 0 || positionals[0] == "help" {
		write_cli_usage(output)
		return 0
	}
	capability_service, err := service.OpenCapabilityService(*vault_path)
	if err != nil {
		fmt.Fprintln(error_output, err)
		return 1
	}
	if positionals[0] == "capabilities" || positionals[0] == "list-capabilities" {
		if err := write_json(output, map[string]interface{}{"capabilities": capability_service.Capabilities()}, *compact); err != nil {
			fmt.Fprintln(error_output, err)
			return 1
		}
		return 0
	}
	capability_name, err := cli_capability_name(positionals)
	if err != nil {
		fmt.Fprintln(error_output, err)
		write_cli_usage(error_output)
		return 2
	}
	raw_input := []byte(*input_json)
	if *input_json == "-" {
		raw_input, err = io.ReadAll(input)
		if err != nil {
			fmt.Fprintln(error_output, err)
			return 1
		}
	}
	result, err := capability_service.Invoke(context.Background(), capability_name, raw_input)
	if err != nil {
		fmt.Fprintln(error_output, err)
		return 1
	}
	if err := write_json(output, result, *compact); err != nil {
		fmt.Fprintln(error_output, err)
		return 1
	}
	return 0
}

// RunJSONRPC serves the capability catalog over newline-delimited JSON-RPC.
func RunJSONRPC(arguments []string, input io.Reader, output io.Writer, error_output io.Writer) int {
	flag_set := flag.NewFlagSet("threadnote jsonrpc", flag.ContinueOnError)
	flag_set.SetOutput(error_output)
	vault_path := flag_set.String("vault", os.Getenv(vault_environment_name), "vault directory; defaults to the last active vault")
	if err := flag_set.Parse(arguments); err != nil {
		return 2
	}
	if len(flag_set.Args()) > 0 {
		fmt.Fprintln(error_output, "jsonrpc does not accept positional arguments")
		return 2
	}
	capability_service, err := service.OpenCapabilityService(*vault_path)
	if err != nil {
		fmt.Fprintln(error_output, err)
		return 1
	}
	if err := jsonrpcadapter.Serve(context.Background(), capability_service, input, output); err != nil {
		fmt.Fprintln(error_output, err)
		return 1
	}
	return 0
}

// RunMCP serves the capability catalog as MCP tools over stdio.
func RunMCP(arguments []string, input io.Reader, output io.Writer, error_output io.Writer, version string) int {
	flag_set := flag.NewFlagSet("threadnote mcp", flag.ContinueOnError)
	flag_set.SetOutput(error_output)
	vault_path := flag_set.String("vault", os.Getenv(vault_environment_name), "vault directory; defaults to the last active vault")
	if err := flag_set.Parse(arguments); err != nil {
		return 2
	}
	if len(flag_set.Args()) > 0 {
		fmt.Fprintln(error_output, "mcp does not accept positional arguments")
		return 2
	}
	capability_service, err := service.OpenCapabilityService(*vault_path)
	if err != nil {
		fmt.Fprintln(error_output, err)
		return 1
	}
	if err := mcp.Serve(context.Background(), mcp_capability_adapter(capability_service), input, output, version); err != nil {
		fmt.Fprintln(error_output, err)
		return 1
	}
	return 0
}

func mcp_capability_adapter(capability_service *service.CapabilityService) mcp.CapabilityAdapter {
	definitions := capability_service.Capabilities()
	tools := make([]mcp.Tool, 0, len(definitions))
	for _, definition := range definitions {
		tools = append(tools, mcp.Tool{
			Annotations: definition.Annotations,
			Description: definition.Description,
			InputSchema: definition.InputSchema,
			Name:        definition.Name,
		})
	}
	return mcp.CapabilityAdapter{Invoke: capability_service.Invoke, Tools: tools}
}

func cli_capability_name(positionals []string) (string, error) {
	if len(positionals) > 0 && positionals[0] == "call" {
		positionals = positionals[1:]
	}
	if len(positionals) == 1 && strings.Contains(positionals[0], ".") {
		return normalize_cli_name(positionals[0]), nil
	}
	if len(positionals) == 2 {
		return normalize_cli_name(positionals[0]) + "." + normalize_cli_name(positionals[1]), nil
	}
	return "", fmt.Errorf("expected a capability name or <domain> <action>")
}

func normalize_cli_name(value string) string {
	return strings.ReplaceAll(strings.TrimSpace(value), "-", "_")
}

func write_json(output io.Writer, value interface{}, compact bool) error {
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	if !compact {
		encoder.SetIndent("", "  ")
	}
	return encoder.Encode(value)
}

func write_root_usage(output io.Writer) {
	fmt.Fprintln(output, "ThreadNote commands:")
	fmt.Fprintln(output, "  threadnote cli [options] <capability>")
	fmt.Fprintln(output, "  threadnote jsonrpc [--vault PATH]")
	fmt.Fprintln(output, "  threadnote mcp [--vault PATH]")
	fmt.Fprintln(output, "Without a command, ThreadNote starts the desktop application.")
}

func write_cli_usage(output io.Writer) {
	fmt.Fprintln(output, "Usage:")
	fmt.Fprintln(output, "  threadnote cli [--vault PATH] capabilities")
	fmt.Fprintln(output, "  threadnote cli [--vault PATH] [--input JSON|-] call memo.list")
	fmt.Fprintln(output, "  threadnote cli [--vault PATH] [--input JSON|-] task create")
}
