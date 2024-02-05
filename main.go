package main

import (
	"net/http"
	"os"

	"vimagination.zapto.org/httpgzip"
	"vimagination.zapto.org/tsserver"
)

func main() {
	http.ListenAndServe(":8080", httpgzip.FileServer(http.FS(tsserver.WrapFS(os.DirFS("./src")))))
}
