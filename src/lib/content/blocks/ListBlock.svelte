<script lang="ts">
	let { ordered, items }: { ordered: boolean; items: string[] } = $props();
</script>

{#if ordered}
	<ol>
		{#each items as item, i (i)}<li>{item}</li>{/each}
	</ol>
{:else}
	<ul>
		{#each items as item, i (i)}<li>{item}</li>{/each}
	</ul>
{/if}

<style>
	ol,
	ul {
		color: var(--text-secondary);
		padding-left: var(--space-6);
		margin: 0 0 var(--space-4);
	}
	li {
		margin: var(--space-1) 0;
		line-height: 1.7;
	}
</style>
