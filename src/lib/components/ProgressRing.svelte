<script lang="ts">
	let { pct }: { pct: number } = $props();
	const value = $derived(Math.round(Math.max(0, Math.min(1, pct)) * 100));
</script>

<div class="ring" style="--p:{value}" role="img" aria-label={`${value}%`}>
	<span>{value}%</span>
</div>

<style>
	.ring {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto;
		background: conic-gradient(
			var(--brand-500) calc(var(--p) * 1%),
			var(--surface-subtle) 0
		);
		transition: background var(--transition-moderate);
	}
	.ring span {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--surface-elevated);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
		color: var(--text-brand);
	}
</style>
