package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"vimagination.zapto.org/httpgzip"
	"vimagination.zapto.org/tsserver"
)

type Options struct {
	MarkdownHTML json.RawMessage `json:"markdownHTML,omitempty"`
	Embed        json.RawMessage `json:"embed,omitempty"`
}

type Config struct {
	AllowUnsigned bool `json:"allowUnsigned"`
	Options
	Keys []struct {
		Options
		Name string `json:"name"`
		Hash string `json:"hash"`
		Key  struct {
			Alg    string   `json:"alg"`
			CRV    string   `json:"crv"`
			Ext    bool     `json:"ext"`
			KeyOps []string `json:"key_ops"`
			KTY    string   `json:"kty"`
			X      string   `json:"x"`
			Y      string   `json:"y"`
		} `json:"key"`
	} `json:"keys"`
}

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

	c := config{
		pass: pass,
		opts: "OPTIONS, GET, HEAD",
		path: path,
	}

	http.Handle(http.MethodGet+"/config.json", http.HandlerFunc(c.get))
	http.Handle(http.MethodOptions+"/config.json", http.HandlerFunc(c.options))

	if pass != "" {
		c.opts = "OPTIONS, GET, HEAD, POST"

		http.Handle(http.MethodPost+"/config.json", http.HandlerFunc(c.post))
	}

	http.Handle("/", httpgzip.FileServer(http.FS(tsserver.WrapFS(os.DirFS("./src")))))

	return http.ListenAndServe(":8080", nil)
}

type config struct {
	pass string
	opts string

	path string
}

func (c *config) get(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, c.path)
}

func (c *config) post(w http.ResponseWriter, r *http.Request) {
	_, password, ok := r.BasicAuth()
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)

		io.WriteString(w, "Password Required")

		return
	}

	if c.pass != fmt.Sprintf("%X", sha256.Sum256([]byte(password))) {
		w.WriteHeader(http.StatusForbidden)

		io.WriteString(w, "Invalid Password")

		return
	}

	var conf Config
	if err := json.NewDecoder(r.Body).Decode(&conf); err != nil {
		w.WriteHeader(http.StatusBadRequest)

		io.WriteString(w, err.Error())

		return
	}

	f, err := os.Create(c.path)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)

		io.WriteString(w, err.Error())

		return
	}

	defer f.Close()

	if err := json.NewEncoder(f).Encode(c); err != nil {
		w.WriteHeader(http.StatusInternalServerError)

		io.WriteString(w, err.Error())

		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (c *config) options(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Allow", c.opts)
	w.WriteHeader(http.StatusNoContent)
}

var ErrConfigRequired = errors.New("config location is required")
