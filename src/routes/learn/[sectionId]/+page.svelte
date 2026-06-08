<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import ContinueButton from '$lib/components/ContinueButton.svelte';
	import { useI18n } from '$lib/i18n/context';
	import { startHeartbeat, type HeartbeatController } from '$lib/anti-skip/heartbeat';
	import type { VideoInterval } from '$lib/anti-skip/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const i18n = useI18n();

	let scrollEl = $state<HTMLElement | undefined>(undefined);
	let complete = $state(false);
	let reasons = $state<string[]>(['scroll']);
	let hb: HeartbeatController | null = null;

	const req = $derived(data.section.requirements);
	const totalChecks = $derived(
		1 +
			(req.minDwellMs > 0 ? 1 : 0) +
			(req.hasVideo ? 1 : 0) +
			(req.hasQuiz ? 1 : 0)
	);
	const pct = $derived(
		complete ? 1 : Math.max(0, (totalChecks - reasons.length) / totalChecks)
	);

	async function fetchCompletion(): Promise<{ complete: boolean; reasons: string[]; nextId: string | null } | null> {
		return fetch('/api/progress/complete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ sectionId: data.section.id })
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
		const el = scrollEl;
		const sectionId = data.section.id;
		if (!el) return;

		// reset per-section UI state
		complete = false;
		reasons = ['scroll'];

		hb = startHeartbeat({ sectionId, scrollEl: el });
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
			await invalidateAll(); // refresh sidebar lock/done states
			if (res.nextId) await goto(`/learn/${res.nextId}`);
		}
	}
</script>

<div class="reader">
	<article class="content" bind:this={scrollEl}>
		<h1>{data.section.title}</h1>
		{#each data.section.blocks as block (block.id)}
			<BlockRenderer
				{block}
				quizzes={data.section.quizzes}
				sectionId={data.section.id}
				onintervals={onIntervals}
				onpassed={onPassed}
			/>
		{/each}
		<div class="end-spacer"></div>
	</article>

	<aside class="rail">
		<div class="rail-t">{i18n().t('learn.progress')}</div>
		<ProgressRing {pct} />
		{#if complete}
			<p class="done">✓ {i18n().t('learn.done')}</p>
		{/if}
		<div class="rail-bottom">
			<ContinueButton enabled={complete} {reasons} onclick={onContinue} />
		</div>
	</aside>
</div>

<style>
	.reader {
		display: grid;
		grid-template-columns: 1fr 280px;
		height: calc(100vh - 56px);
	}
	.content {
		overflow-y: auto;
		padding: var(--space-8) var(--space-10);
		max-width: 860px;
		width: 100%;
		margin: 0 auto;
	}
	.content h1 {
		font-size: var(--text-3xl);
		color: var(--text-primary);
		margin: 0 0 var(--space-6);
	}
	.end-spacer {
		height: var(--space-16);
	}
	.rail {
		border-left: 1px solid var(--border-subtle);
		background: var(--surface-elevated);
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.rail-t {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
	}
	.done {
		text-align: center;
		color: var(--success);
		font-weight: 700;
		font-size: var(--text-sm);
		margin: 0;
	}
	.rail-bottom {
		margin-top: auto;
	}
	@media (max-width: 768px) {
		.reader {
			grid-template-columns: 1fr;
		}
		.rail {
			border-left: none;
			border-top: 1px solid var(--border-subtle);
		}
	}
</style>
