<script lang="ts">
	let { src, alt, caption }: { src: string; alt: string; caption?: string } = $props();
</script>

<figure>
	<img {src} {alt} loading="lazy" />
	{#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
	figure {
		margin: 0 0 var(--space-4);
	}
	img {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: var(--radius-xl);
		border: 1px solid var(--border-default);
	}
	figcaption {
		font-size: var(--text-sm);
		color: var(--text-tertiary);
		margin-top: var(--space-2);
	}
</style>
