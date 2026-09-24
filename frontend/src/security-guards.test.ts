/**
 * Static security guards (plan § 8.2, WP1 security review).
 *
 * These tests walk `src/` at test time rather than rendering components,
 * because the property they guard - "nobody introduced `{@html}` with
 * server-controlled text" - is about what's absent from the source tree, not
 * about any one component's runtime behaviour.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives at src/security-guards.test.ts, so its own directory is `src/`.
const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

function walk(dir: string, predicate: (path: string) => boolean, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stats = statSync(full);
		if (stats.isDirectory()) {
			walk(full, predicate, out);
		} else if (predicate(full)) {
			out.push(full);
		}
	}
	return out;
}

describe('no {@html} anywhere in src (XSS guard)', () => {
	it('zero .svelte files use {@html} - the API surfaces `detail`/`message`/error fields that must never be rendered as HTML', () => {
		const svelteFiles = walk(SRC_ROOT, (p) => extname(p) === '.svelte');
		const offenders: Array<{ file: string; line: number }> = [];

		for (const file of svelteFiles) {
			const lines = readFileSync(file, 'utf-8').split('\n');
			lines.forEach((line, idx) => {
				if (line.includes('{@html')) {
					offenders.push({ file, line: idx + 1 });
				}
			});
		}

		// If this ever needs to be non-zero, the new {@html} call site must be
		// audited to prove its input can never contain an ApiClientError field
		// (detail/message/type) or any other server-controlled string, and
		// this test updated to name the reviewed exception explicitly rather
		// than being weakened to a no-op.
		expect(offenders).toEqual([]);
	});
});
