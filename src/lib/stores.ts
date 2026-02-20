import { writable } from 'svelte/store';

export const darkMode = writable(false);

export function initializeDarkMode(): boolean {
	const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('darkMode') : null;
	let isDark = false;
	
	if (saved !== null) {
		isDark = saved === 'true';
	} else if (typeof window !== 'undefined') {
		isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	}
	
	darkMode.set(isDark);
	return isDark;
}

export function toggleDarkMode(): void {
	darkMode.update(val => {
		const newVal = !val;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('darkMode', String(newVal));
		}
		return newVal;
	});
}
