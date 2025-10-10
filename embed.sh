#!/bin/bash

(
	cd "src";
	head -n1 index.html;
	head -n5 index.html | tail -n+2 | tr -d '\n\t';
	echo -n "<script type=\"module\">";
	jspacker -i "/$(grep "<script" index.html | sed -e 's/.*src="\([^"]*\)".*/\1/')" -n | if command -v terser > /dev/null; then terser -m  --module --compress pure_getters,passes=3 --ecma 2020 | tr -d '\n'; else tr -d '\n\t'; fi;
	echo -n "</script>";
	tail -n2 index.html | tr -d '\n	';
) > "index.html";

declare size="$(stat -c %s index.html)";

if command -v zopfli > /dev/null; then
	zopfli -m index.html;
	rm -f index.html;
else
	gzip -f -9 index.html;
fi;

declare time="$(stat -c %Y index.html.gz)"

cat > index.go <<HEREDOC
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

var index = httpembed.HandleBuffer("index.html", indexHTML, $size, time.Unix($time, 0))
HEREDOC
