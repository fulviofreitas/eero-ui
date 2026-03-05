/**
 * Export utilities for converting data to CSV, JSON, and YAML formats
 * and triggering browser downloads.
 */

export type ExportFormat = 'csv' | 'json' | 'yaml';

interface ExportColumn {
	key: string;
	label: string;
}

function escapeCSVValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function flattenValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) {
		return value.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).join('; ');
	}
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/**
 * Infer columns from data by collecting all unique keys across all items.
 */
function inferColumns(data: object[]): ExportColumn[] {
	const keySet = new Set<string>();
	for (const item of data) {
		for (const key of Object.keys(item)) {
			keySet.add(key);
		}
	}
	return Array.from(keySet).map((key) => ({
		key,
		label: key
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase())
	}));
}

/**
 * Convert an array of objects to CSV string.
 */
export function toCSV(data: object[], columns?: ExportColumn[]): string {
	if (data.length === 0) return '';

	const cols = columns ?? inferColumns(data);
	const records = data as Record<string, unknown>[];
	const header = cols.map((c) => escapeCSVValue(c.label)).join(',');
	const rows = records.map((item) =>
		cols.map((c) => escapeCSVValue(flattenValue(item[c.key]))).join(',')
	);

	return [header, ...rows].join('\n');
}

/**
 * Convert data to pretty-printed JSON string.
 */
export function toJSON(data: unknown): string {
	return JSON.stringify(data, null, 2);
}

/**
 * Convert data to YAML string (handles flat objects, arrays, and nested structures).
 */
export function toYAML(data: unknown, indent = 0): string {
	const pad = '  '.repeat(indent);

	if (data === null || data === undefined) return `${pad}null\n`;
	if (typeof data === 'boolean') return `${pad}${data}\n`;
	if (typeof data === 'number') return `${pad}${data}\n`;

	if (typeof data === 'string') {
		if (
			data.includes('\n') ||
			data.includes(':') ||
			data.includes('#') ||
			data.includes('"') ||
			data.includes("'") ||
			data.startsWith(' ') ||
			data.endsWith(' ') ||
			data === '' ||
			data === 'true' ||
			data === 'false' ||
			data === 'null' ||
			/^\d+(\.\d+)?$/.test(data)
		) {
			return `${pad}"${data.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"\n`;
		}
		return `${pad}${data}\n`;
	}

	if (Array.isArray(data)) {
		if (data.length === 0) return `${pad}[]\n`;
		let result = '';
		for (const item of data) {
			if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
				const entries = Object.entries(item);
				if (entries.length === 0) {
					result += `${pad}- {}\n`;
				} else {
					const [firstKey, firstVal] = entries[0];
					result += `${pad}- ${firstKey}: ${yamlScalar(firstVal)}`;
					for (let i = 1; i < entries.length; i++) {
						const [key, val] = entries[i];
						if (typeof val === 'object' && val !== null) {
							result += `${pad}  ${key}:\n${toYAML(val, indent + 2)}`;
						} else {
							result += `${pad}  ${key}: ${yamlScalar(val)}`;
						}
					}
				}
			} else {
				result += `${pad}- ${yamlScalar(item)}`;
			}
		}
		return result;
	}

	if (typeof data === 'object') {
		const entries = Object.entries(data as Record<string, unknown>);
		if (entries.length === 0) return `${pad}{}\n`;
		let result = '';
		for (const [key, val] of entries) {
			if (typeof val === 'object' && val !== null) {
				result += `${pad}${key}:\n${toYAML(val, indent + 1)}`;
			} else {
				result += `${pad}${key}: ${yamlScalar(val)}`;
			}
		}
		return result;
	}

	return `${pad}${String(data)}\n`;
}

function yamlScalar(value: unknown): string {
	if (value === null || value === undefined) return 'null\n';
	if (typeof value === 'boolean') return `${value}\n`;
	if (typeof value === 'number') return `${value}\n`;
	if (typeof value === 'string') {
		if (
			value.includes('\n') ||
			value.includes(':') ||
			value.includes('#') ||
			value.includes('"') ||
			value.includes("'") ||
			value.startsWith(' ') ||
			value.endsWith(' ') ||
			value === '' ||
			value === 'true' ||
			value === 'false' ||
			value === 'null' ||
			/^\d+(\.\d+)?$/.test(value)
		) {
			return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"\n`;
		}
		return `${value}\n`;
	}
	return `${JSON.stringify(value)}\n`;
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

const MIME_TYPES: Record<ExportFormat, string> = {
	csv: 'text/csv;charset=utf-8',
	json: 'application/json;charset=utf-8',
	yaml: 'text/yaml;charset=utf-8'
};

const EXTENSIONS: Record<ExportFormat, string> = {
	csv: 'csv',
	json: 'json',
	yaml: 'yaml'
};

/**
 * Export data to a file in the specified format.
 * For CSV, pass an array of objects. For JSON/YAML, any data structure works.
 */
export function exportData(
	data: object[],
	format: ExportFormat,
	baseFilename: string,
	columns?: ExportColumn[]
): void {
	let content: string;

	switch (format) {
		case 'csv':
			content = toCSV(data, columns);
			break;
		case 'json':
			content = toJSON(data);
			break;
		case 'yaml':
			content = toYAML(data);
			break;
	}

	const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
	const filename = `${baseFilename}-${timestamp}.${EXTENSIONS[format]}`;

	downloadFile(content, filename, MIME_TYPES[format]);
}
