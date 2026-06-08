<script lang="ts">
	let { level, text }: { level: 2 | 3; text: string } = $props();
</script>

{#if level === 2}
	<h2>{text}</h2>
{:else}
	<h3>{text}</h3>
{/if}

<style>
	h2 {
		font-size: var(--text-2xl);
		font-weight: 800;
		color: var(--text-primary);
		margin: var(--space-8) 0 var(--space-3);
		line-height: 1.3;
		letter-spacing: 0;
	}
	h3 {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--text-primary);
		margin: var(--space-6) 0 var(--space-2);
		line-height: 1.4;
		letter-spacing: 0;
	}
</style>
