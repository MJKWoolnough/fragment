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
	declare signature="$(mktemp)";

	openssl dgst -sha256 -sign "$key" -out "$signature" < "$tmpFile";

	declare rLen="$(od -An -t u1 -j 3 -N 1 "$signature" | tr -d ' ')";
	declare rOne="$(od -An -t u1 -j 4 -N 1 "$signature" | tr -d ' ')";
	declare sLen="$(od -An -t u1 -j "$(( $rLen + 5 ))" -N 1 "$signature" | tr -d ' ')";
	declare sOne="$(od -An -t u1 -j "$(( $rLen + 6 ))" -N 1 "$signature" | tr -d ' ')";
	declare rStart=4;
	declare sStart=$(( $rLen + 6 ))

	if [ "$rOne" = "0" ]; then
		let "rStart++";
		let "rLen--";
	fi;

	if [ "$sOne" = "0" ]; then
		let "sStart++";
		let "sLen--";
	fi;

	declare len="$({
		while [ $rLen -lt $sLen ]; do
			let "rLen++";
			echo -en "\0";
		done;

		cut -b "$(( $rStart + 1 ))-$(( $rStart + $rLen ))" < "$signature" | sed -z '$ s/\n$//';

		while [ $sLen -lt $rLen ]; do
			let "sLen++";
			echo -en "\0";
		done;
		cut -b "$(( $sStart + 1 ))-" < "$signature" | sed -z '$ s/\n$//';
	} | tee -a "$tmpFile" | wc -c)";

	printf \\$(printf '%03o' $(( $len >> 8 ))) >> "$tmpFile";
	printf \\$(printf '%03o' $(( $len & 255 ))) >> "$tmpFile";

	rm -f "$signature";
fi;

echo "http://127.0.0.1:8080/#$(zopfli --deflate -m "$tmpFile" -c | base64 | tr -d '\n')";

rm -f "$tmpFile";
