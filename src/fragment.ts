import pageLoad from './lib/load.js';

pageLoad.then(() => {
	const fragment = window.location.hash.slice(1),
	      blob = new Blob([fragment], {"type": "text/plain"}),
	      url = URL.createObjectURL(blob);

	window.location.href = url;
});
