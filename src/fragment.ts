import pageLoad from './lib/load.js';

pageLoad.then(() => {
	fetch("data:application/octet-stream;base64," + window.location.hash.slice(1))
	.then(data => data.blob())
	.then(b => b.stream().pipeThrough<Uint8Array>(new DecompressionStream("deflate-raw")).getReader())
	.then(reader => {
		let text = "";

		const decode = new TextDecoder(),
		      appendText =({done, value}: {done: boolean, value: Uint8Array}) => {
			if (done) {
				const blob = new Blob([text], {"type": "text/plain"}),
				      url = URL.createObjectURL(blob);

				window.location.href = url;

			} else {
				text += decode.decode(value);

				reader.read().then(appendText);
			}
		      };

		reader.read().then(appendText);
	});
});
