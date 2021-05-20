// eslint-disable-next-line no-undef
module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	'env': {'node': true},
	plugins: [
		'@typescript-eslint',
		'eslint-plugin-import',
		'eslint-plugin-tsdoc'
	],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/eslint-recommended',
		'plugin:@typescript-eslint/recommended'
	],
	rules: {
		'@typescript-eslint/ban-ts-comment': 'off',
		'@typescript-eslint/adjacent-overload-signatures': 'error',
		'@typescript-eslint/array-type': 'off',
		'@typescript-eslint/ban-types': 'off',
		'@typescript-eslint/consistent-type-assertions': 'error',
		'@typescript-eslint/explicit-member-accessibility': 'error',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'@typescript-eslint/explicit-function-return-type': ['error', {allowExpressions: true, allowTypedFunctionExpressions: true, allowHigherOrderFunctions: true}],
		'@typescript-eslint/interface-name-prefix': 'off',
		'@typescript-eslint/member-ordering': 'off',
		'@typescript-eslint/no-empty-function': 'off',
		'@typescript-eslint/no-empty-interface': 'error',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-inferrable-types': 'off',
		'@typescript-eslint/no-misused-new': 'error',
		'@typescript-eslint/no-namespace': 'error',
		'@typescript-eslint/no-non-null-assertion': 'error',
		'@typescript-eslint/no-parameter-properties': 'off',
		'@typescript-eslint/no-unused-expressions': 'error',
		'@typescript-eslint/no-unused-vars': 'off',
		'@typescript-eslint/no-use-before-define': 'off',
		'@typescript-eslint/no-var-requires': 'off',
		'@typescript-eslint/prefer-for-of': 'off',
		'@typescript-eslint/prefer-function-type': 'error',
		'@typescript-eslint/prefer-namespace-keyword': 'error',
		'@typescript-eslint/quotes': ['error', 'single'],
		'@typescript-eslint/type-annotation-spacing': ['error', {before: false, after: true}],
		'@typescript-eslint/triple-slash-reference': 'error',
		'tsdoc/syntax': 'error',
		'arrow-body-style': ['error', 'always'],
		'arrow-parens': 'error',
		'brace-style': ['error', 'allman', {allowSingleLine: true}],
		camelcase: ['error', {'ignoreGlobals': true}],
		indent: ['error', 'tab'],
		complexity: 'off',
		semi: ['error', 'always'],
		'constructor-super': 'error',
		curly: 'error',
		eqeqeq: 'error',
		'guard-for-in': 'off',
		'id-blacklist': 'off',
		'id-match': 'off',
		'sort-imports': ['off', {
			ignoreCase: false,
			ignoreDeclarationSort: false,
			ignoreMemberSort: false,
			memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single']
		}],
		'max-len': 'off',
		'lines-between-class-members': 'error',
		'space-before-blocks': ['error', 'always'],
		'no-multi-spaces': 'error',
		'keyword-spacing': ['error', {after: true, before: true}],
		'new-parens': 'error',
		'no-bitwise': 'off',
		'no-caller': 'error',
		'no-cond-assign': 'error',
		'no-console': 'off',
		'no-debugger': 'error',
		'no-duplicate-imports': 'error',
		'no-empty': 'off',
		'no-eval': 'off',
		'no-fallthrough': 'error',
		'no-invalid-this': 'off',
		'no-multiple-empty-lines': 'error',
		'no-new-wrappers': 'error',
		'no-redeclare': 'off',
		'no-shadow': 'off',
		'no-restricted-imports': 'error',
		'no-sequences': 'error',
		'no-sparse-arrays': 'error',
		'no-throw-literal': 'error',
		'no-trailing-spaces': 'off',
		'no-undef-init': 'error',
		'no-underscore-dangle': 'off',
		'no-unsafe-finally': 'error',
		'no-unused-labels': 'error',
		'no-dupe-args': 'error',
		'no-dupe-keys': 'error',
		'no-dupe-else-if': 'error',
		'no-duplicate-case': 'error',
		'no-invalid-regexp': 'error',
		'no-inner-declarations': 'off',
		'no-with': 'error',
		'no-useless-catch': 'error',
		'no-setter-return': 'error',
		'no-unexpected-multiline': 'error',
		'no-unreachable': 'error',
		'no-irregular-whitespace': 'error',
		'no-implicit-coercion': 'error',
		'no-var': 'off',
		'no-extra-parens': 'error',
		'arrow-spacing': 'error',
		'object-shorthand': ['error', 'never'],
		'one-var': ['off', 'never'],
		'prefer-arrow/prefer-arrow-functions': 'off',
		'prefer-const': 'off',
		'prefer-object-spread': 'off',
		'rest-spread-spacing': ['error', 'never'],
		'no-useless-call': 'error',
		'quote-props': 'off',
		radix: 'off',
		'use-isnan': 'error',
		'valid-typeof': 'error',
		'spaced-comment': [
			'error',
			'always',
			{markers: ['/']}
		],
		'capitalized-comments': 'off',
		'eol-last': ['error', 'always'],
		'no-unneeded-ternary': 'error',
		'object-curly-newline': ['error', {multiline: true}],
		'object-property-newline': ['error', {allowAllPropertiesOnSameLine: true}],
		'object-curly-spacing': ['error', 'never'],
		'array-bracket-spacing': ['error', 'never'],
		'space-before-function-paren': ['error', 'never'],
		'computed-property-spacing': ['error', 'never'],
		'comma-spacing': ['error', {'before': false, 'after': true}],
		'key-spacing': ['error', {'beforeColon': false, 'afterColon': true}],
		'comma-dangle': ['error', 'never']
	}
};
