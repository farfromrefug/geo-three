import serve from "rollup-plugin-serve";
import livereload from 'rollup-plugin-livereload';

export default {
	input: "source/Main.js",
	plugins: [
		serve({
			open: true,
			contentBase: '.',
			openPage: '/examples',
			host: '0.0.0.0',
			port: 80,
			headers: {'Access-Control-Allow-Origin': '*'}
		}),
		livereload({watch: '.'})
	],
	output: [
		{
			globals: {"three": "THREE"},
			format: "umd",
			name: "Geo",
			file: "build/geo-three.js",
			indent: "\t"
		}
	]
};
