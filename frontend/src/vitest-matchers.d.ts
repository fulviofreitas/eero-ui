/**
 * Make the jest-dom matchers (toBeInTheDocument, toHaveAttribute, toBeDisabled, ...)
 * visible to svelte-check / tsc.
 *
 * `tests/setup.ts` imports `@testing-library/jest-dom` at runtime, but the generated
 * `.svelte-kit/tsconfig.json` only includes `src/**` and `test/**` (singular), so that
 * file is outside the type-check program and the `Assertion` augmentation never loads
 * in a clean CI checkout. This ambient module lives under `src/` so it is always part of
 * the program.
 */
import '@testing-library/jest-dom/vitest';
