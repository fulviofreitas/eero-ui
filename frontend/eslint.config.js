import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				__APP_VERSION__: 'readonly'
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		rules: {
			// Allow unused variables with underscore prefix or in catch clauses
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			// Allow case declarations (common pattern in reducers/handlers)
			'no-case-declarations': 'off',
			// Svelte-specific: downgrade to warnings for existing codebase
			'svelte/valid-compile': ['warn', { ignoreWarnings: true }],
			'svelte/no-unused-svelte-ignore': 'warn',
			// ============================================================
			// Svelte 5 Migration: Disabled Rules
			// ============================================================
			// These rules were introduced in eslint-plugin-svelte v3 for Svelte 5.
			// They are disabled to allow gradual migration from Svelte 4 patterns.
			// TODO: Enable these rules and fix the codebase incrementally.
			//
			// svelte/require-each-key: Requires {#each} blocks to have a key
			//   - Improves rendering performance and prevents bugs with keyed updates
			//   - Fix: Add (item.id) or similar key to each block: {#each items as item (item.id)}
			'svelte/require-each-key': 'off',
			//
			// svelte/no-navigation-without-resolve: Requires resolve() for goto/href
			//   - Ensures proper URL resolution in SvelteKit applications
			//   - Fix: Use resolve() from $app/paths or relative paths
			'svelte/no-navigation-without-resolve': 'off',
			//
			// svelte/no-reactive-functions: Disallows function creation in reactive statements
			//   - Prevents unnecessary function recreation on each reactive update
			//   - Fix: Move function definitions outside of $: reactive blocks
			'svelte/no-reactive-functions': 'off'
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/', 'node_modules/', 'coverage/']
	}
];
