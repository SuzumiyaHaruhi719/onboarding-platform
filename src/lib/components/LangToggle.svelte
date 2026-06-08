<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Lang } from '$lib/i18n';
	import { LANG_COOKIE } from '$lib/i18n';

	let { lang }: { lang: Lang } = $props();

	async function onClick(): Promise<void> {
		const next: Lang = lang === 'zh' ? 'en' : 'zh';
		document.cookie = `${LANG_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
		document.documentElement.lang = next;
		// Re-run server load functions so SSR-rendered text switches language cleanly.
		await invalidateAll();
	}
</script>

<button class="lang-toggle" onclick={onClick} aria-label="切换语言 / Switch language">
	{lang === 'zh' ? 'EN' : '中'}
</button>

<style>
	.lang-toggle {
		height: 36px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		border-radius: var(--radius-lg);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: var(--transition-base);
	}
	.lang-toggle:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
		box-shadow: var(--shadow-sm);
	}
</style>
