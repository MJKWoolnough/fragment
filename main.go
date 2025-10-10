package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"

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

	http.Handle(http.MethodGet+"/config.json", http.HandlerFunc(c.Get))
	http.Handle(http.MethodOptions+"/config.json", http.HandlerFunc(c.Options))

	if pass != "" {
		c.opts = "OPTIONS, GET, HEAD, POST"

		http.Handle(http.MethodPost+"/config.json", http.HandlerFunc(c.Post))
	}

	http.Handle("/", httpgzip.FileServer(http.FS(tsserver.WrapFS(os.DirFS("./src")))))

	return http.ListenAndServe(":8080", nil)
}

type Error struct {
	Code int
	error
}

type config struct {
	pass string
	opts string

	sync.RWMutex
	path string
}

func (c *config) Get(w http.ResponseWriter, r *http.Request) {
	c.RLock()
	defer c.RUnlock()

	http.ServeFile(w, r, c.path)
}

func (c *config) Post(w http.ResponseWriter, r *http.Request) {
	if err := c.post(w, r); err != nil {
		var errc Error

		if errors.As(err, &errc) {
			http.Error(w, errc.Error(), errc.Code)

			return
		}

		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (c *config) post(w http.ResponseWriter, r *http.Request) error {
	_, password, ok := r.BasicAuth()
	if !ok {
		return ErrPasswordRequiredCode
	}

	if c.pass != fmt.Sprintf("%X", sha256.Sum256([]byte(password))) {
		return ErrInvalidPasswordCode
	}

	c.Lock()
	defer c.Unlock()

	var conf Config
	if err := json.NewDecoder(r.Body).Decode(&conf); err != nil {
		return Error{
			Code:  http.StatusBadRequest,
			error: err,
		}
	}

	f, err := os.Create(c.path)
	if err != nil {
		return err
	}

	defer f.Close()

	if err := json.NewEncoder(f).Encode(c); err != nil {
		return err
	}

	w.WriteHeader(http.StatusNoContent)

	return nil
}

func (c *config) Options(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Allow", c.opts)
	w.WriteHeader(http.StatusNoContent)
}

var (
	ErrConfigRequired   = errors.New("config location is required")
	ErrPasswordRequired = errors.New("password required")
	ErrInvalidPassword  = errors.New("invalid password")

	ErrPasswordRequiredCode = Error{
		Code:  http.StatusForbidden,
		error: ErrPasswordRequired,
	}
	ErrInvalidPasswordCode = Error{
		Code:  http.StatusForbidden,
		error: ErrInvalidPassword,
	}
)
