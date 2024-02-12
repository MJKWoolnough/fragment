import type {Phrase, Phraser, PhraserFn, Token, TokenFn, Tokeniser} from './lib/parser.js';
import parseBBCode from './lib/bbcode.js';
import {all as allBBCodeTags} from './lib/bbcode_tags.js';
import {HTTPRequest} from './lib/conn.js';
import {amendNode} from './lib/dom.js';
import {a, body, br, head, html, title, script, style} from './lib/html.js';
import pageLoad from './lib/load.js';
import parseMarkdown from './lib/markdown.js';
import parser from './lib/parser.js';
import {Arr, Bool, Obj, Or, Str, Tuple, Val} from './lib/typeguard.js';

type Children = string | Element | Children[];

const hash = window.location.hash.slice(1),
      withMime = (data: BlobPart, mime: string) => {
	const blob = new Blob([data], {"type": mime}),
	      url = URL.createObjectURL(blob);

	window.location.href = url;
      },
      decodeText = (data: Uint8Array) => (new TextDecoder()).decode(data),
      processBBCode = (data: string) => parseBBCode(allBBCodeTags, data),
      processToHTML = (data: Uint8Array, fn: (contents: string) => DocumentFragment) => {
	let dom: Element | DocumentFragment = fn(decodeText(data)),
	    headElement: HTMLHeadElement | null = null,
	    bodyElement: HTMLBodyElement | null = null,
	    hasTitle = false;

	if (dom.children.length === 1) {
		switch (dom.children[0].nodeName) {
		default:
			dom = body(dom);
		case "BODY":
			dom = html(bodyElement = dom as HTMLBodyElement);

			break;
		case "HTML":
			for (const c of dom.children) {
				if (c instanceof HTMLBodyElement) {
					bodyElement = c;

					break;
				}
			}
		}
	} else {
		dom = html(bodyElement = body(dom));
	}

	for (const hc of (dom as HTMLHtmlElement).children) {
		if (hc instanceof HTMLHeadElement) {
			headElement = hc;

			for (const c of hc.children) {
				if (c instanceof HTMLTitleElement) {
					hasTitle = true;

					break;
				}
			}

			break;
		}
	}

	if (!hasTitle) {
		const titleText = bodyElement!.firstChild instanceof HTMLHeadingElement ? bodyElement!.firstChild.textContent  : "";

		if (titleText) {
			if (!headElement) {
				dom.insertBefore(head(title(titleText)), bodyElement!);
			} else {
				amendNode(headElement, title(titleText));
			}
		}
	}

	withMime("<!DOCTYPE html>\n" + (dom as HTMLHtmlElement).outerHTML, "text/html");
      },
      makeTable = (data: string[][]) => {
	const appendChildren = (elem: Element, child: Children) => {
		if (typeof child === "string") {
			elem.textContent = child;
		} else if (child instanceof Array) {
			for (const c of child) {
				appendChildren(elem, c);
			}
		} else {
			elem.append(child);
		}
	      },
	      createElement = <E extends keyof HTMLElementTagNameMap>(name: E, child?: Children, params?: Record<string, string | Function>): HTMLElementTagNameMap[E] => {
		const elem = document.createElement(name);

		for (const [param, val] of Object.entries(params ?? {})) {
			if (val instanceof Function) {
				elem.addEventListener(param.slice(2) as keyof ElementEventMap, val as EventListener);
			} else {
				elem.setAttribute(param, val);
			}
		}

		if (child) {
			appendChildren(elem, child);
		}

		return elem;
	      },
	      max = data.reduce((n, r) => Math.max(n, r.length), 0),
	      colName = (n: number): string => {
		if (n < 26) {
			return String.fromCharCode(64 + (n || 26));
		}

		const q = n / 26 | 0,
		      r = n % 26;

		return (r ? colName(q) : (q !== 1 ? colName(q - 1) : "")) + colName(r);
	      },
	      stringSort = new Intl.Collator().compare,
	      numberSort = (a: string, b: string) => parseFloat(a || "-Infinity") - parseFloat(b || "-Infinity"),
	      sorters = Array.from({"length": max}, (_, n) => data.every(row => row.length < n || !isNaN(parseFloat(row[n]))) ? numberSort : stringSort),
	      tbody = createElement("tbody", data.map((row, n) => createElement("tr", row.map(cell => createElement("td", cell)).concat(Array.from({"length": max - row.length}, _ => createElement("td"))), {"data-id": n+""})));

	let sorted = -1,
	    exportChar = ",";

	document.body.append(
		createElement("button", "Reset Table", {"onclick": () => {
			sorted = -1;

			document.body.classList.remove("b");
			document.getElementsByClassName("s")[0]?.removeAttribute("class");

			tbody.append(...Array.from(tbody.children).sort((a: Element, b: Element) => parseInt((a as HTMLElement).dataset["id"]!) - parseInt((b as HTMLElement).dataset["id"]!)));
		}}),
		createElement("table", [
			createElement("thead", Array.from({"length": max}, (_, n) => createElement("th", colName(n + 1), {"onclick": function (this: Element) {
				const classes = this.classList;

				document.body.classList.toggle("b", true);

				if (n !== sorted) {
					document.getElementsByClassName("s")[0]?.removeAttribute("class");

					classes.add("s");
					sorted = n;

					tbody.append(...Array.from(tbody.children).sort((a, b) => sorters[n](a.children[n]?.textContent ?? "", b.children[n]?.textContent ?? "")))
				} else {
					classes.toggle("r");

					tbody.append(...Array.from(tbody.children).reverse())
				}
			}}))),
			tbody
		]),
		createElement("label", "CSV", {"for": "C"}),
		createElement("input", "", {"id": "C", "type": "radio", "checked": "", "name":"E", "onclick": () => exportChar = ","}),
		createElement("label", "TSV", {"for": "T"}),
		createElement("input", "", {"id": "T", "type": "radio", "name":"E", "onclick": () => exportChar = "\t"}),
		createElement("button", "Export Table", {"onclick": () => createElement("a", "", {"href": URL.createObjectURL(new Blob([Array.from(tbody.children).map(row => data[parseInt((row as HTMLElement).dataset["id"]!)].map(cell => `"${cell.replaceAll('"', '""')}"`).join(exportChar)).join("\n")], {"type": "text/csv;charset=utf-8"})), "download": "table.csv"}).click()})
	);
      },
      parseCSV = (contents: Uint8Array, delim = ",") => {
	const tokenCell = 1,
	      tokenNL = 2,
	      tokenRow = 3,
	      table: string[][] = [],
	      skipChar = (tk: Tokeniser) => {
		if (tk.next() === "\n") {
			return tk.return(tokenNL, parseCell);
		}

		tk.get();

		return parseCell(tk);
	      },
	      parseCell = (tk: Tokeniser): [Token, TokenFn] => {
		if (!tk.peek()) {
			return tk.done();
		}
		if (tk.accept("\"")) {
			while (true) {
				switch (tk.exceptRun("\"")) {
				default:
					return tk.return(tokenCell);
				case "\"":
					tk.next();

					if (!tk.accept("\"")) {
						return tk.return(tokenCell, skipChar);
					}
				}
			}
		}

		tk.exceptRun(delim+"\n");

		return tk.return(tokenCell, skipChar);
	      },
	      skipNL = (p: Phraser) => {
		p.next();
		p.get();

		return parseRow(p);
	      },
	      parseRow = (p: Phraser): [Phrase, PhraserFn] => {
		if (p.exceptRun(tokenNL) < 0) {
			return p.return(tokenRow);
		}

		return p.return(tokenRow, skipNL);
	      }

	for (const row of parser(decodeText(contents).trimEnd(), parseCell, parseRow)) {
		if (row.type < 0){
			break;
		}

		const r: string[] = [];

		for (const cell of row.data) {
			if (cell.type !== tokenNL) {
				r.push(cell.data[0] === "\"" ? cell.data.slice(1, -1).replace("\"\"", "\"")  : cell.data);
			}
		}

		table.push(r);
	}

	withMime("<!DOCTYPE html>\n" + html([
			head([
				title("Table"),
				style({"type": "text/css"}, `table{background-color:#f8f8f8;color:#000;border-collapse: collapse}th{padding:0.5em 1.5em;background-color: #ddd}th,td{border:1px solid #000;cursor:pointer;user-select:none}th:hover{text-decoration: underline}th.s{background-repeat: no-repeat;background-position: right 0px bottom 0.5em;background-size: 1em 1em;background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'%3E%3Cpath d='M1,1 h38 l-19,18 z' fill='%23f00' stroke='%23000' stroke-linejoin='round' /%3E%3C/svg%3E%0A")}th.r{background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'%3E%3Cpath d='M1,19 h38 l-19,-18 z' fill='%23f00' stroke='%23000' stroke-linejoin='round' /%3E%3C/svg%3E%0A")}body:not(.b) br+button{visibility:hidden}`),
				script({"type": "module"}, `(${makeTable.toString()})(${JSON.stringify(table)})`),
			]),
			body([
				a({"href": window.location + ""}, "Link to this Table"),
				br()
			])
		]).outerHTML,
		"text/html"
	);
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
	const type = String.fromCharCode(data[0]);

	switch (type) {
	case 'P':
	case 'H':
	case 'S':
	case 'M':
	case 'B':
	case 'C':
	case 'T':
		if (!window.isSecureContext) {
			return Promise.reject("Cannot handle signed data in insecure mode");
		}

		const isStr = Str(),
		      keysTG = Arr(Obj({
			"hash": Or(Val("SHA-256"), Val("SHA-384"), Val("SHA-512")),
			"key": Obj({
				"alg": isStr,
				"crv": isStr,
				"ext": Bool(),
				"key_ops": Tuple(Val("verify")),
				"kty": isStr,
				"x": isStr,
				"y": isStr
			})
		      })),
		      signatureLen = data.at(-2)! << 8 | data.at(-1)!,
		      signedData = data.slice(0, -signatureLen - 2),
		      signature = data.slice(-signatureLen - 2, -2);

		return HTTPRequest("keys.json", {"response": "json", "checker": keysTG})
		.then(keys => Promise.any(keys.map(key => window.crypto.subtle.importKey("jwk", key.key, {"name": "ECDSA", "namedCurve": key.key.crv}, true, ["verify"])
			.then(ck => window.crypto.subtle.verify({"name": "ECDSA", "hash": key.hash}, ck, signature, signedData))
			.then(r => r || Promise.reject(""))
		)))
		.catch(() => Promise.reject("Unable to verify signature"))
		.then(() => {
			signedData[0] = type.toLowerCase().charCodeAt(0);

			return signedData;
		});
	}

	return data;
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

	return Promise.reject("Unknown content type");
})
.catch(err => document.body.textContent = "Error: " + err);
