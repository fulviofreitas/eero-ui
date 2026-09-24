/**
 * Guards the canvas `var()` bug (PieChart.svelte:66 pre-refactor passed
 * `var(--color-bg-secondary)` straight into a canvas fill, which canvas cannot parse) by
 * asserting `readThemeColors()` always returns resolved colour values, and that flipping
 * `data-theme` on `<html>` (which is what the app's toggle does — see stores/ui.ts
 * `applyTheme()`) changes what the palette resolves to.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readThemeColors, seriesColor, withAlpha, onThemeChange } from './defaults';
import { uiStore } from '$stores';

function setThemeTokens(theme: 'dark' | 'light') {
	document.documentElement.setAttribute('data-theme', theme);
	const style = document.documentElement.style;
	if (theme === 'dark') {
		style.setProperty('--chart-1', '#58a6ff');
		style.setProperty('--chart-grid', 'rgba(230, 237, 243, 0.08)');
		style.setProperty('--chart-text', '#8b949e');
		style.setProperty('--color-bg-secondary', '#161b22');
		style.setProperty('--color-border', '#30363d');
	} else {
		style.setProperty('--chart-1', '#0969da');
		style.setProperty('--chart-grid', 'rgba(31, 35, 40, 0.1)');
		style.setProperty('--chart-text', '#656d76');
		style.setProperty('--color-bg-secondary', '#f6f8fa');
		style.setProperty('--color-border', '#d0d7de');
	}
}

describe('readThemeColors', () => {
	beforeEach(() => {
		setThemeTokens('dark');
	});

	it('never returns a raw var() string — every value is a resolved colour', () => {
		const colors = readThemeColors();
		const allValues = [...colors.series, colors.grid, colors.text, colors.surface, colors.border];
		for (const value of allValues) {
			expect(value.startsWith('var(')).toBe(false);
		}
	});

	it("resolves the six chart-N series colours in order (guards PieChart's canvas var() bug)", () => {
		const colors = readThemeColors();
		expect(colors.series[0]).toBe('#58a6ff');
		expect(colors.surface).toBe('#161b22');
	});

	it('reflects the light theme once its tokens are applied to documentElement', () => {
		setThemeTokens('light');
		const colors = readThemeColors();
		expect(colors.series[0]).toBe('#0969da');
		expect(colors.surface).toBe('#f6f8fa');
	});
});

describe('seriesColor', () => {
	it('wraps around past the sixth colour', () => {
		const colors = readThemeColors();
		expect(seriesColor(6, colors)).toBe(colors.series[0]);
		expect(seriesColor(7, colors)).toBe(colors.series[1]);
	});
});

describe('withAlpha', () => {
	it('converts a #rrggbb colour to rgba with the given alpha', () => {
		expect(withAlpha('#58a6ff', 0.1)).toBe('rgba(88, 166, 255, 0.1)');
	});

	it('passes through colours it cannot parse unchanged', () => {
		expect(withAlpha('rgb(1, 2, 3)', 0.1)).toBe('rgb(1, 2, 3)');
	});
});

describe('onThemeChange', () => {
	it('invokes the callback when the theme store changes, but not for the initial subscription', () => {
		const callback = vi.fn();
		const unsubscribe = onThemeChange(callback);

		expect(callback).not.toHaveBeenCalled();
		uiStore.setTheme('light');
		expect(callback).toHaveBeenCalledOnce();

		unsubscribe();
		uiStore.setTheme('dark');
		expect(callback).toHaveBeenCalledOnce();
	});
});
