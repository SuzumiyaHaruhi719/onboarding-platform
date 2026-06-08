<script lang="ts">
	import { useI18n } from '$lib/i18n/context';
	import type { DictKey } from '$lib/i18n';
	import type { SectionRequirementsView } from '$lib/content/types';

	let {
		requirements,
		reasons,
		complete
	}: { requirements: SectionRequirementsView; reasons: string[]; complete: boolean } = $props();

	const i18n = useI18n();

	interface Item {
		key: string;
		label: DictKey;
	}

	const items = $derived<Item[]>([
		{ key: 'scroll', label: 'chk.scroll' },
		...(requirements.minDwellMs > 0 ? [{ key: 'dwell', label: 'chk.dwell' as DictKey }] : []),
		...(requirements.hasVideo ? [{ key: 'video', label: 'chk.video' as DictKey }] : []),
		...(requirements.hasQuiz ? [{ key: 'quiz', label: 'chk.quiz' as DictKey }] : [])
	]);

	function isMet(key: string): boolean {
		return complete || !reasons.includes(key);
	}
</script>

<ul class="checklist">
	{#each items as item (item.key)}
		{@const met = isMet(item.key)}
		<li class:met>
			<span class="mark" class:met aria-hidden="true">{met ? '✓' : ''}</span>
			<span class="label">{i18n().t(item.label)}</span>
		</li>
	{/each}
</ul>

<style>
	.checklist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
		color: var(--text-tertiary);
		transition: color var(--transition-base);
	}
	li.met {
		color: var(--text-primary);
	}
	.mark {
		width: 20px;
		height: 20px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		border: 1.5px solid var(--border-strong);
		font-size: 11px;
		font-weight: 700;
		color: transparent;
		transition: var(--transition-base);
	}
	.mark.met {
		background: var(--brand-500);
		border-color: var(--brand-500);
		color: var(--text-inverse);
	}
</style>
