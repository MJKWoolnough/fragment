import pageLoad from './lib/load.js';
import parseMarkdown from './lib/markdown.js';
import parseBBCode from './lib/bbcode.js';
import {all as allBBCodeTags} from './lib/bbcode_tags.js';

const hash = window.location.hash.slice(1),
      withMime = (data: BlobPart, mime: string) => {
	const blob = new Blob([data], {"type": mime}),
	      url = URL.createObjectURL(blob);

	window.location.href = url;
      },
      processMarkdown = (data: Uint8Array) => {
	const decoder = new TextDecoder(),
	      dom = parseMarkdown(decoder.decode(data)),
	      div = document.createElement("div");

	div.appendChild(dom);

	withMime(div.innerHTML, "text/html");
      },
      processBBCode = (data: Uint8Array) => {
	const decoder = new TextDecoder(),
	      dom = parseBBCode(allBBCodeTags, decoder.decode(data)),
	      div = document.createElement("div");

	div.appendChild(dom);

	withMime(div.innerHTML, "text/html");
      };

pageLoad.then(() => hash ? fetch("data:application/octet-stream;base64," + hash) : Promise.reject("No Fragment"))
.then(data => data.blob())
.then(b => b.stream().pipeThrough<Uint8Array>(new DecompressionStream("deflate-raw")).getReader())
.then(reader => {
	let data = new Uint8Array(0);

	const appendText =({done, value}: ReadableStreamReadResult<Uint8Array>): Promise<Uint8Array> => {
		if (done) {
			return Promise.resolve(data);
		} else {
			const newData = new Uint8Array(data.length + value.length);

			newData.set(data);
			newData.set(value, data.length);

			data = newData;

			return reader.read().then(appendText);
		}
	      };

	return reader.read().then(appendText);
})
.then(data => {
	if (!data.length) {
		return Promise.reject("No Data");
	}

	const type = String.fromCharCode(data[0]),
	      contents = data.slice(1);

	switch (type) {
	case 'p':
		return withMime(contents, "text/plain");
	case 'h':
		return withMime(contents, "text/html");
	case 's':
		return withMime(contents, "image/svg+xml");
	case 'm':
		return processMarkdown(contents);
	case 'b':
		return processBBCode(contents);
	case 'c':
	case 't':
	}
})
.catch(err => document.body.textContent = "Error: " + err);
