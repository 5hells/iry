<script lang="ts">
	import { onMount } from 'svelte';

	interface ThemeConfig {
		primaryColor: string;
		secondaryColor: string;
		accentColor: string;
		backgroundColor: string;
	}

	let {
		onSave = (config: ThemeConfig) => {},
		initialConfig = null as ThemeConfig | null
	}: {
		onSave?: (config: ThemeConfig) => void;
		initialConfig?: ThemeConfig | null;
	} = $props();

	const defaultConfig: ThemeConfig = {
		primaryColor: '#0078D4',
		secondaryColor: '#50E6FF',
		accentColor: '#F7630C',
		backgroundColor: '#1E1E1E'
	};

	let baseColor = $state('#0078D4');
	let brightness = $state(50);
	let scheme = $state<'analogous' | 'complementary' | 'triadic' | 'monochromatic'>('analogous');
	let theme = $state<ThemeConfig>({
		primaryColor: '#0078D4',
		secondaryColor: '#50E6FF',
		accentColor: '#F7630C',
		backgroundColor: '#1E1E1E'
	});
	let themeLoaded = $state(false);

	let colorCache = $state<Map<string, ThemeConfig>>(new Map());

	onMount(() => {
		const config = initialConfig || defaultConfig;
		theme = { ...config };
		baseColor = config.primaryColor;
		updateThemeColors();
		themeLoaded = true;
	});

	function getCacheKey(): string {
		return `${baseColor}-${brightness}-${scheme}`;
	}

	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
		return match
			? {
					r: parseInt(match[1], 16),
					g: parseInt(match[2], 16),
					b: parseInt(match[3], 16)
				}
			: null;
	}

	function rgbToHex(r: number, g: number, b: number): string {
		return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
	}

	function rgbToHSL(r: number, g: number, b: number): { h: number; s: number; l: number } {
		r /= 255;
		g /= 255;
		b /= 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h = 0,
			s = 0,
			l = (max + min) / 2;

		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break;
			}
			h *= 60;
		}
		return { h, s, l };
	}

	function hslToHex(h: number, s: number, l: number): string {
		h /= 360;
		s = Math.max(0, Math.min(1, s));
		l = Math.max(0, Math.min(1, l));
		let r: number, g: number, b: number;

		if (s === 0) {
			r = g = b = Math.round(l * 255);
		} else {
			const hue2rgb = (p: number, q: number, t: number) => {
				if (t < 0) t += 1;
				if (t > 1) t -= 1;
				if (t < 1 / 6) return p + (q - p) * 6 * t;
				if (t < 1 / 2) return q;
				if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
				return p;
			};

			const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;
			r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
			g = Math.round(hue2rgb(p, q, h) * 255);
			b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
		}

		return rgbToHex(
			Math.max(0, Math.min(255, r)),
			Math.max(0, Math.min(255, g)),
			Math.max(0, Math.min(255, b))
		);
	}

	function hexToHSL(hex: string): { h: number; s: number; l: number } {
		const rgb = hexToRgb(hex);
		if (!rgb) return { h: 0, s: 0, l: 0 };
		return rgbToHSL(rgb.r, rgb.g, rgb.b);
	}

	function mixRgb(
		base: { r: number; g: number; b: number },
		mix: { r: number; g: number; b: number },
		weight: number
	): { r: number; g: number; b: number } {
		return {
			r: Math.round(base.r * (1 - weight) + mix.r * weight),
			g: Math.round(base.g * (1 - weight) + mix.g * weight),
			b: Math.round(base.b * (1 - weight) + mix.b * weight)
		};
	}

	function setColorScale(prefix: string, hex: string) {
		const base = hexToRgb(hex);
		if (!base) return;
		const white = { r: 255, g: 255, b: 255 };
		const black = { r: 0, g: 0, b: 0 };
		const scale: Record<number, { r: number; g: number; b: number }> = {
			50: mixRgb(base, white, 0.92),
			100: mixRgb(base, white, 0.84),
			200: mixRgb(base, white, 0.72),
			300: mixRgb(base, white, 0.58),
			400: mixRgb(base, white, 0.4),
			500: base,
			600: mixRgb(base, black, 0.12),
			700: mixRgb(base, black, 0.24),
			800: mixRgb(base, black, 0.38),
			900: mixRgb(base, black, 0.52),
			950: mixRgb(base, black, 0.68)
		};

		Object.entries(scale).forEach(([key, value]) => {
			document.documentElement.style.setProperty(
				`--color-${prefix}-${key}`,
				`${value.r} ${value.g} ${value.b}`
			);
			document.documentElement.style.setProperty(
				`--color-${prefix}-${key}-hex`,
				rgbToHex(value.r, value.g, value.b)
			);
		});
	}

	function updateThemeColors() {
		const cacheKey = getCacheKey();

		if (colorCache.has(cacheKey)) {
			theme = { ...colorCache.get(cacheKey)! };
			applyTheme();
			return;
		}

		const hsl = hexToHSL(baseColor);

		const baseLPercent = Math.round(hsl.l * 100);
		const adjustedLPercent = Math.max(10, Math.min(90, baseLPercent + (brightness - 50) * 0.6));
		const adjustedL = adjustedLPercent / 100;

		let secondaryHue, accentHue;

		switch (scheme) {
			case 'analogous':
				secondaryHue = (hsl.h + 30) % 360;
				accentHue = (hsl.h + 330) % 360;
				theme.primaryColor = hslToHex(hsl.h, hsl.s, adjustedL);
				theme.secondaryColor = hslToHex(
					secondaryHue,
					hsl.s * 0.8,
					Math.max(0, Math.min(1, (adjustedLPercent + 10) / 100))
				);
				theme.accentColor = hslToHex(
					accentHue,
					hsl.s,
					Math.max(0, Math.min(1, (adjustedLPercent - 10) / 100))
				);
				break;
			case 'complementary':
				accentHue = (hsl.h + 180) % 360;
				theme.primaryColor = hslToHex(hsl.h, hsl.s, adjustedL);
				theme.secondaryColor = hslToHex(
					hsl.h,
					hsl.s * 0.6,
					Math.max(0, Math.min(1, (adjustedLPercent + 15) / 100))
				);
				theme.accentColor = hslToHex(accentHue, hsl.s * 0.9, adjustedL);
				break;
			case 'triadic':
				secondaryHue = (hsl.h + 120) % 360;
				accentHue = (hsl.h + 240) % 360;
				theme.primaryColor = hslToHex(hsl.h, hsl.s, adjustedL);
				theme.secondaryColor = hslToHex(
					secondaryHue,
					hsl.s * 0.8,
					Math.max(0, Math.min(1, (adjustedLPercent + 5) / 100))
				);
				theme.accentColor = hslToHex(
					accentHue,
					hsl.s * 0.9,
					Math.max(0, Math.min(1, (adjustedLPercent - 5) / 100))
				);
				break;
			case 'monochromatic':
				theme.primaryColor = hslToHex(hsl.h, hsl.s, adjustedL);
				theme.secondaryColor = hslToHex(
					hsl.h,
					hsl.s * 0.7,
					Math.max(0, Math.min(1, (adjustedLPercent + 15) / 100))
				);
				theme.accentColor = hslToHex(
					hsl.h,
					hsl.s * 1.2,
					Math.max(0, Math.min(1, (adjustedLPercent - 15) / 100))
				);
				break;
		}

		theme.backgroundColor =
			brightness < 50 ? hslToHex(hsl.h, 0.15, 0.1) : hslToHex(hsl.h, 0.1, 0.95);

		colorCache.set(cacheKey, { ...theme });

		console.log('[theme-client] updateThemeColors:', {
			baseColor,
			brightness,
			scheme,
			primary: theme.primaryColor,
			secondary: theme.secondaryColor,
			accent: theme.accentColor,
			background: theme.backgroundColor
		});

		applyTheme();
	}

	function applyTheme() {
		document.documentElement.style.setProperty('--theme-primary', theme.primaryColor);
		document.documentElement.style.setProperty('--theme-secondary', theme.secondaryColor);
		document.documentElement.style.setProperty('--theme-accent', theme.accentColor);
		document.documentElement.style.setProperty('--theme-background', theme.backgroundColor);
		setColorScale('primary', theme.primaryColor);
		setColorScale('secondary', theme.secondaryColor);
		setColorScale('tertiary', theme.accentColor);
	}

	async function handleSave() {
		updateThemeColors();
		console.log('[theme-client] sending theme:', {
			primary: theme.primaryColor,
			secondary: theme.secondaryColor,
			accent: theme.accentColor,
			background: theme.backgroundColor,
			baseColor
		});
		try {
			const response = await fetch('/api/user/theme', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(theme)
			});

			if (response.ok) {
				onSave(theme);
			} else {
				console.error('Failed to save theme');
			}
		} catch (error) {
			console.error('Error saving theme:', error);
		}
	}

	function resetToDefault() {
		const config = initialConfig || defaultConfig;
		theme = { ...config };
		baseColor = config.primaryColor;
		brightness = 50;
		scheme = 'analogous';
		colorCache.clear(); 
		updateThemeColors();
	}
</script>

<div class="theme-customizer mx-auto max-w-4xl p-6">
	<div class="mb-8 flex items-center justify-between border-b border-[var(--border-color)] pb-4">
		<h2 class="text-xl font-semibold">Theme Color Configuration</h2>
		<div class="flex gap-2">
			<button
				onclick={resetToDefault}
				class="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2 font-medium hover:bg-[var(--bg-secondary)]"
			>
				Reset
			</button>
			<button
				onclick={handleSave}
				class="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-5 py-2 font-medium text-white hover:bg-[var(--bg-secondary)]"
			>
				Save Changes
			</button>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		
		<div class="controls-section space-y-6">
			<div class="rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-5">
				<h3 class="mb-4 text-sm font-semibold tracking-wide text-[var(--text-primary)] uppercase">
					Base Color
				</h3>
				<div class="space-y-4">
					<div class="flex items-center gap-4">
						<label
							for="theme-color-picker"
							class="h-16 w-16 flex-shrink-0 cursor-pointer rounded border-2 border-[var(--border-color)] transition hover:border-[var(--color-primary-500)]"
							style="background-color: {baseColor};"
							title="Click to select color"
						></label>
						<div class="flex-1">
							<input
								id="theme-color-picker"
								type="color"
								bind:value={baseColor}
								onchange={updateThemeColors}
								class="h-12 w-full cursor-pointer rounded"
								title="Select base color"
							/>
						</div>
					</div>
					<input
						type="text"
						bind:value={baseColor}
						onchange={() => {
							if (/^#[0-9a-f]{6}$/i.test(baseColor)) {
								updateThemeColors();
							} else if (baseColor.length === 6 && /^[0-9a-f]{6}$/i.test(baseColor)) {
								baseColor = '#' + baseColor;
								updateThemeColors();
							}
						}}
						onblur={() => {
							if (!/^#[0-9a-f]{6}$/i.test(baseColor)) {
								baseColor = '#0078D4';
								updateThemeColors();
							}
						}}
						class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-4 py-2 text-center font-mono outline-none focus:border-[var(--border-color)] focus:ring-1 focus:ring-[var(--border-color)]"
					/>
				</div>
			</div>

			<div class="rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-5">
				<h3 class="mb-4 text-sm font-semibold tracking-wide text-[var(--text-primary)] uppercase">
					Color Scheme
				</h3>
				<div class="grid grid-cols-2 gap-2">
					<button
						onclick={() => {
							scheme = 'analogous';
							updateThemeColors();
						}}
						class="rounded border px-4 py-2.5 text-sm font-medium"
						class:bg-[var(--bg-secondary)]={scheme === 'analogous'}
						class:text-white={scheme === 'analogous'}
						class:bg-[var(--bg-base)]={scheme !== 'analogous'}
						class:text-[var(--text-primary)]={scheme !== 'analogous'}
					>
						Analogous
					</button>
					<button
						onclick={() => {
							scheme = 'complementary';
							updateThemeColors();
						}}
						class="rounded border px-4 py-2.5 text-sm font-medium"
						class:bg-[var(--bg-secondary)]={scheme === 'complementary'}
						class:text-white={scheme === 'complementary'}
						class:bg-[var(--bg-base)]={scheme !== 'complementary'}
						class:text-[var(--text-primary)]={scheme !== 'complementary'}
					>
						Complementary
					</button>
					<button
						onclick={() => {
							scheme = 'triadic';
							updateThemeColors();
						}}
						class="rounded border px-4 py-2.5 text-sm font-medium"
						class:bg-[var(--bg-secondary)]={scheme === 'triadic'}
						class:text-white={scheme === 'triadic'}
						class:bg-[var(--bg-base)]={scheme !== 'triadic'}
						class:text-[var(--text-primary)]={scheme !== 'triadic'}
					>
						Triadic
					</button>
					<button
						onclick={() => {
							scheme = 'monochromatic';
							updateThemeColors();
						}}
						class="rounded border px-4 py-2.5 text-sm font-medium"
						class:bg-[var(--bg-secondary)]={scheme === 'monochromatic'}
						class:text-white={scheme === 'monochromatic'}
						class:bg-[var(--bg-base)]={scheme !== 'monochromatic'}
						class:text-[var(--text-primary)]={scheme !== 'monochromatic'}
					>
						Monochromatic
					</button>
				</div>
			</div>

			<div class="rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-5">
				<h3 class="mb-4 text-sm font-semibold tracking-wide text-[var(--text-primary)] uppercase">
					Brightness
				</h3>
				<div>
					<input
						type="range"
						bind:value={brightness}
						oninput={updateThemeColors}
						min="0"
						max="100"
						class="h-2 w-full cursor-pointer appearance-none rounded bg-[var(--bg-secondary)]"
					/>
					<div class="mt-2 flex justify-between text-xs text-[var(--text-secondary)]">
						<span>Dark</span>
						<span class="font-medium">{brightness}%</span>
						<span>Light</span>
					</div>
				</div>
			</div>
		</div>

		
		<div class="preview-section space-y-6">
			<div class="rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-5">
				<h3 class="mb-4 text-sm font-semibold tracking-wide text-[var(--text-primary)] uppercase">
					Generated Palette
				</h3>
				<div class="space-y-2">
					<div
						class="flex items-center gap-3 rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-3"
					>
						<div
							class="h-10 w-10 flex-shrink-0 rounded border border-[var(--border-color)]"
							style="background-color: {theme.primaryColor};"
						></div>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium">Primary</div>
							<code class="text-xs text-[var(--text-secondary)]">{theme.primaryColor}</code>
						</div>
					</div>
					<div
						class="flex items-center gap-3 rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-3"
					>
						<div
							class="h-10 w-10 flex-shrink-0 rounded border border-[var(--border-color)]"
							style="background-color: {theme.secondaryColor};"
						></div>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium">Secondary</div>
							<code class="text-xs text-[var(--text-secondary)]">{theme.secondaryColor}</code>
						</div>
					</div>
					<div
						class="flex items-center gap-3 rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-3"
					>
						<div
							class="h-10 w-10 flex-shrink-0 rounded border border-[var(--border-color)]"
							style="background-color: {theme.accentColor};"
						></div>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium">Accent</div>
							<code class="text-xs text-[var(--text-secondary)]">{theme.accentColor}</code>
						</div>
					</div>
					<div
						class="flex items-center gap-3 rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-3"
					>
						<div
							class="h-10 w-10 flex-shrink-0 rounded border border-[var(--border-color)]"
							style="background-color: {theme.backgroundColor};"
						></div>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium">Background</div>
							<code class="text-xs text-[var(--text-secondary)]">{theme.backgroundColor}</code>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 2px solid rgba(var(--color-primary-400), 0.3);
		border-top-color: rgb(var(--color-primary-600));
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	input[type='color'] {
		appearance: none;
		-webkit-appearance: none;
		border: none;
		cursor: pointer;
	}

	input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	input[type='color']::-webkit-color-swatch {
		border: none;
		border-radius: 0.25rem;
	}

	input[type='range'] {
		appearance: none;
		-webkit-appearance: none;
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 2px;
		background: rgb(var(--color-primary-600));
		border: 1px solid rgb(var(--color-primary-700));
		cursor: pointer;
	}

	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 2px;
		background: rgb(var(--color-primary-600));
		border: 1px solid rgb(var(--color-primary-700));
		cursor: pointer;
	}
</style>
