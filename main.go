package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)

		os.Exit(1)
	}
}

func run() error {
	var path, pass string

	flag.StringVar(&pass, "p", os.Getenv("CONFIG_PASS"), "SHA256 password hash for config changes")
	flag.StringVar(&path, "c", os.Getenv("CONFIG_FILE"), "Configuration File")
	flag.Parse()

	c, err := NewConfigHandler(path, pass)
	if err != nil {
		return err
	}

	http.Handle("/config.json", c)
	http.Handle("/", index)

	return http.ListenAndServe(":8080", nil)
}
