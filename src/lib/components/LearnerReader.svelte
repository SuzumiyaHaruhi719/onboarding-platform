<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import ContinueButton from '$lib/components/ContinueButton.svelte';
	import RequirementChecklist from '$lib/components/RequirementChecklist.svelte';
	import ReadingProgress from '$lib/components/ReadingProgress.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context';
	import { startHeartbeat, type HeartbeatController } from '$lib/anti-skip/heartbeat';
	import type { VideoInterval, SectionView } from '$lib/content/types';

	let { section }: { section: SectionView } = $props();
	const i18n = useI18n();

	let complete = $state(false);
	let reasons = $state<string[]>(['scroll']);
	let hb: HeartbeatController | null = null;

	const req = $derived(section.requirements);
	const totalChecks = $derived(
		1 + (req.minDwellMs > 0 ? 1 : 0) + (req.hasVideo ? 1 : 0) + (req.hasQuiz ? 1 : 0)
	);
	const pct = $derived(complete ? 1 : Math.max(0, (totalChecks - reasons.length) / totalChecks));

	async function fetchCompletion(): Promise<{
		complete: boolean;
		reasons: string[];
		nextId: string | null;
	} | null> {
		return fetch('/api/progress/complete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ sectionId: section.id })
		})
			.then((r) => r.json())
			.catch(() => null);
	}

	async function refresh(): Promise<void> {
		const res = await fetchCompletion();
		if (res) {
			complete = !!res.complete;
			if (Array.isArray(res.reasons)) reasons = res.reasons;
		}
	}

	function onIntervals(intervals: VideoInterval[]): void {
		hb?.setIntervals(intervals);
	}

	function onPassed(): void {
		void refresh();
	}

	$effect(() => {
		const sectionId = section.id;

		complete = false;
		reasons = ['scroll'];

		hb = startHeartbeat({ sectionId });
		void refresh();
		const poll = setInterval(refresh, 4500);

		return () => {
			hb?.stop();
			hb = null;
			clearInterval(poll);
		};
	});

	async function onContinue(): Promise<void> {
		const res = await fetchCompletion();
		if (!res) return;
		complete = !!res.complete;
		if (Array.isArray(res.reasons)) reasons = res.reasons;
		if (res.complete) {
			await invalidateAll();
			if (res.nextId) await goto(`/learn/${res.nextId}`);
		}
	}
</script>

<ReadingProgress />

<div class="reader">
	<article class="content">
		<p class="eyebrow"><span class="dot"></span>{i18n().t('learn.eyebrow')}</p>
		<h1>{section.title}</h1>
		{#each section.blocks as block (block.id)}
			<BlockRenderer
				{block}
				quizzes={section.quizzes}
				sectionId={section.id}
				onintervals={onIntervals}
				onpassed={onPassed}
			/>
		{/each}
		<div class="end-spacer"></div>
	</article>

	<aside class="rail">
		<div class="rail-panel">
			<div class="rail-label">{i18n().t('learn.progress')}</div>
			<ProgressRing {pct} />

			<div class="rail-section">
				<div class="rail-label">{i18n().t('learn.requirements')}</div>
				<RequirementChecklist requirements={section.requirements} {reasons} {complete} />
			</div>

			{#if complete}
				<p class="done"><Icon name="circle-check" size={16} /> {i18n().t('learn.allDone')}</p>
			{/if}

			<ContinueButton enabled={complete} onclick={onContinue} />
		</div>
	</aside>
</div>

<style>
	.reader {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		align-items: start;
		max-width: 1200px;
		margin: 0 auto;
	}
	.content {
		padding: var(--space-12) var(--space-10) var(--space-16);
		max-width: 760px;
		width: 100%;
		margin: 0 auto;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-brand);
		margin: 0 0 var(--space-3);
	}
	.eyebrow .dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--brand-500);
	}
	.content h1 {
		font-size: var(--text-4xl);
		font-weight: 800;
		line-height: 1.2;
		color: var(--text-primary);
		margin: 0 0 var(--space-8);
		letter-spacing: -0.01em;
	}
	.end-spacer {
		height: var(--space-16);
	}
	.rail {
		position: sticky;
		top: calc(56px + var(--space-5));
		align-self: start;
		border-left: 1px solid var(--border-subtle);
		background: var(--surface-page);
		padding: var(--space-6);
	}
	.rail-panel {
		background: var(--surface-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-2xl);
		box-shadow: var(--shadow-sm);
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.rail-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		margin-bottom: var(--space-3);
	}
	.rail-section {
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-5);
	}
	.rail-section .rail-label {
		margin-bottom: var(--space-3);
	}
	.done {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		color: var(--success);
		font-weight: 700;
		font-size: var(--text-sm);
		margin: 0;
	}
	@media (max-width: 768px) {
		.reader {
			grid-template-columns: 1fr;
		}
		.rail {
			position: static;
			border-left: none;
			border-top: 1px solid var(--border-subtle);
		}
	}
</style>
