package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sync"
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

type Error struct {
	Code int
	error
}

type ConfigHandler struct {
	pass string
	opts string

	sync.RWMutex
	path string
}

func (c *ConfigHandler) Get(w http.ResponseWriter, r *http.Request) {
	c.RLock()
	defer c.RUnlock()

	http.ServeFile(w, r, c.path)
}

func (c *ConfigHandler) Post(w http.ResponseWriter, r *http.Request) {
	if err := c.post(w, r); err != nil {
		var errc Error

		if errors.As(err, &errc) {
			http.Error(w, errc.Error(), errc.Code)

			return
		}

		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (c *ConfigHandler) post(w http.ResponseWriter, r *http.Request) error {
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

func (c *ConfigHandler) Options(w http.ResponseWriter, _ *http.Request) {
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
