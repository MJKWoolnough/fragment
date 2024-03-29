import type {Phrase, Phraser, PhraserFn, Token, TokenFn, Tokeniser} from './lib/parser.js';
import type {TypeGuardOf} from './lib/typeguard.js';
import parseBBCode from './lib/bbcode.js';
import {all as allBBCodeTags} from './lib/bbcode_tags.js';
import {HTTPRequest} from './lib/conn.js';
import {add} from './lib/css.js';
import {amendNode} from './lib/dom.js';
import {a, body, br, button, div, fieldset, h1, head, html, img, input, label, legend, li, pre, script, span, title, ul} from './lib/html.js';
import pageLoad from './lib/load.js';
import parseMarkdown from './lib/markdown.js';
import {text2DOM} from './lib/misc.js';
import {NodeArray, NodeMap, node, stringSort} from './lib/nodes.js';
import parser, {processToEnd} from './lib/parser.js';
import {And, Arr, Bool, Null, Obj, Or, Part, Str, Tuple, Val} from './lib/typeguard.js';

const hash = window.location.hash.slice(1),
      titleText = document.title,
      withMime = (data: BlobPart, mime: string) => window.location.href = URL.createObjectURL(new Blob([data], {"type": mime})),
      htmlDoctype = "<!DOCTYPE html>\n",
      decodeText = (data: Uint8Array) => new TextDecoder().decode(data),
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
		withMime(htmlDoctype + htmlElement.outerHTML, "text/html;charset=utf-8");
	}
      },
      makeTable = (data: string[][], firstRowIsTitle: boolean) => {
	type Children = string | Element | Children[];

	type DOMBind<T extends Element> = (child?: Children, params?: Record<string, string | Function>) => T;

	const max = Math.max(...data.map(r => r.length)),
	      titles = firstRowIsTitle ? data.shift() ?? [] : [],
	      appendChildren = (elem: Element, child: Children) => {
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
	      dataMap = new Map<Element, string[]>(),
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
	      makeToggleButton = (c: string, title: string, fn: (v: boolean) => void) => button(c, {"class": "t", title, "onclick": function(this: HTMLButtonElement) {
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
					makeToggleButton("^", "Starts With", v => {
						pre = v;
						setTextFilter();
					}),
					input("", {"type": "text", "oninput": function(this: HTMLInputElement) {
						text = this.value;
						setTextFilter();
					}}),
					makeToggleButton("$", "Ends With", v => {
						post = v;
						setTextFilter();
					}),
					makeToggleButton("i", "Case Sensitivity", v => {
						caseInsensitive = v;
						setTextFilter();
					})
				] : [
					input("", {"oninput": function(this: HTMLInputElement) {
						min = parseFloat(this.value);
						if (isNaN(min)) {
							min = -Infinity;
						}

						setNumberFilter();
					}}),
					" ≤ x ≤ ",
					input("", {"oninput": function(this: HTMLInputElement) {
						max = parseFloat(this.value);
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
		      ], {"class": "F", "tabindex": "-1", "onkeydown": (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				(document.activeElement as HTMLElement | null)?.blur();
			}
		      }}));

		filterLists.set(n, f);

		return f;
	      },
	      encodeRow = (row: string[]) => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(exportChar);

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
			thead(Array.from({"length": max}, (_, n) => th(titles[n] ?? colName(n + 1), {"onclick": function (this: Element) {
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
		input("", {"id": "C", "type": "radio", "checked": "", "name": "E", "onclick": () => exportChar = ","}),
		label("TSV", {"for": "T"}),
		input("", {"id": "T", "type": "radio", "name": "E", "onclick": () => exportChar = "\t"}),
		button("Export Table", {"onclick": () => a("", {"href": URL.createObjectURL(new Blob([(titles.length ? encodeRow(titles) + "\n" : "") + Array.from(tbodyElement.children).filter(e => dataMap.has(e)).map(row => encodeRow(dataMap.get(row)!)).join("\n")], {"type": "text/csv;charset=utf-8"})), "download": "table.csv"}).click()})
	]);
      },
      sm = "\"",
      parseTable = (contents: Uint8Array, delim: string, firstRowIsTitle = false) => {
	const tokenCell = 1,
	      tokenNL = 2,
	      tokenRow = 3,
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
	      arrow = (up: 0 | 1) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'%3E%3Cpath d='M1,${19 - 18 * up} h38 l-19,${(2 * up - 1) * 18} z' fill='%23f00' stroke='%23000' stroke-linejoin='round' /%3E%3C/svg%3E%0A")`;

	processDOM(html([
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
						"background-image": arrow(1)
					},
					".r": {
						"background-image": arrow(0)
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
			script({"type": "module"}, `(${makeTable.toString()})(${JSON.stringify(Array.from(processToEnd(parser(decodeText(contents).trimEnd(), parseCell, parseRow))).map(row => row.data.filter(cell => cell.type !== tokenNL).map(cell => cell.data[0] === sm ? cell.data.slice(1, -1).replace(sm+sm, sm)  : cell.data)))}, ${firstRowIsTitle})`)
		]),
		body(config.embed ? [] : [
			a({"href": window.location + ""}, "Link to this Table"),
			br()
		])
	]));
      },
      isStr = Str(),
      isBool = Bool(),
      isNull = Null(),
      optTG = Part(Obj({
	"markdownHTML": Or(isNull, Arr(Tuple(isStr, ...isStr))),
	"embed": Or(isNull, isBool)
      })),
      configTG = And(optTG, Obj({
	"allowUnsigned": isBool,
	"keys": Arr(And(optTG, Obj({
		"name": isStr,
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
      })),
      configJSON = "config.json",
      loadConfig = () => HTTPRequest(configJSON, {"response": "json", "checker": configTG}).catch(() => ({"allowUnsigned": false, "keys": []} as TypeGuardOf<typeof configTG>)),
      config: Omit<TypeGuardOf<typeof configTG>, "keys"> = {
	"allowUnsigned": false,
	"markdownHTML": [
		["a", "name"],
		["details"],
		["fieldset"],
		["legend"],
		["summary"]
	]
      };

if (hash === "CONFIG") {
	pageLoad.then(() => Promise.all([
		HTTPRequest(configJSON, {"method": "OPTIONS", "response": "xh"}).catch(() => null),
		loadConfig()
	]))
	.then(([xh, config]) => {
		type TagItem = {
			[node]: HTMLLIElement;
			tag: string;
			params: ParamItem[];
		}

		type ParamItem = {
			[node]: HTMLLIElement;
			param: string;
		}

		type KeyItem = {
			[node]: HTMLFieldSetElement;
			config: TypeGuardOf<typeof optTG> & {name: string};
		}

		let labelID = 0;

		const hasPost = !!xh?.getResponseHeader("Allow")?.toUpperCase().split(/, */).includes("POST"),
		      addHTMLParam = (param = "") => {
			const pi = {
				[node]: li(input({"value": param, "oninput": function(this: HTMLInputElement) {
					pi.param = this.value;
				}})),
				param
			      };

			return pi;
		      },
		      addMarkdownHTMLItem = (removeFn: () => void, tag: string, ...params: string[]): TagItem => {
			const paramsList = new NodeArray<ParamItem>(ul(), params.sort(stringSort).map(addHTMLParam));

			return {
				[node]: li([
					button({"title": "Remove this Markdown HTML Element", "onclick": removeFn}, "X"),
					label(tag),
					paramsList,
					button({"title": "Add HTML Attribute", "onclick": () => paramsList.push(addHTMLParam())}, "+"),
					button({"title": "Remove Last HTML Attribute", "onclick": () => paramsList.pop()}, "-")
				]),
				tag: tag,
				params: paramsList
			};
		      },
		      password = input({"type": "password", "id": "password"}),
		      getConfigJSON = () => JSON.stringify(config),
		      createConfigOptions = (config: TypeGuardOf<typeof optTG>) => {
			labelID++;

			const markdownHTML: NodeMap<string, TagItem, HTMLUListElement> = Object.assign(new NodeMap(ul(), (a, b) => stringSort(a.tag, b.tag), (config.markdownHTML ?? []).map(([tag, ...params]) => [tag, addMarkdownHTMLItem(() => markdownHTML.delete(tag), tag, ...params)])), {
				"toJSON": () => Array.from(markdownHTML.values()).map(v => [v.tag, ...(new Set<string>(v.params.map(p => p.param).filter(p => p)))])
			      }),
			      defaultEmpty = input({"type": "radio", "id": "empty_"+labelID, "name": "markdown_"+labelID, "checked": markdownHTML.size === 0, "onclick": () => config.markdownHTML = markdownHTML as any});

			if (markdownHTML.size) {
				config.markdownHTML = markdownHTML as any;
			}

			return fieldset([
				legend("name" in config ? [
					`Key: ${config.name}`,
					button({"title": "Remove this Key", "onclick": () => keys.delete(config.name as string)}, "X")
				]: "Base Config"),
				"allowUnsigned" in config ? [
					label({"for": "allowUnsigned"}, "Allow Unsigned Fragments"),
					span(input({"type": "checkbox", "id": "allowUnsigned", "checked": config.allowUnsigned, "onclick": function (this: HTMLInputElement) {
						config.allowUnsigned = this.checked;
					}}))
				] : [],
				label({"for": "embed_"+labelID}, "Embed Content"),
				span(input({"id": "embed_"+labelID, "type": "checkbox", "checked": config.embed, "onclick": function(this: HTMLInputElement) {
					config.embed = this.checked;
				}})),
				label("Allowed Markdown HTML Tags"),
				markdownHTML,
				span(button({"title": "Add Allowed Markdown HTML Element", "onclick": () => {
					const tag = prompt("Enter HTML Tag name");

					if (tag) {
						if (markdownHTML.has(tag)) {
							alert("Tag already exists");
						} else {
							defaultEmpty.click();
							markdownHTML.set(tag, addMarkdownHTMLItem(() => markdownHTML.delete(tag), tag));
						}
					}
				}}, "+")),
				label({"for": "empty_"+labelID}, "Allow no HTML elements"),
				span(defaultEmpty),
				label({"for": "all_"+labelID}, "Allow all HTML elements"),
				span(input({"type": "radio", "id": "all_"+labelID, "name": "markdown_"+labelID, "checked": config.markdownHTML === null, "onclick": () => config.markdownHTML = null})),
				label({"for": "safe_"+labelID}, "name" in config ? "Use Base Config Setting" : "Allow safe HTML elements"),
				span(input({"type": "radio", "id": "safe_"+labelID, "name": "markdown_"+labelID, "checked": config.markdownHTML === undefined, "onclick": () => delete config.markdownHTML}))
			      ]);
		      },
		      keys = Object.assign(new NodeMap<string, KeyItem>(div(), (a, b) => stringSort(a.config.name, b.config.name), config.keys.map(key => [key.name, {
			      [node]: createConfigOptions(key),
			      config: key
		      }])), {
			"toJSON": () => Array.from(keys.values()).map(v => v.config)
		      });

		config.keys = keys as any;

		amendNode(document.head, add({
			"label": {
				"text-align": "right",

				":after": {
					"content": `":"`
				}
			},
			"fieldset": {
				"display": "grid",
				"grid-template-columns": "max-content 1fr",
				"gap": "0 1em"
			},
			"ul": {
				"list-style": "none",
				"margin": 0,

				":empty": {
					"display": "none"
				},

				":not(:empty)~": {
					"label,span>input": {
						"display": "none"
					}
				},

				">li>ul": {
					"display": "inline-block",
					"padding": 0,

					">li": {
						"display": "inline-block"
					}
				}
			}
		}).render());

		amendNode(document.body, [
			h1("Fragment"),
			createConfigOptions(config),
			keys[node],
			button({"onclick": () => {
				const name = prompt("Enter a name for the key.");

				if (name) {
					if (keys.has(name)) {
						alert("Name already exists");
					} else {
						const al = {
							name: "ECDSA",
							namedCurve: "P-384",
							hash: "SHA-256"
						      };

						window.crypto.subtle.generateKey(al, true, ["sign", "verify"]).then(key => {
							window.crypto.subtle.exportKey("pkcs8", key.privateKey).then(k => a({"download": name + ".pem", "href": URL.createObjectURL(new Blob(["-----BEGIN PRIVATE KEY-----\n" + btoa(String.fromCharCode(...new Uint8Array(k))).match(/.{1,64}/g)!.join("\n") + "\n-----END PRIVATE KEY-----"], {"type": "text/plain"}))}).click());
							window.crypto.subtle.exportKey("jwk", key.publicKey).then(k => {
								const c = {
									name,
									"embed": config.embed,
									"hash": al.hash,
									"key": k
								      };

								keys.set(name, {
									[node]: createConfigOptions(c),
									"config": c
								});
							});
						});
					}
				}
			}}, "Add Key"),
			br(),
			hasPost ? [
				label({"for": "password"}, "Password for Saving"),
				password,
				button({"onclick": () => HTTPRequest(configJSON, {
					"method": "POST",
					"password": password.value,
					"data": getConfigJSON()
				})
				.then(() => alert("Saved"))
				.catch(alert)}, "Save"),
				br()
			] : [],
			button({"onclick": () => prompt("Copy this to your config file:", getConfigJSON())}, "Export Config")
		]);
	});
} else {
	pageLoad.then(() => hash ? fetch("data:application/octet-stream;base64," + hash) : Promise.reject("No Fragment"))
	.then(data => data.blob())
	.then(b => b.stream().pipeThrough<Uint8Array>(new DecompressionStream("deflate-raw")).getReader())
	.then(async reader => {
		let data = new Uint8Array(0);

		while (true) {
			const {value} = await reader.read();

			if (!value) {
				return data;
			}

			const newData = new Uint8Array(data.length + value.length);

			newData.set(data);
			newData.set(value, data.length);

			data = newData;
		}
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
		case 'D':
		case 'T':
		case 'U':
		case 'X':
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

		return c.then(() => config.allowUnsigned ? data : Promise.reject("Fragment not signed"));
	})
	.then(data => {
		const contents = data.slice(1),
		      firstChar = String.fromCharCode(data[0]).toLowerCase();

		switch (firstChar) {
		case 'p':
			return config.embed ? amendNode(document.body, pre(decodeText(data))) : withMime(contents, "text/plain;charset=utf-8");
		case 's':
			return config.embed ? amendNode(document.body, img({"src": URL.createObjectURL(new Blob([data], {"type": "image/svg+xml;charset=utf-8"}))})) : withMime(contents, "image/svg+xml;charset=utf-8");
		case 'h':
			return processToHTML(contents, text2DOM);
		case 'm':
		case 'b':
			return processToHTML(contents, firstChar === 'm' ? data => parseMarkdown(data, {"allowedHTML": config.markdownHTML as [keyof HTMLElementTagNameMap, ...string[]][] | null ?? null}) : data => parseBBCode(allBBCodeTags, data));
		case 'c':
		case 'd':
			return parseTable(contents, ",", firstChar === 'd');
		case 't':
		case 'u':
			return parseTable(contents, "\t", firstChar === 'u');
		case 'x':
			return withMime(contents, "application/xml;charset=utf-8");
		}

		return Promise.reject("Unknown content type");
	})
	.catch(err => amendNode(document.body, "Error: " + err));
}
