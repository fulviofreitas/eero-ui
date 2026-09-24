/**
 * Breakpoints
 *
 * CSS custom properties cannot be read inside a `@media` feature list, so the pixel values are
 * documented once in app.css (as comments) and defined once here for anywhere TypeScript/Svelte
 * logic needs to branch on viewport width (e.g. `window.innerWidth` checks). Keep both in sync.
 */

export const BREAKPOINTS = {
	sm: 480,
	md: 768,
	lg: 1024,
	xl: 1400
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;
