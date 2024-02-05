#!/bin/bash

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
	type="$(echo "$key" | tr a-z A-Z)"

	# sign doc
	# append signature to doc
	# append signature length to doc
fi;

declare isTmp=false;

if [ "$src" = "-" ]; then
	isTmp=true;

	src="$(mktemp)";

	cat > "$src";
fi;

echo "http://127.0.0.1:8080/#$(zopfli --deflate -m "$src" -c | base64 | tr -d '\n')";

if $isTmp; then
	rm -f "$src";
fi;
