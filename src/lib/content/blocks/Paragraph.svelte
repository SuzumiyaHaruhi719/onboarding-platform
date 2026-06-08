<script lang="ts">
	let { text }: { text: string } = $props();
</script>

<p>{text}</p>

<style>
	p {
		color: var(--text-secondary);
		font-size: var(--text-base);
		line-height: 1.75;
		margin: 0 0 var(--space-4);
	}
</style>
