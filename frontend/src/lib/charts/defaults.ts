/**
 * Shared Chart.js configuration.
 *
 * Single registration point plus a theme-aware options/palette factory for every chart
 * component (`SpeedtestChart`, `ClientCountChart`, `BandwidthChart`, `TimeSeriesChart`,
 * `PieChart`, `BarGauge`). Consolidates what used to be six independent `ChartJS.register`
 * calls and (at least) three unrelated palettes, one of them Chart.js's stock demo colours
 * (`SpeedtestChart.svelte:28-36` pre-refactor).
 *
 * Canvas cannot parse `var(--token)` strings (`PieChart.svelte:66` used to pass
 * `var(--color-bg-secondary)` straight into a canvas fill and silently rendered nothing
 * useful). Every colour handed to Chart.js here is therefore read as a *computed* value via
 * `getComputedStyle(document.documentElement)`, never a raw CSS custom-property string.
 */

import {
	Chart as ChartJS,
	ArcElement,
	DoughnutController,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	LineController,
	TimeScale,
	Filler,
	Title,
	Tooltip,
	Legend,
	type ChartOptions
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { theme as themeStore } from '$stores';

let registered = false;

/**
 * Register every Chart.js element/controller/plugin used anywhere in the app. Idempotent —
 * safe to call from every chart component's module scope.
 */
export function registerCharts(): void {
	if (registered) return;
	ChartJS.register(
		ArcElement,
		DoughnutController,
		CategoryScale,
		LinearScale,
		PointElement,
		LineElement,
		LineController,
		TimeScale,
		Filler,
		Title,
		Tooltip,
		Legend
	);
	registered = true;
}

export interface ThemeColors {
	/** The six `--chart-1`..`--chart-6` series colours, in order. */
	series: [string, string, string, string, string, string];
	/** `--chart-grid`, resolved. */
	grid: string;
	/** `--chart-text`, resolved. */
	text: string;
	/** `--color-bg-secondary`, resolved — chart/tooltip surface. */
	surface: string;
	/** `--color-border`, resolved. */
	border: string;
}

const FALLBACK_SERIES: ThemeColors['series'] = [
	'#58a6ff',
	'#3fb950',
	'#d29922',
	'#f85149',
	'#bc8cff',
	'#39c5cf'
];

/**
 * Read the current theme's chart tokens as computed colour values. Must be called client-side
 * (guarded for SSR/test environments with no `document`).
 */
export function readThemeColors(): ThemeColors {
	if (typeof document === 'undefined') {
		return {
			series: FALLBACK_SERIES,
			grid: 'rgba(230, 237, 243, 0.08)',
			text: '#8b949e',
			surface: '#161b22',
			border: '#30363d'
		};
	}

	const computed = getComputedStyle(document.documentElement);
	const read = (name: string, fallback: string) => {
		const value = computed.getPropertyValue(name).trim();
		return value.length > 0 ? value : fallback;
	};

	const series = [1, 2, 3, 4, 5, 6].map((n) =>
		read(`--chart-${n}`, FALLBACK_SERIES[n - 1])
	) as ThemeColors['series'];

	return {
		series,
		grid: read('--chart-grid', 'rgba(230, 237, 243, 0.08)'),
		text: read('--chart-text', '#8b949e'),
		surface: read('--color-bg-secondary', '#161b22'),
		border: read('--color-border', '#30363d')
	};
}

/** The Nth series colour (wraps past 6), from a given (or freshly-read) theme snapshot. */
export function seriesColor(index: number, colors: ThemeColors = readThemeColors()): string {
	return colors.series[
		((index % colors.series.length) + colors.series.length) % colors.series.length
	];
}

/** Adds alpha to a `#rrggbb` colour. Falls through unchanged for any other format. */
export function withAlpha(color: string, alpha: number): string {
	const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
	if (!match) return color;
	const int = parseInt(match[1], 16);
	const r = (int >> 16) & 255;
	const g = (int >> 8) & 255;
	const b = int & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The `plugins` block shared by every line/time-series chart, theme-aware. */
function lineChartPlugins(
	title: string,
	valueSuffix: string,
	colors: ThemeColors
): ChartOptions<'line'>['plugins'] {
	return {
		legend: {
			position: 'top',
			labels: { color: colors.text }
		},
		title: {
			display: !!title,
			text: title,
			color: colors.text
		},
		tooltip: {
			backgroundColor: colors.surface,
			borderColor: colors.border,
			borderWidth: 1,
			titleColor: colors.text,
			bodyColor: colors.text,
			callbacks: {
				label: (context) => {
					const value = context.parsed.y;
					if (value === null || value === undefined) return '';
					return `${context.dataset.label}: ${value.toFixed(2)} ${valueSuffix}`.trim();
				}
			}
		}
	};
}

/** The `scales` block shared by every line/time-series chart, theme-aware. */
function lineChartScales(yAxisLabel: string, colors: ThemeColors): ChartOptions<'line'>['scales'] {
	return {
		x: {
			type: 'time',
			time: {
				tooltipFormat: 'PPpp',
				displayFormats: { hour: 'HH:mm', day: 'MMM d' }
			},
			title: { display: true, text: 'Time', color: colors.text },
			grid: { color: colors.grid },
			ticks: { color: colors.text }
		},
		y: {
			beginAtZero: true,
			title: { display: !!yAxisLabel, text: yAxisLabel, color: colors.text },
			grid: { color: colors.grid },
			ticks: { color: colors.text }
		}
	};
}

/** Base options shared by every line/time-series chart, theme-aware. */
export function lineChartOptions(
	opts: {
		title?: string;
		yAxisLabel?: string;
		valueSuffix?: string;
		colors?: ThemeColors;
	} = {}
): ChartOptions<'line'> {
	const { title = '', yAxisLabel = '', valueSuffix = '' } = opts;
	const colors = opts.colors ?? readThemeColors();

	return {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: 'index', intersect: false },
		plugins: lineChartPlugins(title, valueSuffix, colors),
		scales: lineChartScales(yAxisLabel, colors)
	};
}

/** Base options shared by every doughnut/pie chart, theme-aware. */
export function doughnutChartOptions(
	opts: {
		cutout?: string;
		showLegend?: boolean;
		colors?: ThemeColors;
	} = {}
): ChartOptions<'doughnut'> {
	const { cutout = '60%', showLegend = true } = opts;
	const colors = opts.colors ?? readThemeColors();

	return {
		responsive: true,
		maintainAspectRatio: false,
		cutout,
		plugins: {
			legend: {
				display: showLegend,
				position: 'bottom',
				labels: { padding: 12, usePointStyle: true, pointStyle: 'circle', color: colors.text }
			},
			title: { display: false },
			tooltip: {
				backgroundColor: colors.surface,
				borderColor: colors.border,
				borderWidth: 1,
				titleColor: colors.text,
				bodyColor: colors.text
			}
		}
	};
}

/**
 * Subscribe to theme changes (`light`/`dark`, via the existing `theme` store — see
 * `stores/ui.ts`, itself driven by the explicit toggle and by a live `prefers-color-scheme`
 * listener). Invokes `callback` once per change so a chart component can recompute colours and
 * call `chart.update()`. Returns an unsubscribe function.
 *
 * A store subscription is used rather than a `MutationObserver` on `<html data-theme>` because
 * the store is the app's single source of truth for the active theme and already exists;
 * observing the DOM attribute directly would just be a second way to learn the same fact.
 */
export function onThemeChange(callback: () => void): () => void {
	let first = true;
	const unsubscribe = themeStore.subscribe(() => {
		if (first) {
			// The store fires its initial value synchronously on subscribe; the caller has not
			// created its chart yet at that point, so skip it.
			first = false;
			return;
		}
		callback();
	});
	return unsubscribe;
}
