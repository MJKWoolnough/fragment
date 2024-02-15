#!/bin/bash

set -euo pipefail;

declare src="-";
declare type="p";
declare key="";

printHelp() {
	cat <<HEREDOC
Usage: $0 [-m MODE] [-s SOURCE] [-k KEY]

-t, --type   File type. Currently supported: m (Markdown), b (BBCode), p (Plain Text), h (HTML), s (SVG), c (CSV), t (TSV).
-s, --source Source file to create fragment from. (default: stdin)
-k, --key    Private key with which to sign the fragment. (default: NONE)
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
	*)
		printHelp;

		exit 1;
	esac;

	shift;
done;

if [ -n "$key" ]; then
	type="$(echo "$type" | tr a-z A-Z)"
fi;

declare tmpFile="$(mktemp)";

{
	echo -n "$type";
	cat "$src";
} > "$tmpFile";

if [ -n "$key" ]; then
	openssl dgst -sha256 -sign "$key" -out - < "$tmpFile" | od -An -t x1 | tr -d ' \n' | {
		read -n 2 sanity;

		if [ "$sanity" != "30" ]; then
			echo "Invalid header byte" >&2;
			exit 1;
		fi;

		read -n 2 fullLen;
		read -n 2 sanity;

		if [ "$sanity" != "02" ]; then
			echo "Invalid r header byte" >&2;
			exit 1;
		fi;

		read -n 2 rLen;

		read -n $(( 2 * 16#$rLen )) r;

		read -n 2 sanity;

		if [ "$sanity" != "02" ]; then
			echo "Invalid s header byte" >&2;
			exit 1;
		fi;

		read -n 2 sLen;

		if [ $(( $fullLen - $rLen - $sLen - 4 )) -ne 0 ]; then
			echo "Invalid length detected" >&2;
			exit 1;
		fi;

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

rm -f "$tmpFile";
