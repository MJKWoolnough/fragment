import type {Token, TokenFn, Tokeniser} from './lib/parser.js';
import pageLoad from './lib/load.js';
import parseMarkdown from './lib/markdown.js';
import parseBBCode from './lib/bbcode.js';
import {all as allBBCodeTags} from './lib/bbcode_tags.js';
import parser from './lib/parser.js';

const hash = window.location.hash.slice(1),
      withMime = (data: BlobPart, mime: string) => {
	const blob = new Blob([data], {"type": mime}),
	      url = URL.createObjectURL(blob);

	window.location.href = url;
      },
      decodeText = (data: Uint8Array) => (new TextDecoder()).decode(data),
      processBBCode = (data: string) => parseBBCode(allBBCodeTags, data),
      processToHTML = (data: Uint8Array, fn: (contents: string) => DocumentFragment) => {
	const div = createElement("div");

	div.appendChild(fn(decodeText(data)));

	withMime(div.innerHTML, "text/html");
      },
      createElement = (name: string | Element, child?: Element) => {
	const elem = name instanceof Element ? name : document.createElement(name);

	return child ? elem.appendChild(child) : elem;
      },
      parseCSV = (contents: Uint8Array, delim = " ") => {
	const tokenCell = 1,
	      tokenNL = 2,
	      tokenRow = 3,
	      table = createElement("table", createElement("tbody")),
	      skipChar = (tk: Tokeniser) => {
		tk.next();

		tk.get();

		return parseCell(tk);
	      },
	      parseCell = (tk: Tokeniser): [Token, TokenFn] => {
		if (!tk.peek()) {
			return tk.done();
		}
		if (tk.accept("\n")) {
			return tk.return(tokenNL, skipChar);
		}
		if (tk.accept("\"")) {
			while (true) {
				switch (tk.exceptRun("\"")) {
				default:
					return tk.return(tokenCell);
				case "\"":
					tk.next();

					if (tk.peek() !== "\"") {
						return tk.return(tokenCell, skipChar);
					}

					tk.next();
				}
			}
		}

		tk.exceptRun(delim);

		return tk.return(tokenCell, skipChar);
	      };

	for (const row of parser(decodeText(contents), parseCell, p => {
		p.exceptRun(tokenNL);
		p.next();

		return p.return(tokenRow);
	})) {
		const tr = createElement(table, createElement("tr"))

		for (const cell of row.data) {
			if (cell.type !== tokenNL) {
				createElement(tr, createElement("td")).textContent = cell.data.charAt(0) === "\"" ? cell.data.slice(1, -1).replaceAll("\"\"", "\"") : cell.data;
			}
		}
	}

	withMime(table.outerHTML, "text/html");
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
		return processToHTML(contents, parseMarkdown);
	case 'b':
		return processToHTML(contents, processBBCode);
	case 'c':
		return parseCSV(contents);
	case 't':
		return parseCSV(contents, "\t");
	}
})
.catch(err => document.body.textContent = "Error: " + err);
