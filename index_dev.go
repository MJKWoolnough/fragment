//go:build dev
// +build dev

package main

import (
	"net/http"
	"os"

	"vimagination.zapto.org/httpgzip"
	"vimagination.zapto.org/tsserver"
)

var index = httpgzip.FileServer(http.FS(tsserver.WrapFS(os.DirFS("./src"))))
