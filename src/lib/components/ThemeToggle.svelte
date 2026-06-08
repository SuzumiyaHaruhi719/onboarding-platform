<script lang="ts">
	import { onMount } from 'svelte';
	import { getTheme, toggleTheme, type Theme } from '$lib/design/theme';

	let theme = $state<Theme>('light');

	onMount(() => {
		theme = getTheme();
	});

	function onClick(): void {
		theme = toggleTheme();
	}
</script>

<button class="theme-toggle" onclick={onClick} aria-label="切换主题 / Toggle theme">
	{theme === 'dark' ? '☾' : '☀'}
</button>

<style>
	.theme-toggle {
		width: 36px;
		height: 36px;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		border-radius: var(--radius-lg);
		font-size: var(--text-lg);
		cursor: pointer;
		transition: var(--transition-base);
	}
	.theme-toggle:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
		box-shadow: var(--shadow-sm);
	}
</style>
