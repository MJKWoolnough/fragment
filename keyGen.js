{
	const al = {
		name: "ECDSA",
		namedCurve: "P-384",
		hash: "SHA-256"
	}

	window.crypto.subtle.generateKey(al, true, ["sign", "verify"]).then(a => {
	window.crypto.subtle.exportKey("jwk", a.publicKey).then(k => console.log(JSON.stringify({"algorithm": al, "key": k})));
	window.crypto.subtle.exportKey("pkcs8", a.privateKey).then(k => console.log(`-----BEGIN PRIVATE KEY-----
${Array.from(btoa(String.fromCharCode(...new Uint8Array(k)))).reduce((a, c) => {
		if (a.at(-1)?.length === 64) {
			a.push(c);
		} else {
			a[a.length-1] += c;
		}
		return a;
	}, [""]).join("\n")}
-----END PRIVATE KEY-----`));
	});
}
