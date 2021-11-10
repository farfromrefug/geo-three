import strip from '@rollup/plugin-strip';
import typescript from '@rollup/plugin-typescript';
import {terser} from 'rollup-plugin-terser';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';


export default [{
	input: 'source/Main.ts',
	plugins: [
		typescript(),
		strip({functions: ['assert.*', 'debug', 'alert']})
	],

	output: [
		{
			format: 'es',
			file: 'build/geo-three.module.js',
			indent: '\t'
		},
		{
			globals: {three: 'THREE'},
			format: 'umd',
			name: 'Geo',
			file: 'build/geo-three.js',
			indent: '\t'
		}
	]
}, {
	input: 'webapp/app.ts',
	plugins: [
		nodeResolve({mainFields: ['browser', 'module', 'main']}),
		commonjs(),
		typescript({tsconfig: 'webapp/tsconfig.json'}),
		strip({functions: ['assert.*', 'debug', 'alert']}),
		terser(),
		replace({
			'FORCE_MOBILE': 'false',
			'EXTERNAL_APP': 'false'
		})
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
