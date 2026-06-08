<script lang="ts">
	import { useI18n } from '$lib/i18n/context';
	import type { DictKey } from '$lib/i18n';

	let {
		enabled,
		reasons,
		onclick
	}: { enabled: boolean; reasons: string[]; onclick: () => void } = $props();

	const i18n = useI18n();

	const reasonMap: Record<string, DictKey> = {
		scroll: 'req.scroll',
		dwell: 'req.dwell',
		video: 'req.video',
		quiz: 'req.quiz'
	};

	const hint = $derived(
		reasons
			.map((r) => reasonMap[r])
			.filter((k): k is DictKey => !!k)
			.map((k) => i18n().t(k))
			.join(' · ') || i18n().t('learn.locked')
	);
</script>

<button class="continue" disabled={!enabled} {onclick} title={enabled ? '' : hint}>
	{i18n().t('learn.continue')} →
</button>
{#if !enabled}
	<p class="hint">{hint}</p>
{/if}

<style>
	.continue {
		width: 100%;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-lg);
		font-weight: 700;
		font-size: var(--text-base);
		cursor: pointer;
		background: var(--brand-500);
		color: var(--text-inverse);
		transition: var(--transition-base);
	}
	.continue:hover:not(:disabled) {
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}
	.continue:disabled {
		background: var(--surface-subtle);
		color: var(--text-disabled);
		cursor: not-allowed;
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		text-align: center;
		margin: var(--space-2) 0 0;
		line-height: 1.5;
	}
</style>
