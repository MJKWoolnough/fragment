import type {Phrase, Phraser, PhraserFn, Token, TokenFn, Tokeniser} from './lib/parser.js';
import type {TypeGuardOf} from './lib/typeguard.js';
import parseBBCode from './lib/bbcode.js';
import {all as allBBCodeTags} from './lib/bbcode_tags.js';
import {HTTPRequest} from './lib/conn.js';
import {add} from './lib/css.js';
import {amendNode} from './lib/dom.js';
import {a, body, br, head, html, img, pre, script, title} from './lib/html.js';
import pageLoad from './lib/load.js';
import parseMarkdown from './lib/markdown.js';
import {text2DOM} from './lib/misc.js';
import parser from './lib/parser.js';
import {And, Arr, Bool, Obj, Or, Part, Str, Tuple, Val} from './lib/typeguard.js';

const hash = window.location.hash.slice(1),
      titleText = document.title,
      withMime = (data: BlobPart, mime: string) => window.location.href = URL.createObjectURL(new Blob([data], {"type": mime})),
      htmlDoctype = "<!DOCTYPE html>\n",
      decodeText = (data: Uint8Array) => (new TextDecoder()).decode(data),
      favicon = () => document.getElementsByTagName("link")[0]!.cloneNode(),
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

	processDOM(htmlElement);
      },
      processDOM = (htmlElement: HTMLHtmlElement) => {
	if (config.embed) {
		document.replaceChild(htmlElement, document.documentElement);
	} else {
		withMime(htmlDoctype + htmlElement.outerHTML, "text/html");
	}
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
			if (typeof child === "string") {
				elem.textContent = child;
			} else {
				appendChildren(elem, child);
			}
		}

		return elem;
	      },
	      [a, button, input, label, li, table, tbody, td, th, thead, tr, ul] = "a button input label li table tbody td th thead tr ul".split(" ").map(e => (child?: Children, params?: Record<string, string | Function>) => amendNode(document.createElement(e), child, params)) as [DOMBind<HTMLElementTagNameMap["a"]>, DOMBind<HTMLElementTagNameMap["button"]>, DOMBind<HTMLElementTagNameMap["input"]>, DOMBind<HTMLElementTagNameMap["label"]>, DOMBind<HTMLElementTagNameMap["li"]>, DOMBind<HTMLElementTagNameMap["table"]>, DOMBind<HTMLElementTagNameMap["tbody"]>, DOMBind<HTMLElementTagNameMap["td"]>, DOMBind<HTMLElementTagNameMap["th"]>, DOMBind<HTMLElementTagNameMap["thead"]>, DOMBind<HTMLElementTagNameMap["tr"]>, DOMBind<HTMLElementTagNameMap["ul"]>],
	      max = Math.max(...data.map(r => r.length)),
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
	      filterLists = new Map<number, HTMLUListElement>(),
	      isBlankFilter = (s: string) => !s,
	      isNotBlankFilter = (s: string) => !!s,
	      filters = new Map<number, (s: string) => boolean>(),
	      runFilters = () => {
		document.body.classList.toggle("b", true);

		for (const [elm, data] of dataMap.entries()) {
			amendNode(elm, [], {"class": Array.from(filters.entries()).every(([n, fn]) => fn(data[n] ?? "")) ? "": "H"});
		}
	      },
	      makeToggleButton = (c: string, fn: (v: boolean) => void) => button(c, {"class": "t", "onclick": function(this: HTMLButtonElement) {
		      fn(!this.classList.toggle("t"));
	      }}),
	      regexpSpecials = "\\/.*+?|()[]{}".split(""),
	      makeFilterDiv = (n: number) => {
		let pre = false,
		    post = false,
		    text = "",
		    caseInsensitive = false,
		    re = new RegExp(""),
		    min = -Infinity,
		    max = Infinity;

		const textFilter = (s: string) => re.test(s),
		      setTextFilter = () => {
			l.checked = true;
			re = new RegExp((pre ? "^" : "") + regexpSpecials.reduce((text, c) => text.replaceAll(c, "\\" + c), text) + (post ? "$" : ""), caseInsensitive ? "i" : "");
			filters.set(n, textFilter);
			runFilters();
		      },
		      numberFilter = (s: string) => {
			const n = parseFloat(s);

			return min <= n && n <= max || min === -Infinity && max === Infinity;
		      },
		      setNumberFilter = () => {
			l.checked = true;
			filters.set(n, numberFilter);
			runFilters();
		      },
		      l = input([], {"type": "radio", "name": "F_"+n, "checked": "", "onclick": sorters[n] === stringSort ? setTextFilter : setNumberFilter}),
		      f = document.body.appendChild(ul([
			li([
				l,
				sorters[n] === stringSort ? [
					makeToggleButton("^", v => {
						pre = v;
						setTextFilter();
					}),
					input("", {"type": "text", "oninput": function(this: HTMLInputElement) {
						text = this.value;
						setTextFilter();
					}}),
					makeToggleButton("$", v => {
						post = v;
						setTextFilter();
					}),
					makeToggleButton("i", v => {
						caseInsensitive = v;
						setTextFilter();
					})
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
		      ], {"class": "F", "tabindex": "-1"}));

		filterLists.set(n, f);

		return f;
	      };

	let sorted = -1,
	    exportChar = ",";

	amendNode(document.body, [
		button("Reset Table", {"class": "B", "onclick": () => {
			sorted = -1;

			document.body.classList.remove("b");
			document.getElementsByClassName("s")[0]?.removeAttribute("class");
			filterLists.clear();
			filters.clear();

			amendNode(tbodyElement, Array.from(dataMap.keys()).map(row => amendNode(row, [], {"class": ""})));
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

				amendNode(filterLists.get(n) ?? makeFilterDiv(n), [], {"style": `left:${e.clientX}px;top:${e.clientY}px`}).focus();
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
	      },
	      scriptElement = script({"type": "module"}),
	      htmlElement = html([
		head([
			title("Table"),
			add({
				"table": {
					"background-color": "#f8f8f8",
					"color": "#000",
					"border-collapse": "collapse",
					"margin-bottom": "1em"
				},
				"th": {
					"padding": "0.5em 1.5em",
					"background-color": "#ddd",
					"cursor": "pointer",
					"user-select": "none",
					":hover": {
						"text-decoration": "underline"
					},
					".s": {
						"background-repeat": "no-repeat",
						"background-position": "right 0px bottom 0.5em",
						"background-size": "1em 1em",
						"background-image": `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'%3E%3Cpath d='M1,1 h38 l-19,18 z' fill='%23f00' stroke='%23000' stroke-linejoin='round' /%3E%3C/svg%3E%0A")`
					},
					".r": {
						"background-image":` url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'%3E%3Cpath d='M1,19 h38 l-19,-18 z' fill='%23f00' stroke='%23000' stroke-linejoin='round' /%3E%3C/svg%3E%0A")`
					}
				},
				"th,td": {
					"border": "1px solid #000"
				},
				"body:not(.b) button.B": {
					"visibility": "hidden"
				},
				".F": {
					"position": "absolute",
					"list-style": "none",
					"padding": "0.5em",
					"outline": "none",
					"border": "2px solid #000",
					"background-color": "#f8f8f8",
					":not(:focus-within)": {
						"transform": "scale(0)",
						" *": {
							"display": "none"
						}
					}
				},
				".H": {
					"display": "none"
				},
				".t": {
					"color": "transparent"
				}
			}).render(),
			favicon(),
			scriptElement
		]),
		body(config.embed ? [] : [
			a({"href": window.location + ""}, "Link to this Table"),
			br()
		])
	      ]);

	for (const row of parser(decodeText(contents).trimEnd(), parseCell, parseRow)) {
		if (row.type < 0){
			break;
		}

		table.push(row.data.filter(cell => cell.type !== tokenNL).map(cell => cell.data[0] === sm ? cell.data.slice(1, -1).replace(sm+sm, sm)  : cell.data));
	}

	amendNode(scriptElement, `(${makeTable.toString()})(${JSON.stringify(table)})`);

	processDOM(htmlElement);
      },
      isStr = Str(),
      isBool = Bool(),
      optTG = Part(Obj({
	"markdownHTML": Arr(Tuple(isStr, ...isStr)),
	"embed": isBool
      })),
      loadConfig = () => HTTPRequest("config.json", {"response": "json", "checker": And(optTG, Obj({
	"keys": Arr(And(optTG, Obj({
		"hash": Or(Val("SHA-256"), Val("SHA-384"), Val("SHA-512")),
		"key": Obj({
			"alg": isStr,
			"crv": isStr,
			"ext": isBool,
			"key_ops": Tuple(Val("verify")),
			"kty": isStr,
			"x": isStr,
			"y": isStr
		})
	      })))
      }))}),
      config: TypeGuardOf<typeof optTG> = {
	"markdownHTML": [
		["a", "name"],
		["details"],
		["summary"]
	]
      };

if (hash === "CONFIG") {
	pageLoad.then(loadConfig)
	.then(() => {
	});
} else {
	pageLoad.then(() => hash ? fetch("data:application/octet-stream;base64," + hash) : Promise.reject("No Fragment"))
	.then(data => data.blob())
	.then(b => b.stream().pipeThrough<Uint8Array>(new DecompressionStream("deflate-raw")).getReader())
	.then(reader => {
		let data = new Uint8Array(0);

		const appendText = ({done, value}: ReadableStreamReadResult<Uint8Array>): Uint8Array | Promise<Uint8Array> => {
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
		const c = loadConfig().then(c => Object.assign(config, c));

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

			const signatureLen = data.at(-2)! << 8 | data.at(-1)!,
			      signedData = data.slice(0, -signatureLen - 2),
			      signature = data.slice(-signatureLen - 2, -2);

			return c.then(c => Promise.any(c.keys.map(key => window.crypto.subtle.importKey("jwk", key.key, {"name": "ECDSA", "namedCurve": key.key.crv}, true, ["verify"])
				.then(ck => window.crypto.subtle.verify({"name": "ECDSA", "hash": key.hash}, ck, signature, signedData))
				.then(r => r ? key : Promise.reject(""))
			)))
			.then(c => Object.assign(config, c))
			.catch(() => Promise.reject("Unable to verify signature"))
			.then(() => signedData);
		}

		return c.then(() => data);
	})
	.then(data => {
		if (!data.length) {
			return Promise.reject("No Data");
		}

		const contents = data.slice(1);

		switch (String.fromCharCode(data[0]).toLowerCase()) {
		case 'p':
			return config.embed ? amendNode(document.body, pre(decodeText(data as Uint8Array))) : withMime(contents, "text/plain");
		case 's':
			return config.embed ? amendNode(document.body, img({"src": URL.createObjectURL(new Blob([data], {"type": "image/svg+xml"}))})) : withMime(contents, "image/svg+xml");
		case 'h':
			return processToHTML(contents, text2DOM);
		case 'm':
			return processToHTML(contents, data => parseMarkdown(data, {"allowedHTML": config.markdownHTML as [keyof HTMLElementTagNameMap, ...string[]][] | null ?? null}));
		case 'b':
			return processToHTML(contents, data => parseBBCode(allBBCodeTags, data));
		case 'c':
			return parseTable(contents, ",");
		case 't':
			return parseTable(contents, "\t");
		}

		return Promise.reject("Unknown content type");
	})
	.catch(err => document.body.textContent = "Error: " + err);
}
