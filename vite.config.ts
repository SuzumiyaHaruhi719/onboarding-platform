import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 5180,
		strictPort: true,
		allowedHosts: true
	},
	test: {
		include: ['src/**/*.{test,spec}.ts']
	}
});
