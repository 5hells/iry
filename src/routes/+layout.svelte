<script lang="ts">
	import './layout.css';

	import Navbar from '$lib/components/Navbar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { darkMode, initializeDarkMode } from '$lib/stores';
	import { onMount } from 'svelte';

	interface LayoutData {
		user?: any;
		theme?: {
			primaryColor: string;
			secondaryColor: string;
			accentColor: string;
			backgroundColor: string;
		};
	}

	let {
		children,
		data
	}: {
		children: any;
		data: LayoutData;
	} = $props();

	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const normalized = hex.replace('#', '');
		if (normalized.length !== 6) return null;
		const r = Number.parseInt(normalized.slice(0, 2), 16);
		const g = Number.parseInt(normalized.slice(2, 4), 16);
		const b = Number.parseInt(normalized.slice(4, 6), 16);
		if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
		return { r, g, b };
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
		});
	}

	function applyTheme(theme: NonNullable<LayoutData['theme']>) {
		document.documentElement.style.setProperty('--theme-primary', theme.primaryColor);
		document.documentElement.style.setProperty('--theme-secondary', theme.secondaryColor);
		document.documentElement.style.setProperty('--theme-accent', theme.accentColor);
		document.documentElement.style.setProperty('--theme-background', theme.backgroundColor);
		setColorScale('primary', theme.primaryColor);
		setColorScale('secondary', theme.secondaryColor);
		setColorScale('tertiary', theme.accentColor);
	}

	let isDarkMode = $state(false);

	const theme = data?.theme ?? {
		primaryColor: '#5c7cfa',
		secondaryColor: '#748ffc',
		accentColor: '#ff6b6b',
		backgroundColor: '#1a1b1e'
	};

	onMount(() => {
		
		const initialized = initializeDarkMode();
		isDarkMode = initialized;

		
		const unsubscribe = darkMode.subscribe(value => {
			isDarkMode = value;
		});

		return unsubscribe;
	});

	$effect(() => {
		
		if (isDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}

		
		const themeToApply = data?.theme ?? {
			primaryColor: '#5c7cfa',
			secondaryColor: '#748ffc',
			accentColor: '#ff6b6b',
			backgroundColor: isDarkMode ? '#1a1b1e' : '#ffffff'
		};

		applyTheme(themeToApply);
	});
</script>

<svelte:head>
	<title>Iry</title>
</svelte:head>

<Navbar {data}>
	{@render children()}
</Navbar>
<Toast />
<Modal />
