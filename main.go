package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"

	"vimagination.zapto.org/httpgzip"
	"vimagination.zapto.org/tsserver"
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

	if path == "" {
		return ErrConfigRequired
	}

	pass = strings.ToUpper(pass)

	c := ConfigHandler{
		pass: pass,
		opts: "OPTIONS, GET, HEAD",
		path: path,
	}

	http.Handle(http.MethodGet+"/config.json", http.HandlerFunc(c.Get))
	http.Handle(http.MethodOptions+"/config.json", http.HandlerFunc(c.Options))

	if pass != "" {
		c.opts = "OPTIONS, GET, HEAD, POST"

		http.Handle(http.MethodPost+"/config.json", http.HandlerFunc(c.Post))
	}

	http.Handle("/", httpgzip.FileServer(http.FS(tsserver.WrapFS(os.DirFS("./src")))))

	return http.ListenAndServe(":8080", nil)
}
