package main

import (
	"os"

	"example/simple/internal/entrypoint"
)

var Version = "1.0.0"

func main() {
	os.Exit(entrypoint.RunMCP(os.Args[1:], os.Stdin, os.Stdout, os.Stderr, Version))
}
