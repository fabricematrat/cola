var curl = {
	packages: {
		app: {location: '.', config: { moduleLoader: 'curl/loader/cjsm11' } },
		curl: { location: '../bower_components/curl/src/curl' },
		cola: { location: '../..' },
		when: { location: '../bower_components/when', main: 'when' },
		rest: { location: '../bower_components/rest', main: 'rest' },
		wire: { location: '../bower_components/wire',
			config: { moduleLoader: 'curl/loader/cjsm11' } },
		most: { location: '../bower_components/most', main: 'most',
			config: { moduleLoader: 'curl/loader/cjsm11'} },
		rusha: { location: '../../node_modules/mathsync/node_modules/rusha/', main: 'rusha',
			config: { moduleLoader: 'curl/loader/cjsm11'} },
		q: { location: '../../node_modules/mathsync/node_modules/q/', main: 'q',
			config: { moduleLoader: 'curl/loader/cjsm11'} },
		buffer: { location: '../../node_modules/buffer/', main: 'index',
			config: { moduleLoader: 'curl/loader/cjsm11'} },
		"base64-js": { location: '../../node_modules/buffer/node_modules/base64-js/lib', main: 'b64',
			config: { moduleLoader: 'curl/loader/cjsm11'} },
		ieee754: { location: '../../node_modules/buffer//node_modules/ieee754/', main: 'index',
			config: { moduleLoader: 'curl/loader/cjsm11'} },
		mathsync: { location: '../../node_modules/mathsync/src/', main: 'index',
			config: { moduleLoader: 'curl/loader/cjsm11'} }
	}
};
