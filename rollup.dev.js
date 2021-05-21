import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import typescript from '@rollup/plugin-typescript';
import {resolve} from 'path';
import * as fs from 'fs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default [{
	input: 'webapp/app.ts',
	plugins: [
		typescript({tsconfig: 'webapp/tsconfig.json'}),
		nodeResolve(),
		commonjs(),
		serve({
			open: true,
			contentBase: '.',
			openPage: '/example',
			// host: '0.0.0.0',
			host: '127.0.0.1',
			port: 8081,
			headers: {'Access-Control-Allow-Origin': '*'},
			https: {
				cert: fs.readFileSync(resolve(__dirname, 'cert.pem')),
				key: fs.readFileSync(resolve(__dirname, 'key.pem')),
				ca: fs.readFileSync(resolve(__dirname, 'cert.csr'))
			}
		}),
		livereload('example')
	],
	output: [
		{
			esModule: false,
			format: 'iife',
			name: 'webapp',
			file: 'example/app.js'
		}
	]
}];
