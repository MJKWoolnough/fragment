import pageLoad from './lib/load.js';

pageLoad.then(() => {
	const hash = window.location.hash.slice(1);

	(hash ? fetch("data:application/octet-stream;base64," + hash) : Promise.reject("No Fragment"))
	.then(data => data.blob())
	.then(b => b.stream().pipeThrough<Uint8Array>(new DecompressionStream("deflate-raw")).getReader())
	.then(reader => {
		let data = new Uint8Array(0);

		const appendText =({done, value}: ReadableStreamReadResult<Uint8Array>) => {
			if (done) {
				const blob = new Blob([data], {"type": "text/plain"}),
				      url = URL.createObjectURL(blob);

				window.location.href = url;
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
	.catch(err => document.body.textContent = "Error: " + err);
});
