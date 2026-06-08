<script lang="ts">
	import '@fontsource-variable/inter/index.css';
	import '@fontsource-variable/jetbrains-mono/index.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LangToggle from '$lib/components/LangToggle.svelte';
	import { setI18n, type I18n } from '$lib/i18n/context';
	import { translator } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Reactive translator bound to the current language; provided as a getter so
	// nested components re-render when the language changes.
	const i18n = $derived<I18n>({ t: translator(data.lang), lang: data.lang });
	setI18n(() => i18n);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="topnav">
	<a class="logo" href="/">{i18n.t('app.title')}</a>
	<div class="spacer"></div>
	<LangToggle lang={data.lang} />
	<ThemeToggle />
</nav>

<main class="app-main">
	{@render children()}
</main>

<style>
	.topnav {
		position: sticky;
		top: 0;
		z-index: 50;
		height: 56px;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--content-padding-x);
		background: var(--surface-elevated);
		border-bottom: 1px solid var(--border-default);
		backdrop-filter: blur(10px);
	}
	.logo {
		color: var(--text-brand);
		font-weight: 700;
		font-size: var(--text-lg);
	}
	.spacer {
		flex: 1;
	}
	.app-main {
		min-height: calc(100vh - 56px);
	}
</style>
