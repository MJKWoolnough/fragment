import type {Phrase, Phraser, PhraserFn, Token, TokenFn, Tokeniser} from './lib/parser.js';
import parseBBCode from './lib/bbcode.js';
import {all as allBBCodeTags} from './lib/bbcode_tags.js';
import {HTTPRequest} from './lib/conn.js';
import {amendNode} from './lib/dom.js';
import {a, body, br, head, html, script, style, title} from './lib/html.js';
import pageLoad from './lib/load.js';
import parseMarkdown from './lib/markdown.js';
import {text2DOM} from './lib/misc.js';
import parser from './lib/parser.js';
import {Arr, Bool, Obj, Or, Str, Tuple, Val} from './lib/typeguard.js';

const hash = window.location.hash.slice(1),
      titleText = document.title,
      withMime = (data: BlobPart, mime: string) => window.location.href = URL.createObjectURL(new Blob([data], {"type": mime})),
      htmlDoctype = "<!DOCTYPE html>\n",
      decodeText = (data: Uint8Array) => (new TextDecoder()).decode(data),
      favicon = () => document.getElementsByTagName("link")[0]!.cloneNode(),
      processBBCode = (data: string) => parseBBCode(allBBCodeTags, data),
      processToHTML = (data: Uint8Array, fn: (contents: string) => DocumentFragment) => {
	const dom = fn(decodeText(data)),
	      firstChild = dom.children[0],
	      htmlElement = dom.children.length === 1 ? firstChild instanceof HTMLHtmlElement ? firstChild : firstChild instanceof HTMLBodyElement ? html(firstChild) : html(body(dom)) : html(body(dom)),
	      htmlChildren = Array.from(htmlElement.children),
	      bodyElement = htmlChildren.find(e => e instanceof HTMLBodyElement) as HTMLBodyElement | null ?? null,
	      headElement = htmlChildren.find(e => e instanceof HTMLHeadElement) as HTMLHeadElement | null ?? htmlElement.insertBefore(head(), bodyElement),
	      headChildren = Array.from(headElement.children);

	if (!headChildren.some(e => e instanceof HTMLTitleElement)) {
		amendNode(headElement, title(bodyElement?.firstChild instanceof HTMLHeadingElement ? bodyElement.firstChild.textContent ?? titleText : titleText));
	}

	if (!headChildren.some(e => e instanceof HTMLLinkElement && e.getAttribute("rel") === "shortcut icon")) {
		amendNode(headElement, favicon());
	}

	withMime(htmlDoctype + htmlElement.outerHTML, "text/html");
      },
      makeTable = (data: string[][]) => {
	type Children = string | Element | Children[];

	type DOMBind<T extends Element> = (child?: Children, params?: Record<string, string | Function>) => T;

	const appendChildren = (elem: Element, child: Children) => {
		if (child instanceof Array) {
			for (const c of child) {
				appendChildren(elem, c);
			}
		} else {
			elem.append(child);
		}
	      },
	      amendNode = <E extends Element>(elem: E, child?: Children, params?: Record<string, string | Function>): E => {
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
	      [a, button, div, input, label, li, table, tbody, td, th, thead, tr, ul] = "a button div input label li table tbody td th thead tr ul".split(" ").map(e => (child?: Children, params?: Record<string, string | Function>) => amendNode(document.createElement(e), child, params)) as [DOMBind<HTMLElementTagNameMap["a"]>, DOMBind<HTMLElementTagNameMap["button"]>, DOMBind<HTMLElementTagNameMap["div"]>, DOMBind<HTMLElementTagNameMap["input"]>, DOMBind<HTMLElementTagNameMap["label"]>, DOMBind<HTMLElementTagNameMap["li"]>, DOMBind<HTMLElementTagNameMap["table"]>, DOMBind<HTMLElementTagNameMap["tbody"]>, DOMBind<HTMLElementTagNameMap["td"]>, DOMBind<HTMLElementTagNameMap["th"]>, DOMBind<HTMLElementTagNameMap["thead"]>, DOMBind<HTMLElementTagNameMap["tr"]>, DOMBind<HTMLElementTagNameMap["ul"]>],
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
	      sorters = Array.from({"length": max}, (_, n) => data.every(row => row.length < n || !isNaN(parseFloat(row[n] || "0"))) ? numberSort : stringSort),
	      dataMap = new Map<HTMLTableRowElement, string[]>(),
	      tbodyElement = tbody(data.map(row => {
		const rowElm = tr(row.map(cell => td(cell)).concat(Array.from({"length": max - row.length}, _ => td())));

		dataMap.set(rowElm, row);

		return rowElm;
	      })),
	      filterDivs = new Map<number, HTMLDivElement>(),
	      isBlankFilter = (s: string) => !s,
	      isNotBlankFilter = (s: string) => !!s,
	      filters = new Map<number, (s: string) => boolean>(),
	      runFilters = () => {
		      for (const [elm, data] of dataMap.entries()) {
			      amendNode(elm, [], {"class": Array.from(filters.entries()).every(([n, fn]) => fn(data[n] ?? "")) ? "": "H"});
		      }
	      },
	      makeFilterDiv = (n: number) => {
		let pre = false,
		    post = false,
		    text = "",
		    re = new RegExp(""),
		    min = -Infinity,
		    max = Infinity;

		const l = input([], {"type": "radio", "name": "F_"+n, "checked": ""}),
		      textFilter = (s: string) => re.test(s),
		      setTextFilter = () => {
			l.checked = true;
			re = new RegExp((pre ? "^" : "") + text + (post ? "$" : ""));
			filters.set(n, textFilter);
			runFilters();
		      },
		      numberFilter = (s: string) => {
			const n = parseFloat(s);

			return min <= n && n <= max;
		      },
		      setNumberFilter = () => {

			filters.set(n, numberFilter);
			runFilters();
		      },
		      f = document.body.appendChild(div(ul([
			li([
				l,
				sorters[n] === stringSort ? [
					button("_", {"onclick": function(this: HTMLButtonElement) {
						amendNode(this, (pre = !pre) ? "^" : "_");
						setTextFilter();
					}}),
					input("", {"type": "text", "oninput": function(this: HTMLInputElement) {
						text = this.value;
						setTextFilter();
					}}),
					button("_", {"onclick": function(this: HTMLButtonElement) {
						amendNode(this, (post = !post) ? "$" : "_");
						setTextFilter();
					}})
				] : [
					input("", {"oninput": function(this: HTMLInputElement) {
						min = parseInt(this.value);
						if (isNaN(min)) {
							min = -Infinity;
						}

						setNumberFilter();
					}}),
					" < x < ",
					input("", {"oninput": function(this: HTMLInputElement) {
						max = parseInt(this.value);
						if (isNaN(max)) {
							max = Infinity;
						}

						setNumberFilter();
					}})
				]
			]),
			li([
				input([], {"type": "radio", "name": "F_"+n, "id": `F_${n}_1`, "onclick": () => {
					filters.set(n, isNotBlankFilter);
					runFilters();
				}}),
				label("Remove Blank", {"for": `F_${n}_1`})
			]),
			li([
				input([], {"type": "radio", "name": "F_"+n, "id": `F_${n}_2`, "onclick": () => {
					filters.set(n, isBlankFilter);
					runFilters();
				}}),
				label("Only Blank", {"for": `F_${n}_2`})
			])
		      ]), {"class": "F", "tabindex": "-1"}));

		filterDivs.set(n, f);

		return f;
	      };

	let sorted = -1,
	    exportChar = ",";

	amendNode(document.body, [
		button("Reset Table", {"onclick": () => {
			sorted = -1;

			document.body.classList.remove("b");
			document.getElementsByClassName("s")[0]?.removeAttribute("class");

			amendNode(tbodyElement, Array.from(dataMap.keys()));
		}}),
		table([
			thead(Array.from({"length": max}, (_, n) => th(colName(n + 1), {"onclick": function (this: Element) {
				const classes = this.classList;

				document.body.classList.toggle("b", true);

				if (n !== sorted) {
					document.getElementsByClassName("s")[0]?.removeAttribute("class");

					classes.add("s");
					sorted = n;

					amendNode(tbodyElement, Array.from(dataMap.entries()).sort((a, b) => sorters[n](a[1][n] ?? "", b[1][n] ?? "")).map(([e]) => e));
				} else {
					classes.toggle("r");

					amendNode(tbodyElement, Array.from(tbodyElement.children).reverse());
				}
			}, "oncontextmenu": (e: MouseEvent) => {
				e.preventDefault();

				amendNode(filterDivs.get(n) ?? makeFilterDiv(n), [], {"style": `left:${e.clientX}px;top:${e.clientY}px`}).focus();
			}}))),
			tbodyElement
		]),
		label("CSV", {"for": "C"}),
		input("", {"id": "C", "type": "radio", "checked": "", "name":"E", "onclick": () => exportChar = ","}),
		label("TSV", {"for": "T"}),
		input("", {"id": "T", "type": "radio", "name":"E", "onclick": () => exportChar = "\t"}),
		button("Export Table", {"onclick": () => a("", {"href": URL.createObjectURL(new Blob([(Array.from(tbodyElement.children) as HTMLTableRowElement[]).filter(e => dataMap.has(e)).map(row => dataMap.get(row)!.map(cell => `"${cell.replaceAll('"', '""')}"`).join(exportChar)).join("\n")], {"type": "text/csv;charset=utf-8"})), "download": "table.csv"}).click()})
	]);
      },
      sm = "\"",
      parseTable = (contents: Uint8Array, delim: string) => {
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
		if (tk.accept(sm)) {
			while (true) {
				switch (tk.exceptRun(sm)) {
				default:
					return tk.return(tokenCell);
				case sm:
					tk.next();

					if (!tk.accept(sm)) {
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
	      };

	for (const row of parser(decodeText(contents).trimEnd(), parseCell, parseRow)) {
		if (row.type < 0){
			break;
		}

		table.push(row.data.filter(cell => cell.type !== tokenNL).map(cell => cell.data[0] === sm ? cell.data.slice(1, -1).replace(sm+sm, sm)  : cell.data));
	}

	withMime(htmlDoctype + html([
			head([
				title("Table"),
				style({"type": "text/css"}, `table{background-color:#f8f8f8;color:#000;border-collapse: collapse}th{padding:0.5em 1.5em;background-color: #ddd}th,td{border:1px solid #000;cursor:pointer;user-select:none}th:hover{text-decoration: underline}th.s{background-repeat: no-repeat;background-position: right 0px bottom 0.5em;background-size: 1em 1em;background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'%3E%3Cpath d='M1,1 h38 l-19,18 z' fill='%23f00' stroke='%23000' stroke-linejoin='round' /%3E%3C/svg%3E%0A")}th.r{background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'%3E%3Cpath d='M1,19 h38 l-19,-18 z' fill='%23f00' stroke='%23000' stroke-linejoin='round' /%3E%3C/svg%3E%0A")}body:not(.b) br+button{visibility:hidden}.F{position:absolute;outline:none;background-color:#f8f8f8}.F:not(:focus-within){transform:scale(0)}.F:not(:focus-within) *,.H{display:none}`),
				favicon(),
				script({"type": "module"}, `(${makeTable.toString()})(${JSON.stringify(table)})`)
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

	const appendText =({done, value}: ReadableStreamReadResult<Uint8Array>): Uint8Array | Promise<Uint8Array> => {
		if (done) {
			return data;
		}

		const newData = new Uint8Array(data.length + value.length);

		newData.set(data);
		newData.set(value, data.length);

		data = newData;

		return reader.read().then(appendText);
	      };

	return reader.read().then(appendText);
})
.then(data => {
	switch (String.fromCharCode(data[0])) {
	case 'P':
	case 'S':
	case 'H':
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
		.then(() => signedData);
	}

	return data;
})
.then(data => {
	if (!data.length) {
		return Promise.reject("No Data");
	}

	const contents = data.slice(1);

	switch (String.fromCharCode(data[0]).toLowerCase()) {
	case 'p':
		return withMime(contents, "text/plain");
	case 's':
		return withMime(contents, "image/svg+xml");
	case 'h':
		return processToHTML(contents, text2DOM);
	case 'm':
		return processToHTML(contents, parseMarkdown);
	case 'b':
		return processToHTML(contents, processBBCode);
	case 'c':
		return parseTable(contents, ",");
	case 't':
		return parseTable(contents, "\t");
	}

	return Promise.reject("Unknown content type");
})
.catch(err => document.body.textContent = "Error: " + err);
