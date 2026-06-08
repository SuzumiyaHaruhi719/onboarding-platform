<script lang="ts">
	let { text, cite }: { text: string; cite?: string } = $props();
</script>

<blockquote>
	<p>{text}</p>
	{#if cite}<cite>— {cite}</cite>{/if}
</blockquote>

<style>
	blockquote {
		border-left: 3px solid var(--brand-500);
		background: var(--surface-subtle);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		margin: 0 0 var(--space-4);
	}
	blockquote p {
		margin: 0;
		color: var(--text-primary);
		font-style: italic;
	}
	cite {
		display: block;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
		font-style: normal;
		margin-top: var(--space-2);
	}
</style>
