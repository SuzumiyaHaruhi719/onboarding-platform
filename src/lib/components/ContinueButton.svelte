<script lang="ts">
	import { useI18n } from '$lib/i18n/context';
	import Icon from '$lib/components/Icon.svelte';

	let { enabled, onclick }: { enabled: boolean; onclick: () => void } = $props();
	const i18n = useI18n();
</script>

<button class="continue" disabled={!enabled} {onclick}>
	<span>{i18n().t('learn.continue')}</span>
	<span class="arrow" aria-hidden="true"><Icon name="arrow-right" size={18} /></span>
</button>
{#if !enabled}
	<p class="hint">{i18n().t('learn.locked')}</p>
{/if}

<style>
	.continue {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
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
		background: var(--brand-600);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}
	.continue:hover:not(:disabled) .arrow {
		transform: translateX(3px);
	}
	.arrow {
		transition: transform var(--transition-base);
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
	}
</style>
