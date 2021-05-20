import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import {resolve} from 'path';
import * as fs from 'fs';

export default {
	input: 'source/Main.ts',
	plugins: [
		serve({
			open: true,
			contentBase: '.',
			openPage: '/examples',
			host: '0.0.0.0',
			port: 8081,
			// headers: {'Access-Control-Allow-Origin': '*'},
			https: {
				cert: fs.readFileSync(resolve(__dirname, 'cert.pem')),
				key: fs.readFileSync(resolve(__dirname, 'key.pem')),
				ca: fs.readFileSync(resolve(__dirname, 'cert.csr'))
			}
		}),
		livereload({watch: '.'})
	],
	output: [
		{
			globals: {'three': 'THREE'},
			format: 'umd',
			name: 'Geo',
			file: 'build/geo-three.js',
			indent: '\t'
		}
	]
};
