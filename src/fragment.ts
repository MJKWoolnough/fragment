import pageLoad from './lib/load.js';

pageLoad.then(() => {
	fetch("data:application/octet-stream;base64," + window.location.hash.slice(1))
	.then(data => data.blob())
	.then(b => b.stream().pipeThrough<Uint8Array>(new DecompressionStream("deflate-raw")).getReader())
	.then(reader => {
		let data = new Uint8Array(0);

		const appendText =({done, value}: {done: boolean, value: Uint8Array}) => {
			if (done) {
				const blob = new Blob([data], {"type": "text/plain"}),
				      url = URL.createObjectURL(blob);

				window.location.href = url;
			} else {
				const newData = new Uint8Array(data.length + value.length);

				newData.set(data);
				newData.set(value, data.length);

				data = newData;

				reader.read().then(appendText);
			}
		      };

		reader.read().then(appendText);
	});
});
