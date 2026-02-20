import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		origin: 'https://localhost:5173',
		allowedHosts: ['iry.hellings.cc', 'localhost'],
		host: '127.0.0.1',
		port: 5173
	}
});
