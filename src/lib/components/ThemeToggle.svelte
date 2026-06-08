<script lang="ts">
	import { onMount } from 'svelte';
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { getTheme, toggleTheme, type Theme } from '$lib/design/theme';
	import Icon from '$lib/components/Icon.svelte';

	let theme = $state<Theme>('light');
	let mounted = $state(false);

	onMount(() => {
		theme = getTheme();
		mounted = true;
	});

	function onClick(): void {
		theme = toggleTheme();
	}
</script>

<button class="theme-toggle" onclick={onClick} aria-label="切换主题 / Toggle theme">
	{#key theme}
		<span
			class="ico"
			in:scale|local={{ start: 0.4, opacity: 0, duration: mounted ? 220 : 0, easing: cubicOut }}
			out:scale|local={{ start: 0.4, opacity: 0, duration: 150, easing: cubicOut }}
		>
			<Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} />
		</span>
	{/key}
</button>

<style>
	.theme-toggle {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: var(--transition-base);
	}
	.theme-toggle:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
		box-shadow: var(--shadow-sm);
	}
	.ico {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.ico {
			transition: none;
		}
	}
</style>
