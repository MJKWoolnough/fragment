#!/bin/bash

set -euo pipefail;

declare src="-";
declare type="p";
declare key="";
declare hash="sha256";

printHelp() {
	cat <<HEREDOC
Usage: $0 [-m MODE] [-s SOURCE] [-k KEY [-h HASH]]

-t, --type   File type. Currently supported: m (Markdown), b (BBCode), p (Plain Text), h (HTML), s (SVG), c (CSV), t (TSV).
-s, --source Source file to create fragment from. (default: stdin)
-k, --key    Private key with which to sign the fragment. (default: NONE)
-h, --hash   Hash size to use when signing digest: sha256, sha384, sha512. (default: sha256)
HEREDOC
}

while [ $# -gt 0 ]; do
	case "$1" in
	"-t"|"--type")
		type="$(echo "$2" | tr A-Z a-z)";

		case "$type" in
		"m"|"b"|"p"|"h"|"s"|"c"|"t") ;;
		*)
			{
				echo "Invalid type";
				printHelp;
			} >&2;

			exit 1;
		esac;

		shift;;
	"-s"|"--source")
		src="$2";

		shift;;
	"-k"|"--key")
		key="$2";

		shift;;
	"-h"|"--hash")
		case "$2" in
		"sha256"|"sha384"|"sha512")
			hash="$2";;
		*)
			{
				echo "Invalid hash";
				printHelp;
			} >&2;

			exit 1;;
		esac;

		shift;;
	*)
		printHelp;

		exit 1;;
	esac;

	shift;
done;

if [ -n "$key" ]; then
	type="$(echo "$type" | tr a-z A-Z)"
fi;

declare tmpFile="$(mktemp)";

cleanup() {
	rm -f "$tmpFile";
}

trap cleanup EXIT;

{
	echo -n "$type";
	cat "$src";
} > "$tmpFile";

assert() {
	if [ "$1" != "$2" ]; then
		echo "$3" >&2;
		exit 1;
	fi;
}

if [ -n "$key" ]; then
	openssl dgst -"$hash" -sign "$key" -out - < "$tmpFile" | od -An -t x1 | tr -d ' \n' | {
		read -n 2 sanity;

		assert "$sanity" "30" "Invalid header byte";

		read -n 2 fullLen;
		read -n 2 sanity;

		assert "$sanity" "02" "Invalid r header byte";

		read -n 2 rLen;

		read -n $(( 2 * 16#$rLen )) r;

		read -n 2 sanity;

		assert "$sanity" "02" "Invalid s header byte";

		read -n 2 sLen;

		assert $(( $fullLen - $rLen - $sLen - 4 )) 0 "Invalid length detected";

		read -n $(( 2 * 16#$sLen )) s;

		r="$(echo -n "$r" | sed -e 's/^00//')";
		s="$(echo -n "$s" | sed -e 's/^00//')";

		r="$(printf %0${#s}s "$r")";
		s="$(printf %0${#r}s "$s")";

		echo -n "$r$s" | tr ' ' '0' | while read -n 2 byte; do
			printf \\x"$byte";
		done;

		printf \\$(printf '%03o' $(( ${#r} >> 8 )))
		printf \\$(printf '%03o' $(( ${#s} & 255 )));
	} >> "$tmpFile";
fi;

echo "http://127.0.0.1:8080/#$(zopfli --deflate -m "$tmpFile" -c | base64 | tr -d '\n')";
