package main

import (
	"crypto/sha256"
	"encoding/json"
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
	MarkdownHTML *[][]string `json:"markdownHTML"`
	Embed        *bool       `json:"embed,omitempty"`
}

type Config struct {
	Options
	Keys []struct {
		Options
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
	var config, pass string

	flag.StringVar(&pass, "p", os.Getenv("CONFIG_PASS"), "SHA256 password hash for config changes")
	flag.StringVar(&config, "c", os.Getenv("CONFIG_FILE"), "Configuration File")
	flag.Parse()

	pass = strings.ToUpper(pass)

	if config != "" {
		http.Handle(http.MethodGet+" /config.json", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.ServeFile(w, r, config)
		}))

		if pass != "" {
			http.Handle(http.MethodOptions+" /config.json", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Allow", "OPTIONS, GET, HEAD, POST")
				w.WriteHeader(http.StatusNoContent)
			}))

			http.Handle(http.MethodPost+" /config.json", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, password, ok := r.BasicAuth()
				if !ok {
					w.WriteHeader(http.StatusUnauthorized)

					io.WriteString(w, "Password Required")

					return
				}

				if pass != fmt.Sprintf("%X", sha256.Sum256([]byte(password))) {
					w.WriteHeader(http.StatusForbidden)

					io.WriteString(w, "Invalid Password")

					return
				}

				var c Config
				if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
					w.WriteHeader(http.StatusBadRequest)

					io.WriteString(w, err.Error())

					return
				}

				f, err := os.Create(config)
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
			}))

		}
	}

	http.Handle("/", httpgzip.FileServer(http.FS(tsserver.WrapFS(os.DirFS("./src")))))

	http.ListenAndServe(":8080", nil)
}
