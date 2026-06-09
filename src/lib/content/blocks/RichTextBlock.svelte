<script lang="ts">
	import { renderMarkdown } from '$lib/content/markdown';
	let { markdown }: { markdown: string } = $props();
	const html = $derived(renderMarkdown(markdown));
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized in renderMarkdown -->
<div class="prose">{@html html}</div>

<style>
	.prose {
		color: var(--text-secondary);
		font-size: var(--text-base);
		line-height: 1.75;
	}
	.prose :global(h1),
	.prose :global(h2) {
		font-size: var(--text-2xl);
		font-weight: 800;
		color: var(--text-primary);
		margin: var(--space-8) 0 var(--space-3);
		line-height: 1.3;
		letter-spacing: 0;
	}
	.prose :global(h3) {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--text-primary);
		margin: var(--space-6) 0 var(--space-2);
		line-height: 1.4;
		letter-spacing: 0;
	}
	.prose :global(h1):first-child,
	.prose :global(h2):first-child,
	.prose :global(h3):first-child {
		margin-top: 0;
	}
	.prose :global(p) {
		margin: 0 0 var(--space-4);
	}
	.prose :global(ul),
	.prose :global(ol) {
		padding-left: var(--space-6);
		margin: 0 0 var(--space-4);
	}
	.prose :global(li) {
		margin: var(--space-1) 0;
	}
	.prose :global(blockquote) {
		border-left: 3px solid var(--brand-500);
		background: var(--surface-subtle);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		margin: 0 0 var(--space-4);
		color: var(--text-primary);
		font-style: italic;
	}
	.prose :global(blockquote p) {
		margin: 0;
	}
	.prose :global(a) {
		color: var(--text-brand);
		text-decoration: underline;
	}
	.prose :global(strong) {
		color: var(--text-primary);
		font-weight: 700;
	}
	.prose :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
		background: var(--surface-subtle);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
	}
	.prose :global(pre) {
		background: var(--surface-subtle);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		overflow-x: auto;
		margin: 0 0 var(--space-4);
	}
	.prose :global(pre code) {
		background: none;
		padding: 0;
	}
	.prose :global(img),
	.prose :global(video) {
		display: block;
		width: min(100%, 780px);
		max-height: 520px;
		object-fit: contain;
		margin: var(--space-5) 0;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-subtle);
		box-shadow: var(--shadow-sm);
	}
	.prose :global(video) {
		aspect-ratio: 16 / 9;
	}
	.prose :global(hr) {
		border: none;
		border-top: 1px solid var(--border-default);
		margin: var(--space-6) 0;
	}
	.prose :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 0 0 var(--space-4);
		font-size: var(--text-sm);
	}
	.prose :global(th),
	.prose :global(td) {
		border: 1px solid var(--border-default);
		padding: var(--space-2) var(--space-3);
		text-align: left;
	}
	.prose :global(th) {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}
</style>
