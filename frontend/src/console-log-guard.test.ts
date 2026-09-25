/**
 * console.log guard (plan § 6.2 Tier 4 / WP9: "strip the 13 console.log"s).
 *
 * WP9 removed the last 7 `console.log(` call sites from product code
 * (frontend/src/lib/stores/devices.ts and frontend/src/routes/**). This walks
 * `src` (excluding *.test.ts, where deliberate debug helpers are fine) and
 * fails if any `console.log(` call site is reintroduced. `console.error`/
 * `console.warn` are unaffected - they report real failures.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_DIR = join(__dirname);

function collectSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			files.push(...collectSourceFiles(fullPath));
		} else if (/\.(ts|svelte)$/.test(entry) && !entry.endsWith('.test.ts')) {
			files.push(fullPath);
		}
	}
	return files;
}

describe('console.log guard', () => {
	it('has zero console.log( call sites in src (excluding *.test.ts)', () => {
		const offenders: string[] = [];

		for (const file of collectSourceFiles(SRC_DIR)) {
			const content = readFileSync(file, 'utf-8');
			const lines = content.split('\n');
			lines.forEach((line, index) => {
				if (line.includes('console.log(')) {
					offenders.push(`${relative(SRC_DIR, file)}:${index + 1}`);
				}
			});
		}

		expect(offenders).toEqual([]);
	});
});
