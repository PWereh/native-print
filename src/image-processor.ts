import { PrintPluginSettings } from './settings';

/**
 * Generate the CSS block that controls image appearance in print output.
 * All rules target `img` elements — safe to inject as a <style> block.
 */
export function generateImageCss(s: PrintPluginSettings): string {
	if (s.stripImages) {
		return `/* ── Image strip ── */\nimg { display: none !important; }`;
	}

	const rules: string[] = [];

	// --- Filter ---
	const filterMap: Record<string, string> = {
		grayscale: 'grayscale(100%)',
		sepia:     'sepia(80%)',
		bw:        'grayscale(100%) contrast(120%)',
		none:      '',
	};
	const filterVal = filterMap[s.imageFilter] ?? '';

	// --- Opacity ---
	const opacity = Math.min(100, Math.max(0, s.imageOpacity)) / 100;

	// --- Max-width ---
	const maxW = Math.min(200, Math.max(10, s.imageMaxWidthPct));

	// --- Border radius ---
	const radius = Math.min(50, Math.max(0, s.imageBorderRadius));

	// --- Drop shadow ---
	const shadow = s.imageDropShadow
		? 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))'
		: '';

	// Build filter string
	const filterParts = [filterVal, shadow].filter(Boolean).join(' ');

	// Compose img rule
	const props: string[] = [
		`max-width: ${maxW}% !important`,
		`height: auto !important`,
		`page-break-inside: avoid`,
	];
	if (opacity < 1)        props.push(`opacity: ${opacity}`);
	if (radius > 0)         props.push(`border-radius: ${radius}px`);
	if (filterParts)        props.push(`filter: ${filterParts}`);
	if (filterParts)        props.push(`-webkit-filter: ${filterParts}`);

	rules.push(`/* ── Image manipulation ── */`);
	rules.push(`img { ${props.join('; ')}; }`);

	// Centre images if < 100% width (avoids left-flush look)
	if (maxW < 100) {
		rules.push(`figure, p:has(> img:only-child) { text-align: center; }`);
	}

	return rules.join('\n');
}
