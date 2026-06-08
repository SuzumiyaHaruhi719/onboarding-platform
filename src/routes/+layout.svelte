<script lang="ts">
	import '@fontsource-variable/inter/index.css';
	import '@fontsource-variable/jetbrains-mono/index.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LangToggle from '$lib/components/LangToggle.svelte';
	import { onNavigate } from '$app/navigation';
	import { setI18n, type I18n } from '$lib/i18n/context';
	import { translator } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Smooth Apple-style crossfade between pages via the View Transitions API.
	// Browsers without support (or with reduced-motion) simply navigate instantly.
	onNavigate((navigation) => {
		const doc = document as Document & {
			startViewTransition?: (cb: () => Promise<void> | void) => void;
		};
		if (!doc.startViewTransition) return;
		return new Promise((resolve) => {
			doc.startViewTransition!(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// Reactive translator bound to the current language; provided as a getter so
	// nested components re-render when the language changes.
	const i18n = $derived<I18n>({ t: translator(data.lang), lang: data.lang });
	setI18n(() => i18n);
</script>

<svelte:head>
	<title>{i18n.t('app.title')} · Onboarding Platform</title>
	<meta
		name="description"
		content={data.lang === 'zh'
			? '新员工入职阅读、编辑与强制学习平台'
			: 'Onboarding reading, authoring, and enforced learning platform'}
	/>
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
		background: var(--nav-bg);
		border-bottom: 1px solid var(--border-default);
		backdrop-filter: blur(16px) saturate(1.4);
		-webkit-backdrop-filter: blur(16px) saturate(1.4);
	}
	.logo {
		color: var(--logo);
		font-weight: 700;
		font-size: var(--text-lg);
	}
	:global(:root[data-theme='dark']) .topnav {
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.035),
			0 16px 40px rgba(0, 0, 0, 0.28);
	}
	:global(:root[data-theme='dark']) .logo {
		text-shadow: 0 0 18px rgba(47, 212, 122, 0.18);
	}
	.spacer {
		flex: 1;
	}
	.app-main {
		min-height: calc(100vh - 56px);
	}
</style>
