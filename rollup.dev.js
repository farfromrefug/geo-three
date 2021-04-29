import serve from "rollup-plugin-serve";
import livereload from 'rollup-plugin-livereload';

export default {
	input: "source/Main.js",
	plugins: [
		serve({
			open: true,
			contentBase: '.',
			openPage: '/examples',
			host: 'localhost',
			port: 8083
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
