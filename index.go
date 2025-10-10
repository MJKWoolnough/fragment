//go:build !dev
// +build !dev

package main

import (
	_ "embed"
	"time"

	"vimagination.zapto.org/httpembed"
)

//go:embed index.html.gz
var indexHTML []byte

var index = httpembed.HandleBuffer("index.html", indexHTML, 66442, time.Unix(1760082260, 0))
